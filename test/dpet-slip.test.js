const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const dpet = require("../app/lib/dpet");
const packs = require("../app/lib/packs");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dpet-slip-"));
}

const BAD_PATHS = [
  ["parent traversal", "../pwned.txt"],
  ["nested traversal", "nested/../../pwned.txt"],
  ["backslash traversal", "..\\pwned.txt"],
  ["posix absolute", "/tmp/pwned.txt"],
  ["drive absolute", "C:/Windows/pwned.txt"],
  ["unc", "\\\\server\\share\\pwned.txt"],
];

for (const [label, rel] of BAD_PATHS) {
  test(`rejects a .dpet entry with ${label}`, () => {
    const parent = tmpDir();
    const dest = path.join(parent, "dest");
    const archive = path.join(parent, "evil.dpet");
    dpet.encryptFiles(
      [
        { rel, data: Buffer.from("nope") },
        { rel: "sprites/ok.txt", data: Buffer.from("should-not-land") },
      ],
      archive,
      { id: "evil-pack" }
    );
    assert.throws(() => dpet.decryptToDir(archive, dest), /非法路径/);
    assert.equal(fs.existsSync(path.join(dest, "sprites", "ok.txt")), false);
    assert.equal(fs.existsSync(dest), false);
  });
}

test("imports a normal .dpet and keeps every file inside the destination", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  const dest = path.join(parent, "out");
  fs.mkdirSync(path.join(src, "sprites"), { recursive: true });
  fs.writeFileSync(
    path.join(src, "pack.json"),
    JSON.stringify({
      id: "ok-pack",
      name: "ok",
      states: { idle: "sprites/idle.png" },
    })
  );
  fs.writeFileSync(path.join(src, "sprites", "idle.png"), Buffer.from("png"));
  const archive = path.join(parent, "ok.dpet");
  dpet.encryptDir(src, archive);

  const result = dpet.decryptToDir(archive, dest);
  assert.equal(result.dir, dest);
  assert.equal(
    fs.readFileSync(path.join(dest, "sprites", "idle.png"), "utf8"),
    "png"
  );
  assert.equal(fs.existsSync(path.join(dest, "pack.json")), true);
  const escaped = fs.readdirSync(parent).some((name) => name.startsWith(".."));
  assert.equal(escaped, false);
});

test("importFolder rejects a pack id outside the safe charset", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  const imported = path.join(parent, "imported");
  fs.mkdirSync(path.join(src, "sprites"), { recursive: true });
  fs.writeFileSync(path.join(src, "sprites", "idle.png"), Buffer.from("png"));
  fs.writeFileSync(
    path.join(src, "pack.json"),
    JSON.stringify({
      id: "../escape",
      name: "bad",
      states: { idle: "sprites/idle.png" },
    })
  );
  fs.mkdirSync(imported);

  assert.throws(() => packs.importFolder(src, imported), /这个角色包无法使用，请向角色包作者重新获取/);
  assert.equal(fs.existsSync(path.join(parent, "escape")), false);
  assert.equal(fs.existsSync(path.join(imported, "escape")), false);
  assert.deepEqual(fs.readdirSync(imported), []);
});

test("importFolder copies a normal pack under its safe id", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  const imported = path.join(parent, "imported");
  fs.mkdirSync(path.join(src, "sprites"), { recursive: true });
  fs.writeFileSync(path.join(src, "sprites", "idle.png"), Buffer.from("png"));
  fs.writeFileSync(
    path.join(src, "pack.json"),
    JSON.stringify({
      id: "ok-pack",
      name: "ok",
      persona: { displayName: "好" },
      states: { idle: "sprites/idle.png" },
    })
  );
  fs.mkdirSync(imported);

  const pack = packs.importFolder(src, imported);
  assert.equal(pack.id, "ok-pack");
  assert.equal(
    fs.existsSync(path.join(imported, "ok-pack", "sprites", "idle.png")),
    true
  );
  assert.equal(fs.existsSync(path.join(parent, "ok-pack")), false);
});
