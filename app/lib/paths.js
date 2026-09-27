const fs = require("fs");
const path = require("path");

function repoRoot() {
  return path.join(__dirname, "..", "..");
}

function appDir() {
  return path.join(__dirname, "..");
}

function isPackaged() {
  return Boolean(process.versions && process.versions.electron) && !process.defaultApp;
}

function bundledPacksDir() {
  if (isPackaged() && process.resourcesPath) {
    return path.join(process.resourcesPath, "packs");
  }
  return path.join(repoRoot(), "packs");
}

function voiceRuntimeDir() {
  if (isPackaged() && process.resourcesPath) {
    return path.join(process.resourcesPath, "voice");
  }
  return path.join(appDir(), "vendor", "voice");
}

function userDataDir(electronApp) {
  if (electronApp && typeof electronApp.getPath === "function") {
    return electronApp.getPath("userData");
  }
  if (process.env.PET_USER_DATA) return process.env.PET_USER_DATA;
  return path.join(repoRoot(), ".user-data");
}

function importedPacksDir(userData) {
  return path.join(userData, "imported-packs");
}

function packCacheDir(userData) {
  return path.join(userData, "pack-cache");
}

function memoryDir(userData) {
  return path.join(userData, "memory");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  repoRoot,
  appDir,
  isPackaged,
  bundledPacksDir,
  voiceRuntimeDir,
  userDataDir,
  importedPacksDir,
  packCacheDir,
  memoryDir,
  ensureDir,
};
