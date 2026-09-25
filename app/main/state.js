const { app } = require("electron");
const path = require("path");
const paths = require("../lib/paths");
const settingsLib = require("../lib/settings");
const { listPacksFromDirs, findPack } = require("../lib/packs");

const BUBBLE_SLOT = 240;
const BUNDLED_PACKS = paths.bundledPacksDir();

const state = {
  petWindow: null,
  chatWindow: null,
  lastChatBounds: null,
  composeWindow: null,
  petMenuWindow: null,
  settingsWindow: null,
  tray: null,
  setupWindow: null,
  voiceBusy: false,
  voiceHotkeyArmed: false,
  voicePhase: "idle",
  voiceSource: "hotkey",
  composeOpen: false,
  petComposeHover: false,
  composerHover: false,
  composeHoverCloseTimer: null,
  composeExpanded: false,
  composeVoicePin: false,
  hiddenByFullscreen: false,
  nudgePos: null,
  petOuterSize: null,
  appliedPetContent: null,
  composeBlurArmed: false,
};

function appFile(...parts) {
  return path.join(paths.appDir(), ...parts);
}

function userData() {
  return paths.userDataDir(app);
}

function importedDir() {
  return paths.ensureDir(paths.importedPacksDir(userData()));
}

function cacheDir() {
  return paths.ensureDir(paths.packCacheDir(userData()));
}

function packDirs() {
  return [BUNDLED_PACKS, importedDir()];
}

function loadSettings() {
  return settingsLib.loadSettings(userData());
}

function saveSettings(partial) {
  return settingsLib.saveSettings(userData(), partial);
}

function allPacks() {
  return listPacksFromDirs(packDirs(), { cacheDir: cacheDir() });
}

function currentPack() {
  const settings = loadSettings();
  return findPack(packDirs(), settings.packId, { cacheDir: cacheDir() });
}

function depsCtx() {
  const depsRoot = paths.ensureDir(paths.depsRoot(userData()));
  return {
    depsRoot,
    settings: loadSettings(),
    onProgress: (p) => {
      const win = state.setupWindow;
      if (win && !win.isDestroyed()) win.webContents.send("deps-progress", p);
    },
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

module.exports = {
  state,
  BUBBLE_SLOT,
  BUNDLED_PACKS,
  appFile,
  userData,
  importedDir,
  cacheDir,
  packDirs,
  loadSettings,
  saveSettings,
  allPacks,
  currentPack,
  depsCtx,
  clamp,
};
