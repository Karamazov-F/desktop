const { app, screen, session, globalShortcut } = require("electron");
const fs = require("fs");
const path = require("path");
const stt = require("../lib/stt");
const deps = require("../lib/deps");
const hotkeys = require("../lib/hotkeys");
const { ensureDesktopShortcut } = require("../lib/shortcut");
const { state, userData, loadSettings, saveSettings, depsCtx } = require("./state");
const { registerIpc } = require("./ipc");

function start() {
  registerIpc();

  app.whenReady().then(() => {
    const pet = require("./pet-window");
    const windows = require("./windows");
    const tray = require("./tray");
    const compose = require("./compose");

    pathsReady();
    const ctx = depsCtx();
    stt.setContext(ctx);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === "media" || permission === "microphone" || permission === "audioCapture");
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      return permission === "media" || permission === "microphone" || permission === "audioCapture";
    });
    pet.createPetWindow();
    try {
      tray.buildTray();
    } catch (err) {
      console.warn("tray failed", err);
    }
    try {
      ensureDesktopShortcut({
        electronPath: process.execPath,
        appDir: path.resolve(__dirname, ".."),
        desktopDir: app.getPath("desktop"),
      });
    } catch (err) {
      console.warn("shortcut", err.message);
    }
    const rows = deps.scan(ctx);
    const missing = deps.missingRequired(rows);
    if (missing.length) windows.openSetupWindow();
    else stt.warmup();

    if (process.env.PET_OPEN_CHAT === "1") windows.revealPetChat({ history: true });
    if (process.env.PET_OPEN_SETTINGS === "1") windows.openSettingsWindow();

    const ok = tray.registerHotkeys();
    if (ok.voice === false) console.warn("voice hotkey not bound");
    if (ok.hide === false) console.warn("hide hotkey not bound");

    const s0 = loadSettings();
    if (s0.hidden) state.petWindow?.hide();
    tray.applyAlwaysOnTop(s0.alwaysOnTop);

    if (!s0.onboarded) {
      setTimeout(() => {
        pet.sendPlay(null, "点我会挥手；按住拖我。打字用托盘或右键。");
        setTimeout(
          () => pet.sendPlay(null, `${hotkeys.formatDisplay(s0.voiceHotkey)} 说话，关窗口也能聊。`),
          3500
        );
        setTimeout(
          () =>
            pet.sendPlay(
              null,
              `${hotkeys.formatDisplay(s0.hideHotkey)} 隐藏/显示；托盘左键对话。`
            ),
          7000
        );
        saveSettings({ onboarded: true });
      }, 800);
    }

    setInterval(() => {
      const s = loadSettings();
      if (!state.petWindow || state.petWindow.isDestroyed()) return;
      if (s.hideOnFullscreen) {
        const d = screen.getPrimaryDisplay();
        const fs = d.bounds.width === d.workArea.width && d.bounds.height === d.workArea.height;
        if (fs && !state.hiddenByFullscreen && !s.hidden) {
          state.hiddenByFullscreen = true;
          compose.closeComposeWindow();
          state.petWindow.hide();
        } else if (!fs && state.hiddenByFullscreen && !s.hidden) {
          state.hiddenByFullscreen = false;
          state.petWindow.showInactive();
        }
      }
    }, 3000);
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    stt.shutdown();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

function pathsReady() {
  const paths = require("../lib/paths");
  paths.ensureDir(userData());
  const settingsFile = path.join(userData(), "settings.json");
  if (!fs.existsSync(settingsFile)) {
    const s = loadSettings();
    saveSettings({
      deepseekApiKey: s.deepseekApiKey,
      deepseekEnabled: Boolean(s.deepseekApiKey),
    });
  }
}

module.exports = { start };
