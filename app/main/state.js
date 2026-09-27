const { app, safeStorage } = require("electron");
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

function keyOpts() {
  let available = false;
  try {
    available = safeStorage.isEncryptionAvailable();
  } catch (_) {
    available = false;
  }
  if (!available) {
    return {
      encryptionAvailable: false,
      sealKey() {
        throw new Error("系统加密不可用，无法保存 API Key");
      },
      openKey() {
        throw new Error("系统加密不可用");
      },
    };
  }
  return {
    encryptionAvailable: true,
    sealKey(plain) {
      return safeStorage.encryptString(String(plain)).toString("base64");
    },
    openKey(enc) {
      return safeStorage.decryptString(Buffer.from(String(enc), "base64"));
    },
  };
}

function presentSettings(settings) {
  const opts = keyOpts();
  return settingsLib.publicSettings(settings, { encryptionAvailable: opts.encryptionAvailable });
}

function loadSettings() {
  return settingsLib.loadSettings(userData(), keyOpts());
}

function saveSettings(partial) {
  return settingsLib.saveSettings(userData(), partial, keyOpts());
}

function allPacks() {
  return listPacksFromDirs(packDirs(), { cacheDir: cacheDir() });
}

function currentPack() {
  const settings = loadSettings();
  return findPack(packDirs(), settings.packId, { cacheDir: cacheDir() });
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
  presentSettings,
  allPacks,
  currentPack,
  clamp,
};
