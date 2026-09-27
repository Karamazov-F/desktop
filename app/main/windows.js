const { BrowserWindow, screen, dialog } = require("electron");
const { browserWebPreferences, hardenWindow } = require("./window-guard");
const dialogue = require("../lib/dialogue");
const settingsLib = require("../lib/settings");
const agent = require("../lib/agent");
const chatLog = require("../lib/chat-log");
const { ACTION_LABELS } = require("../lib/tools");
const { importDpet, importFolder } = require("../lib/packs");
const {
  state,
  appFile,
  clamp,
  currentPack,
  loadSettings,
  saveSettings,
  userData,
  importedDir,
  cacheDir,
} = require("./state");

function dialogWindowOptions(extra = {}) {
  return {
    frame: false,
    show: false,
    backgroundColor: "#121211",
    autoHideMenuBar: true,
    minimizable: true,
    maximizable: false,
    resizable: true,
    hasShadow: true,
    thickFrame: true,
    webPreferences: browserWebPreferences(),
    ...extra,
  };
}

function createDialog(opts) {
  const win = hardenWindow(new BrowserWindow(dialogWindowOptions(opts)));
  win.once("ready-to-show", () => win.show());
  return win;
}

function closePetMenu() {
  if (state.petMenuWindow && !state.petMenuWindow.isDestroyed()) {
    state.petMenuWindow.close();
  }
  state.petMenuWindow = null;
}

function menuActions() {
  const current = currentPack();
  const actionKeys = (current?.actions || []).filter((k) => k !== "idle");
  return [
    { id: "idle", label: "待机" },
    ...actionKeys.map((key) => ({
      id: key,
      label: current?.states?.[key]?.label || ACTION_LABELS[key] || key,
    })),
  ];
}

function openPetMenu(pt) {
  closePetMenu();
  const work = screen.getPrimaryDisplay().workArea;
  const width = 420;
  const height = 180;
  let x = Math.round(Number(pt?.x) || work.x + 40);
  let y = Math.round(Number(pt?.y) || work.y + 40);
  x = clamp(x, work.x, work.x + work.width - width);
  y = clamp(y, work.y, work.y + work.height - height);
  state.petMenuWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    show: false,
    webPreferences: browserWebPreferences(),
  });
  hardenWindow(state.petMenuWindow);
  state.petMenuWindow.setAlwaysOnTop(true, "screen-saver");
  state.petMenuWindow.loadFile(appFile("renderer", "pet-menu.html"));
  let menuBlurArmed = false;
  setTimeout(() => {
    menuBlurArmed = true;
  }, 120);
  state.petMenuWindow.once("ready-to-show", () => {
    if (state.petMenuWindow && !state.petMenuWindow.isDestroyed()) state.petMenuWindow.show();
  });
  state.petMenuWindow.on("blur", () => {
    if (!menuBlurArmed) return;
    closePetMenu();
  });
  state.petMenuWindow.on("closed", () => {
    state.petMenuWindow = null;
  });
}

async function runChatter() {
  const pack = currentPack();
  if (!pack) return;
  const pet = require("./pet-window");
  const pub = settingsLib.publicSettings(loadSettings());
  if (pub.deepseekEnabled && pub.hasDeepseekKey) {
    try {
      const res = await agent.runAgentTurn({
        pack,
        settings: loadSettings(),
        userText: "请对主人碎碎念几句，像陪在旁边随口说，可以稍长一些。不要提你是AI，也不要列清单。",
        userData: userData(),
        ...require("../lib/chatter").chatterTurnExtras(),
        applyPlay: (action, line, move) => pet.sendPlay(action, line, move),
        applyMove: (dir, dist) => pet.movePet(dir, dist),
      });
      if (res?.text) chatLog.appendChat(userData(), pack.id, "bot", res.text);
      return;
    } catch (_) {}
  }
  pet.sendPlay("meow", dialogue.chatterLine(pack));
}

function defaultChatBounds() {
  const work = screen.getPrimaryDisplay().workArea;
  return { x: work.x + 48, y: work.y + 48, width: 360, height: 520 };
}

function openChatWindow() {
  if (state.chatWindow && !state.chatWindow.isDestroyed()) {
    if (!state.chatWindow.isVisible()) state.chatWindow.show();
    state.chatWindow.focus();
    return;
  }
  const pack = currentPack();
  const b = state.lastChatBounds || defaultChatBounds();
  state.chatWindow = createDialog({
    width: b.width,
    height: b.height,
    x: b.x,
    y: b.y,
    minWidth: 320,
    minHeight: 400,
    title: (pack?.persona?.displayName || pack?.name || "桌宠") + " · 聊天记录",
  });
  state.chatWindow.loadFile(appFile("renderer", "chat.html"));
  const remember = () => {
    if (state.chatWindow && !state.chatWindow.isDestroyed()) {
      state.lastChatBounds = state.chatWindow.getBounds();
    }
  };
  state.chatWindow.on("moved", remember);
  state.chatWindow.on("resized", remember);
  state.chatWindow.on("closed", () => {
    remember();
    state.chatWindow = null;
    require("./compose").unstickHoldVoice();
  });
}

function revealPetChat({ history = false } = {}) {
  if (history) {
    openChatWindow();
    return;
  }
  require("./compose").openComposeWindow();
}

function openSettingsWindow() {
  if (state.settingsWindow && !state.settingsWindow.isDestroyed()) {
    state.settingsWindow.focus();
    return;
  }
  state.settingsWindow = createDialog({
    width: 420,
    height: 760,
    minWidth: 360,
    minHeight: 560,
    title: "设置",
  });
  state.settingsWindow.loadFile(appFile("renderer", "settings.html"));
  state.settingsWindow.on("closed", () => {
    state.settingsWindow = null;
  });
}

async function importPackDialog() {
  const pet = require("./pet-window");
  const picked = await dialog.showOpenDialog({
    title: "导入角色包",
    properties: ["openFile"],
    filters: [
      { name: "桌宠包", extensions: ["dpet"] },
      { name: "全部", extensions: ["*"] },
    ],
  });
  if (picked.canceled || !picked.filePaths[0]) return;
  try {
    const pack = importDpet(picked.filePaths[0], importedDir(), cacheDir());
    saveSettings({ packId: pack.id });
    pet.resizePetToPack(pack);
    state.petWindow?.webContents.send("pack-changed", pack.id);
    require("./tray").rebuildTrayMenu();
    dialog.showMessageBox({
      type: "info",
      message: `已导入 ${pack.name}（${pack.id}）`,
    });
  } catch (err) {
    dialog.showErrorBox("导入失败", String(err.message || err));
  }
}

async function importPackFolder() {
  const pet = require("./pet-window");
  const picked = await dialog.showOpenDialog({
    title: "导入角色包文件夹",
    properties: ["openDirectory"],
  });
  if (picked.canceled || !picked.filePaths[0]) return null;
  try {
    const pack = importFolder(picked.filePaths[0], importedDir());
    saveSettings({ packId: pack.id });
    pet.resizePetToPack(pack);
    state.petWindow?.webContents.send("pack-changed", pack.id);
    require("./tray").rebuildTrayMenu();
    return pack;
  } catch (err) {
    dialog.showErrorBox("导入失败", String(err.message || err));
    return null;
  }
}

module.exports = {
  closePetMenu,
  menuActions,
  openPetMenu,
  runChatter,
  openChatWindow,
  revealPetChat,
  openSettingsWindow,
  importPackDialog,
  importPackFolder,
};
