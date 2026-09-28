const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const dpet = require("../app/lib/dpet");
const packs = require("../app/lib/packs");

function fixture(root, folder, version, id = "pet-one") {
  const dir = path.join(root, folder);
  fs.mkdirSync(path.join(dir, "sprites"), { recursive: true });
  fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify({
    id,
    version,
    states: { idle: "sprites/idle.png" },
  }));
  fs.writeFileSync(path.join(dir, "sprites", "idle.png"), version);
  return dir;
}

function files(root) {
  return {
    imported: path.join(root, "imported"),
    cache: path.join(root, "cache"),
  };
}

function folderVersion(imported, id = "pet-one") {
  return fs.readFileSync(path.join(imported, id, "sprites", "idle.png"), "utf8");
}

function archiveVersion(archive) {
  const file = dpet.parseArchive(fs.readFileSync(archive)).files.find((entry) => entry.rel === "sprites/idle.png");
  return file.data.toString("utf8");
}

function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pet-import-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("folder import accepts display names with Chinese, spaces, and uppercase when pack id is safe", (t) => {
  const root = temp(t);
  const { imported } = files(root);
  for (const [folder, id] of [["中文角色", "pet-cn"], ["Space Role", "pet-space"], ["UPPERCASE", "pet-upper"]]) {
    const source = fixture(root, folder, "v1", id);
    const pack = packs.importFolder(source, imported);
    assert.equal(pack.id, id);
    assert.equal(folderVersion(imported, id), "v1");
  }
});

test("folder copy failure leaves the old pack intact", (t) => {
  const root = temp(t);
  const { imported } = files(root);
  packs.importFolder(fixture(root, "old", "v1"), imported);
  const source = fixture(root, "new", "v2");
  assert.throws(() => packs.importFolder(source, imported, {
    copyFileSync(from, to) {
      if (from.endsWith("idle.png")) throw new Error("copy interrupted");
      fs.copyFileSync(from, to);
    },
  }), /copy interrupted/);
  assert.equal(folderVersion(imported), "v1");
  assert.equal(packs.readPack(imported, "pet-one").version, "v1");
});

test("folder switch failure after backing up restores the old pack", (t) => {
  const root = temp(t);
  const { imported } = files(root);
  packs.importFolder(fixture(root, "old", "v1"), imported);
  assert.throws(() => packs.importFolder(fixture(root, "new", "v2"), imported, {
    renameSync(from, to) {
      if (path.basename(from).startsWith(".import-folder-")) throw new Error("switch interrupted");
      fs.renameSync(from, to);
    },
  }), /switch interrupted/);
  assert.equal(folderVersion(imported), "v1");
  assert.equal(fs.existsSync(path.join(imported, "pet-one.bak-folder-import")), false);
});

test("startup rolls back a folder switch interrupted before its commit marker", (t) => {
  const root = temp(t);
  const { imported } = files(root);
  packs.importFolder(fixture(root, "old", "v1"), imported);
  const source = fixture(root, "new", "v2");
  const dest = path.join(imported, "pet-one");
  const backup = `${dest}.bak-folder-import`;
  const staging = fs.mkdtempSync(path.join(imported, ".import-folder-"));
  fs.cpSync(source, staging, { recursive: true });
  fs.renameSync(dest, backup);
  fs.renameSync(staging, dest);

  assert.equal(folderVersion(imported), "v2");
  packs.cleanStagingDirs(imported);
  assert.equal(folderVersion(imported), "v1");
  assert.equal(packs.readPack(imported, "pet-one").version, "v1");
  assert.equal(fs.existsSync(backup), false);
  assert.equal(fs.existsSync(`${dest}.import-committed`), false);
});

test("folder cleanup failure keeps the committed new pack across restart", (t) => {
  const root = temp(t);
  const { imported } = files(root);
  packs.importFolder(fixture(root, "old", "v1"), imported);
  const next = packs.importFolder(fixture(root, "new", "v2"), imported, {
    rmSync(target, options) {
      if (target.endsWith(".bak-folder-import")) throw new Error("backup busy");
      fs.rmSync(target, options);
    },
  });
  assert.equal(next.version, "v2");
  assert.equal(folderVersion(imported), "v2");
  assert.equal(fs.existsSync(path.join(imported, "pet-one.bak-folder-import")), true);
  assert.equal(fs.existsSync(path.join(imported, "pet-one.import-committed")), true);
  packs.cleanStagingDirs(imported);
  assert.equal(folderVersion(imported), "v2");
  assert.equal(fs.existsSync(path.join(imported, "pet-one.bak-folder-import")), false);
  assert.equal(fs.existsSync(path.join(imported, "pet-one.import-committed")), false);
});

test("startup restores old folder when committed new folder is damaged", (t) => {
  const root = temp(t);
  const { imported } = files(root);
  packs.importFolder(fixture(root, "old", "v1"), imported);
  packs.importFolder(fixture(root, "new", "v2"), imported, {
    rmSync(target, options) {
      if (target.endsWith(".bak-folder-import")) throw new Error("backup busy");
      fs.rmSync(target, options);
    },
  });
  fs.rmSync(path.join(imported, "pet-one", "sprites", "idle.png"));
  packs.cleanStagingDirs(imported);
  assert.equal(folderVersion(imported), "v1");
  assert.equal(fs.existsSync(path.join(imported, "pet-one.import-committed")), false);
});

