const fs = require("fs");
const path = require("path");
const { decryptToDir, isDpetFile, COMPLETE_MARKER } = require("./dpet");
const { ensureDir, packCacheDir } = require("./paths");
const { isSafePackId, resolveInside } = require("./safe-path");

const TRANSIENT_IO = new Set([
  "ENOENT",
  "EIO",
  "ENOSPC",
  "EACCES",
  "EPERM",
  "EBUSY",
  "EMFILE",
  "ENFILE",
  "EROFS",
  "EAGAIN",
  "EBADF",
  "EISDIR",
  "UNKNOWN",
]);

function isPermanentPackError(err) {
  const code = err && err.code;
  if (code && TRANSIENT_IO.has(code)) return false;
  return true;
}

function cleanStagingDirs(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn("clean staging", err.message);
    return;
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    try {
      if (ent.isDirectory() && (ent.name.startsWith(".import-") || ent.name.startsWith(".unpack-"))) {
        fs.rmSync(abs, { recursive: true, force: true });
        continue;
      }
      if (ent.isFile() && (ent.name.endsWith(".bak-import") || ent.name.endsWith(".dpet.partial"))) {
        fs.rmSync(abs, { force: true });
      }
    } catch (err) {
      console.warn("clean staging", abs, err && (err.code || err.message));
    }
  }
}

function rememberPackFailure(dest, err) {
  fs.rmSync(dest, { recursive: true, force: true });
  if (!isPermanentPackError(err)) return false;
  try {
    fs.writeFileSync(`${dest}.rejected`, String(err && err.message ? err.message : "rejected"));
  } catch (_) {}
  return true;
}

function rollbackImport({ destFile, partialFile, staging, backup, replaced, hadPrevious }) {
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(partialFile, { force: true });
  if (replaced) {
    fs.rmSync(destFile, { force: true });
    if (hadPrevious && backup && fs.existsSync(backup)) fs.renameSync(backup, destFile);
  } else if (backup) {
    fs.rmSync(backup, { force: true });
  }
}

function listPacks(packsDir) {
  return listPacksFromDirs([packsDir]);
}

function listPacksFromDirs(dirs, { cacheDir } = {}) {
  if (cacheDir) cleanStagingDirs(cacheDir);
  const byId = new Map();
  for (const dir of dirs.filter(Boolean)) {
    cleanStagingDirs(dir);
    if (!fs.existsSync(dir)) continue;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".") || ent.name === "_author") continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        try {
          const pack = readPack(dir, ent.name);
          if (pack) byId.set(pack.id, pack);
        } catch (err) {
          console.warn("skip pack", ent.name, err.message);
        }
        continue;
      }
      if (ent.isFile() && isDpetFile(ent.name) && cacheDir) {
        try {
          const pack = readDpetPack(abs, cacheDir);
          if (pack) byId.set(pack.id, pack);
        } catch (err) {
          console.warn("skip dpet", ent.name, err.message);
        }
      }
    }
  }
  return [...byId.values()];
}

