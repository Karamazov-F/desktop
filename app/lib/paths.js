const fs = require("fs");
const path = require("path");

function repoRoot() {
  return path.join(__dirname, "..", "..");
}

function appDir() {
  return path.join(__dirname, "..");
}

function bundledPacksDir() {
  return path.join(repoRoot(), "packs");
}

function userDataDir(electronApp) {
  if (electronApp && typeof electronApp.getPath === "function") {
    return path.join(electronApp.getPath("userData"), "desktop-pet-custom");
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

function depsRoot(_userData) {
  return path.join(repoRoot(), ".deps");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  repoRoot,
  appDir,
  bundledPacksDir,
  userDataDir,
  importedPacksDir,
  packCacheDir,
  memoryDir,
  depsRoot,
  ensureDir,
};
