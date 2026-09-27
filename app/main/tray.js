const fs = require("fs");
const { app, Tray, Menu, nativeImage, globalShortcut, screen } = require("electron");
const paths = require("../lib/paths");
const { trayIconFiles, selectTrayAssets } = require("./tray-icon");
const dialogue = require("../lib/dialogue");
const hotkeys = require("../lib/hotkeys");
const settingsLib = require("../lib/settings");
const { ACTION_LABELS } = require("../lib/tools");
const { state, loadSettings, saveSettings, allPacks } = require("./state");

function currentVoiceHotkey() {
  return hotkeys.normalize(loadSettings().voiceHotkey);
}

function tryRegister(accel, fn) {
  for (const a of hotkeys.acceleratorsToTry(accel)) {
    try {
      if (globalShortcut.register(a, fn)) return true;
    } catch (_) {}
  }
  return false;
}

function registerHotkeys() {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
  const s = loadSettings();
  const voice = hotkeys.normalize(s.voiceHotkey);
  const hide = hotkeys.normalize(s.hideHotkey);
  const bind = { voice: !voice, hide: !hide };
  if (voice) {
    bind.voice = tryRegister(voice, () => require("./voice").toggleVoiceHotkey());
    if (!bind.voice) console.warn("voice hotkey register failed", voice);
  }
  if (hide && hide !== voice) {
    bind.hide = tryRegister(hide, () => toggleHidden());
    if (!bind.hide) console.warn("hide hotkey register failed", hide);
  } else if (hide && hide === voice) {
    bind.hide = false;
    console.warn("hide hotkey skipped, same as voice", hide);
  }
  return bind;
}

function applyAlwaysOnTop(enabled) {
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    if (enabled) state.petWindow.setAlwaysOnTop(true, "screen-saver");
    else state.petWindow.setAlwaysOnTop(false);
  }
  for (const w of [state.composeWindow, state.petMenuWindow]) {
    if (w && !w.isDestroyed()) w.setAlwaysOnTop(true, "screen-saver");
  }
}

function toggleHidden() {
  const settings = loadSettings();
  const hidden = !settings.hidden;
  saveSettings({ hidden });
  if (hidden) {
    require("./compose").closeComposeWindow();
    state.petWindow?.hide();
  } else {
    state.hiddenByFullscreen = false;
    state.petWindow?.showInactive();
  }
  rebuildTrayMenu();
}

function notifySettings() {
  const pub = settingsLib.publicSettings(loadSettings());
  state.petWindow?.webContents.send("settings-changed", pub);
  state.chatWindow?.webContents.send("settings-changed", pub);
  state.settingsWindow?.webContents.send("settings-changed", pub);
}

function loadTrayImage() {
  const files = trayIconFiles(paths.appDir());
  let scale = 1;
  try {
    scale = screen.getPrimaryDisplay().scaleFactor || 1;
  } catch (_) {}
  const choice = selectTrayAssets(files, {
    platform: process.platform,
    scaleFactor: scale,
    exists: (file) => fs.existsSync(file),
  });
  let image = nativeImage.createEmpty();
  if (choice.useIco) image = nativeImage.createFromPath(choice.ico);
  if (image.isEmpty() && fs.existsSync(choice.primary)) {
    image = nativeImage.createFromPath(choice.primary);
  }
  if (choice.includeHiDpi) {
    if (choice.useIco && !image.isEmpty()) {
      image.addRepresentation({ scaleFactor: 1, path: choice.png });
      image.addRepresentation({ scaleFactor: 2, path: choice.png2x });
      return image;
    }
    const layered = nativeImage.createFromPath(choice.png);
    layered.addRepresentation({ scaleFactor: 2, path: choice.png2x });
    if (!layered.isEmpty()) return layered;
  }
  if (image.isEmpty()) console.warn("tray icon missing", choice.primary);
  return image;
}

function buildTray() {
  state.tray = new Tray(loadTrayImage());
  state.tray.on("click", () => {
    if (loadSettings().hidden) {
      toggleHidden();
      return;
    }
    require("./compose").openComposeWindow();
  });
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!state.tray) return;
  const settings = loadSettings();
  const packs = allPacks();
  const current = packs.find((p) => p.id === settings.packId) || packs[0];
  const name = current?.persona?.displayName || current?.name || "桌宠";
  state.tray.setToolTip(name);
  const pet = require("./pet-window");
  const windows = require("./windows");

  const packSub = packs.map((p) => ({
    label: `${p.id === settings.packId ? "✓ " : ""}${p.name}`,
    click: () => {
      saveSettings({ packId: p.id });
      pet.resizePetToPack(p);
      state.petWindow?.webContents.send("pack-changed", p.id);
      rebuildTrayMenu();
    },
  }));

  const actionKeys = (current?.actions || []).filter((k) => k !== "idle");
  const actionSub = [
    { label: "待机", click: () => pet.sendPlay("idle", null) },
    ...actionKeys.map((key) => ({
      label: current?.states?.[key]?.label || ACTION_LABELS[key] || key,
      click: () => pet.sendPlay(key, dialogue.lineForAction(current, key) || null),
    })),
  ];

  state.tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "对话 / 输入", click: () => windows.revealPetChat() },
      { label: "聊天记录…", click: () => windows.revealPetChat({ history: true }) },
      {
        label: `语音${currentVoiceHotkey() ? `（${hotkeys.formatDisplay(currentVoiceHotkey())}）` : ""}`,
        click: () => require("./voice").toggleVoiceHotkey(),
      },
      {
        label: settings.hidden
          ? `显示小人${settings.hideHotkey ? `（${hotkeys.formatDisplay(settings.hideHotkey)}）` : ""}`
          : `隐藏小人（勿扰${settings.hideHotkey ? ` · ${hotkeys.formatDisplay(settings.hideHotkey)}` : ""}）`,
        click: () => toggleHidden(),
      },
      { type: "separator" },
      { label: "导入角色包…", click: () => windows.importPackDialog() },
      { label: "角色", submenu: packSub.length ? packSub : [{ label: "无", enabled: false }] },
      {
        label: "动作",
        submenu: actionSub.length ? actionSub : [{ label: "无", enabled: false }],
      },
      {
        label: "朝向",
        submenu: [
          { label: "朝右", click: () => pet.sendFacing("right") },
          { label: "朝左", click: () => pet.sendFacing("left") },
        ],
      },
      { type: "separator" },
      { label: "设置…", click: () => windows.openSettingsWindow() },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ])
  );
}

module.exports = {
  currentVoiceHotkey,
  registerHotkeys,
  applyAlwaysOnTop,
  toggleHidden,
  notifySettings,
  buildTray,
  rebuildTrayMenu,
};