function cacheKeyForDpet(filePath) {
  const st = fs.statSync(filePath);
  const base = path.basename(filePath, ".dpet").replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${base}_${st.mtimeMs.toString(16)}_${st.size.toString(16)}`;
}

function readDpetPack(filePath, cacheDir) {
  const key = cacheKeyForDpet(filePath);
  const dest = path.join(cacheDir, key);
  const rejected = `${dest}.rejected`;
  if (fs.existsSync(rejected)) return null;
  if (!fs.existsSync(path.join(dest, COMPLETE_MARKER))) {
    try {
      ensureDir(cacheDir);
      fs.rmSync(dest, { recursive: true, force: true });
      decryptToDir(filePath, dest);
      const pack = readPackDir(dest);
      if (!pack || !isSafePackId(pack.id)) {
        fs.rmSync(dest, { recursive: true, force: true });
        fs.writeFileSync(rejected, "invalid");
        return null;
      }
    } catch (err) {
      rememberPackFailure(dest, err);
      throw err;
    }
  }
  return readPackDir(dest);
}

function importDpet(filePath, importedDir, cacheDir, io) {
  const copyFileSync = (io && io.copyFileSync) || fs.copyFileSync;
  const renameSync = (io && io.renameSync) || fs.renameSync;
  const rmSync = (io && io.rmSync) || fs.rmSync;
  ensureDir(importedDir);
  ensureDir(cacheDir);
  cleanStagingDirs(cacheDir);
  cleanStagingDirs(importedDir);
  const base = path.basename(filePath);
  if (!isDpetFile(base)) throw new Error("请选择 .dpet 角色包文件");
  if (base !== path.basename(base)) {
    throw new Error("这个角色包无法使用，请向角色包作者重新获取");
  }
  const destFile = resolveInside(importedDir, base);
  const staging = fs.mkdtempSync(path.join(cacheDir, ".import-"));
  const partialFile = `${destFile}.partial`;
  const backup = `${destFile}.bak-import`;
  let replaced = false;
  let hadPrevious = false;
  try {
    decryptToDir(filePath, staging);
    const pack = readPackDir(staging);
    if (!pack || !isSafePackId(pack.id)) throw new Error("这个角色包无法使用，请向角色包作者重新获取");
    if (fs.existsSync(destFile)) {
      copyFileSync(destFile, backup);
      hadPrevious = true;
    }
    copyFileSync(filePath, partialFile);
    renameSync(partialFile, destFile);
    replaced = true;
    const cacheDest = path.join(cacheDir, cacheKeyForDpet(destFile));
    rmSync(cacheDest, { recursive: true, force: true });
    renameSync(staging, cacheDest);
    if (hadPrevious) rmSync(backup, { force: true });
    return readPackDir(cacheDest);
  } catch (err) {
    rollbackImport({
      destFile,
      partialFile,
      staging,
      backup: hadPrevious ? backup : null,
      replaced,
      hadPrevious,
    });
    throw err;
  }
}

function importFolder(srcDir, importedDir) {
  const manifestPath = path.join(srcDir, "pack.json");
  if (!fs.existsSync(manifestPath)) throw new Error("这个角色包无法使用，请向角色包作者重新获取");
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error("这个角色包无法使用，请向角色包作者重新获取");
  }
  const id = (raw && raw.id) || path.basename(srcDir);
  if (!isSafePackId(id)) throw new Error("这个角色包无法使用，请向角色包作者重新获取");
  const pack = readPack(path.dirname(srcDir), path.basename(srcDir));
  if (!pack || !isSafePackId(pack.id)) throw new Error("这个角色包无法使用，请向角色包作者重新获取");
  const dest = resolveInside(importedDir, pack.id);
  copyDir(srcDir, dest);
  return readPack(importedDir, pack.id);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === "_author" || ent.name === "node_modules") continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    let st;
    try {
      st = fs.lstatSync(from);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) copyDir(from, to);
    else if (st.isFile()) fs.copyFileSync(from, to);
  }
}

/**
 * states 支持两种写法：
 * - "sprites/idle.png"（旧）
 * - { frames: ["a.png","b.png"], fps: 6, loop: true }
 */
function normalizeState(dir, key, value) {
  if (typeof value === "string") {
    let abs;
    try {
      abs = resolveInside(dir, value);
    } catch {
      return null;
    }
    if (!fs.existsSync(abs)) return null;
    return {
      name: key,
      frames: [pathToFileUrl(abs)],
      fps: 1,
      loop: key === "idle" || key === "sleep" || key === "blink",
    };
  }
  if (!value || typeof value !== "object") return null;
  const rels = Array.isArray(value.frames)
    ? value.frames
    : value.file
      ? [value.file]
      : [];
  const frames = [];
  for (const rel of rels) {
    let abs;
    try {
      abs = resolveInside(dir, String(rel));
    } catch {
      continue;
    }
    if (fs.existsSync(abs)) frames.push(pathToFileUrl(abs));
  }
  if (!frames.length) return null;
  const loopDefault = key === "idle" || key === "sleep" || key === "blink";
  const out = {
    name: key,
    frames,
    fps: Number(value.fps) > 0 ? Number(value.fps) : 6,
    loop: value.loop != null ? Boolean(value.loop) : loopDefault,
    pingpong: Boolean(value.pingpong),
  };
  if (typeof value.label === "string" && value.label.trim()) {
    out.label = value.label.trim();
  }
  return out;
}

function readPackDir(dir) {
  const manifestPath = path.join(dir, "pack.json");
  if (!fs.existsSync(manifestPath)) return null;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
  const states = {};
  for (const [key, value] of Object.entries(raw.states || {})) {
    const normalized = normalizeState(dir, key, value);
    if (normalized) states[key] = normalized;
  }
  if (!states.idle) return null;
  const folder = path.basename(dir);
  const id = raw.id || (isSafePackId(folder) ? folder : "");
  if (!isSafePackId(id)) return null;
  const persona =
    raw.persona && typeof raw.persona === "object" ? raw.persona : null;
  const dialogue =
    raw.dialogue && typeof raw.dialogue === "object" ? raw.dialogue : null;
  return {
    id,
    name: (persona && persona.displayName) || raw.name || id,
    version: raw.version || "0.1.0",
    author: raw.author || "",
    license: raw.license || "",
    size: raw.size || { width: 128, height: 128 },
    persona,
    dialogue,
    states,
    actions: Object.keys(states).filter((k) => !["idle", "blink"].includes(k)),
    dir,
  };
}

function readPack(packsDir, packId) {
  if (!isSafePackId(packId)) return null;
  let dir;
  try {
    dir = resolveInside(packsDir, packId);
  } catch {
    return null;
  }
  return readPackDir(dir);
}

function pathToFileUrl(p) {
  const normalized = p.replace(/\\/g, "/");
  if (/^[a-zA-Z]:/.test(normalized)) {
    return "file:///" + normalized;
  }
  return "file://" + normalized;
}

function findPack(dirs, packId, { cacheDir } = {}) {
  const all = listPacksFromDirs(dirs, { cacheDir });
  return all.find((p) => p.id === packId) || all[0] || null;
}

module.exports = {
  listPacks,
  listPacksFromDirs,
  readPack,
  readDpetPack,
  importDpet,
  importFolder,
  findPack,
  packCacheDir,
  cacheKeyForDpet,
  isPermanentPackError,
  rememberPackFailure,
  cleanStagingDirs,
  rollbackImport,
};