test("dpet backup preparation failure leaves the old archive", (t) => {
  const root = temp(t);
  const { imported, cache } = files(root);
  const old = path.join(root, "old.dpet");
  const next = path.join(root, "next.dpet");
  dpet.encryptDir(fixture(root, "old", "v1"), old);
  dpet.encryptDir(fixture(root, "new", "v2"), next);
  fs.mkdirSync(imported);
  const dest = path.join(imported, "next.dpet");
  fs.copyFileSync(old, dest);
  assert.throws(() => packs.importDpet(next, imported, cache, {
    copyFileSync(from, to) {
      if (to.endsWith(".bak-import.partial")) throw new Error("backup interrupted");
      fs.copyFileSync(from, to);
    },
  }), /backup interrupted/);
  assert.equal(archiveVersion(dest), "v1");
});

test("dpet switch failure before commit marker restores the old archive", (t) => {
  const root = temp(t);
  const { imported, cache } = files(root);
  const old = path.join(root, "old.dpet");
  const next = path.join(root, "next.dpet");
  dpet.encryptDir(fixture(root, "old", "v1"), old);
  dpet.encryptDir(fixture(root, "new", "v2"), next);
  fs.mkdirSync(imported);
  const dest = path.join(imported, "next.dpet");
  fs.copyFileSync(old, dest);
  assert.throws(() => packs.importDpet(next, imported, cache, {
    renameSync(from, to) {
      if (path.basename(from).startsWith(".import-")) throw new Error("cache interrupted");
      fs.renameSync(from, to);
    },
  }), /cache interrupted/);
  assert.equal(archiveVersion(dest), "v1");
  assert.equal(fs.existsSync(path.join(imported, "next.dpet.bak-import")), false);
});

test("startup rolls back a dpet switch interrupted before its commit marker", (t) => {
  const root = temp(t);
  const { imported } = files(root);
  const old = path.join(root, "old.dpet");
  const next = path.join(root, "next.dpet");
  dpet.encryptDir(fixture(root, "old", "v1"), old);
  dpet.encryptDir(fixture(root, "new", "v2"), next);
  fs.mkdirSync(imported);
  const dest = path.join(imported, "next.dpet");
  const backup = `${dest}.bak-import`;
  fs.copyFileSync(old, dest);
  fs.copyFileSync(dest, backup);
  fs.copyFileSync(next, dest);

  assert.equal(archiveVersion(dest), "v2");
  packs.cleanStagingDirs(imported);
  assert.equal(archiveVersion(dest), "v1");
  assert.equal(fs.existsSync(backup), false);
  assert.equal(fs.existsSync(`${dest}.import-committed`), false);
});

test("dpet cleanup failure keeps the committed new archive across restart", (t) => {
  const root = temp(t);
  const { imported, cache } = files(root);
  const old = path.join(root, "old.dpet");
  const next = path.join(root, "next.dpet");
  dpet.encryptDir(fixture(root, "old", "v1"), old);
  dpet.encryptDir(fixture(root, "new", "v2"), next);
  fs.mkdirSync(imported);
  const dest = path.join(imported, "next.dpet");
  fs.copyFileSync(old, dest);
  const pack = packs.importDpet(next, imported, cache, {
    rmSync(target, options) {
      if (target.endsWith(".bak-import")) throw new Error("backup busy");
      fs.rmSync(target, options);
    },
  });
  assert.equal(pack.version, "v2");
  assert.equal(archiveVersion(dest), "v2");
  assert.equal(fs.existsSync(`${dest}.bak-import`), true);
  assert.equal(fs.existsSync(`${dest}.import-committed`), true);
  packs.cleanStagingDirs(imported);
  assert.equal(archiveVersion(dest), "v2");
  assert.equal(fs.existsSync(`${dest}.bak-import`), false);
  assert.equal(fs.existsSync(`${dest}.import-committed`), false);
});

test("startup restores old dpet when committed new archive is damaged", (t) => {
  const root = temp(t);
  const { imported, cache } = files(root);
  const old = path.join(root, "old.dpet");
  const next = path.join(root, "next.dpet");
  dpet.encryptDir(fixture(root, "old", "v1"), old);
  dpet.encryptDir(fixture(root, "new", "v2"), next);
  fs.mkdirSync(imported);
  const dest = path.join(imported, "next.dpet");
  fs.copyFileSync(old, dest);
  packs.importDpet(next, imported, cache, {
    rmSync(target, options) {
      if (target.endsWith(".bak-import")) throw new Error("backup busy");
      fs.rmSync(target, options);
    },
  });
  fs.writeFileSync(dest, "damaged");
  packs.cleanStagingDirs(imported);
  assert.equal(archiveVersion(dest), "v1");
  assert.equal(fs.existsSync(`${dest}.import-committed`), false);
});
