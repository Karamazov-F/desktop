const fs = require("fs");
const path = require("path");
const { decryptToDir, isDpetFile } = require("./dpet");
const { ensureDir, packCacheDir } = require("./paths");

function listPacks(packsDir) {
  return listPacksFromDirs([packsDir]);
}

function listPacksFromDirs(dirs, { cacheDir } = {}) {
  const byId = new Map();
  for (const dir of dirs.filter(Boolean)) {
    if (!fs.existsSync(dir)) continue;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".") || ent.name === "_author") continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const pack = readPack(dir, ent.name);
        if (pack) byId.set(pack.id, pack);
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
  const marker = path.join(dest, "pack.json");
  if (!fs.existsSync(marker)) {
    ensureDir(cacheDir);
    decryptToDir(filePath, dest);
  }
  return readPack(path.dirname(dest), path.basename(dest));
}

function importDpet(filePath, importedDir, cacheDir) {
  ensureDir(importedDir);
  const destFile = path.join(importedDir, path.basename(filePath));
  fs.copyFileSync(filePath, destFile);
  return readDpetPack(destFile, cacheDir);
}

function importFolder(srcDir, importedDir) {
  const pack = readPack(path.dirname(srcDir), path.basename(srcDir));
  if (!pack) throw new Error("文件夹里没有有效的 pack.json / idle");
  const dest = path.join(importedDir, pack.id);
  copyDir(srcDir, dest);
  return readPack(importedDir, pack.id);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === "_author" || ent.name === "node_modules") continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/**
 * states 支持两种写法：
 * - "sprites/idle.png"（旧）
 * - { frames: ["a.png","b.png"], fps: 6, loop: true }
 */
function normalizeState(dir, key, value) {
  if (typeof value === "string") {
    const abs = path.join(dir, value);
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
    const abs = path.join(dir, rel);
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

function readPack(packsDir, packId) {
  const dir = path.join(packsDir, packId);
  const manifestPath = path.join(dir, "pack.json");
  if (!fs.existsSync(manifestPath)) return null;
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const states = {};
  for (const [key, value] of Object.entries(raw.states || {})) {
    const normalized = normalizeState(dir, key, value);
    if (normalized) states[key] = normalized;
  }
  if (!states.idle) return null;
  const persona =
    raw.persona && typeof raw.persona === "object" ? raw.persona : null;
  const dialogue =
    raw.dialogue && typeof raw.dialogue === "object" ? raw.dialogue : null;
  return {
    id: raw.id || packId,
    name: (persona && persona.displayName) || raw.name || packId,
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
};
