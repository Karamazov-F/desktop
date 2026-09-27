const { app, screen, session, globalShortcut, dialog, BrowserWindow } = require("electron");
const path = require("path");
const stt = require("../lib/stt");
const hotkeys = require("../lib/hotkeys");
const { state, userData, loadSettings, saveSettings } = require("./state");
const { registerIpc } = require("./ipc");

const PRIVACY_DETAIL = [
  "文字对话：你输入的内容、角色设定，以及（若打开「记住对话」）本机保存的记忆摘要，会发送到 DeepSeek（https://api.deepseek.com）。这个地址是固定的。没有 API Key 时只用本机台词，不联网聊天。",
  "",
  "查看屏幕：默认关闭。打开后，只有你让它看屏幕时才会截取主屏幕，并在画面上明确提示。截图会发给视觉接口。碎碎念不会截屏。",
  "",
  "语音：在本机识别，录音不会上传。",
  "",
  "本机保存：API Key 用系统加密保存。聊天记录（最多最近 100 条）和记忆位于",
  "%APPDATA%\\desktop-pet",
  "可在设置里关闭记忆、关闭查看屏幕，或一键清除全部聊天记录和记忆。",
].join("\n");

function isAppContents(contents) {
  if (!contents || contents.isDestroyed()) return false;
  const win = BrowserWindow.fromWebContents(contents);
  return Boolean(win && !win.isDestroyed());
}

function start() {
  app.setPath("userData", path.join(app.getPath("appData"), "desktop-pet"));
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    const win = state.petWindow;
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) win.show();
    win.focus();
  });

  registerIpc();

  app.whenReady().then(async () => {
    const pet = require("./pet-window");
    const windows = require("./windows");
    const tray = require("./tray");

    require("../lib/paths").ensureDir(userData());
    const { allowAppAudio } = require("./media-permission");
    const appDir = require("../lib/paths").appDir();
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      callback(
        allowAppAudio({
          permission,
          requestingUrl: details?.requestingUrl,
          mediaTypes: details?.mediaTypes,
          appDir,
          isAppWindow: isAppContents(wc),
        })
      );
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
      return allowAppAudio({
        permission,
        requestingUrl: details?.requestingUrl || requestingOrigin,
        mediaType: details?.mediaType,
        appDir,
        isAppWindow: isAppContents(wc),
      });
    });
    pet.createPetWindow();
    try {
      tray.buildTray();
    } catch (err) {
      console.warn("tray failed", err);
    }
    stt.warmup();

    const ok = tray.registerHotkeys();
    if (ok.voice === false) console.warn("voice hotkey not bound");
    if (ok.hide === false) console.warn("hide hotkey not bound");

    const s0 = loadSettings();
    if (s0.hidden) state.petWindow?.hide();
    tray.applyAlwaysOnTop(s0.alwaysOnTop);

    if (!s0.privacyAccepted) {
      await dialog.showMessageBox({
        type: "info",
        title: "隐私说明",
        message: "桌宠如何使用你的数据",
        detail: PRIVACY_DETAIL,
        buttons: ["我知道了"],
        noLink: true,
      });
      try {
        saveSettings({ privacyAccepted: true });
      } catch (err) {
        console.warn("privacy flag not saved", err);
      }
    }

    const s1 = loadSettings();
    if (!s1.onboarded) {
      setTimeout(() => {
        pet.sendPlay(null, "点我会挥手；按住拖我。打字用托盘或右键。");
        setTimeout(
          () => pet.sendPlay(null, `${hotkeys.formatDisplay(s1.voiceHotkey)} 说话，关窗口也能聊。`),
          3500
        );
        setTimeout(
          () =>
            pet.sendPlay(
              null,
              `${hotkeys.formatDisplay(s1.hideHotkey)} 隐藏/显示；托盘左键对话。`
            ),
          7000
        );
        try {
          saveSettings({ onboarded: true });
        } catch (err) {
          console.warn("onboarding flag not saved", err);
        }
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
          require("./compose").closeComposeWindow();
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

module.exports = { start, PRIVACY_DETAIL };
