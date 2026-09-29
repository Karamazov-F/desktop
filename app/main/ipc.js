const { BrowserWindow, ipcMain } = require("electron");
const memory = require("../lib/memory");
const agent = require("../lib/agent");
const stt = require("../lib/stt");
const chatLog = require("../lib/chat-log");
const {
  state,
  BUNDLED_PACKS,
  loadSettings,
  saveSettings,
  presentSettings,
  allPacks,
  currentPack,
  userData,
} = require("./state");

const captureOwners = new Set();
async function notifyCapture(on, owner = "legacy") {
  if (on) {
    if (captureOwners.has(owner)) return;
    const first = captureOwners.size === 0;
    captureOwners.add(owner);
    if (first) {
      require("./pet-window").sendPlay(null, "正在查看屏幕，画面将发送到视觉接口");
      await require("./capture-notice").setCaptureNotice(true);
    }
    return;
  }
  if (!captureOwners.delete(owner) || captureOwners.size > 0) return;
  await require("./capture-notice").setCaptureNotice(false);
}

function registerIpc() {
  ipcMain.handle("get-bootstrap", (e) => {
    const pet = require("./pet-window");
    const settings = loadSettings();
    const packs = allPacks();
    const pack = currentPack();
    const senderWin = BrowserWindow.fromWebContents(e.sender);
    if (senderWin === state.petWindow) pet.resizePetToPack(pack);
    return {
      settings: presentSettings(settings),
      packsDir: BUNDLED_PACKS,
      packs: packs.map((p) => ({ id: p.id, name: p.name })),
      pack,
      voiceHotkey: loadSettings().voiceHotkey,
      hideHotkey: loadSettings().hideHotkey,
      chatLog: pack ? chatLog.loadChat(userData(), pack.id) : [],
    };
  });

  ipcMain.handle("set-pack", (_e, packId) => {
    saveSettings({ packId });
    const pack = currentPack();
    require("./pet-window").resizePetToPack(pack);
    require("./tray").rebuildTrayMenu();
    return pack;
  });

  ipcMain.handle("resize-to-pack", (_e, size) => {
    if (!state.petWindow || state.petWindow.isDestroyed()) return null;
    const pet = require("./pet-window");
    const base = currentPack() || {};
    const pack = {
      ...base,
      size: size || base.size || { width: 128, height: 128 },
    };
    pet.resizePetToPack(pack, { hasDialogue: size?.hasDialogue, bubbleH: size?.bubbleH });
    const [w, h] = state.petWindow.getContentSize();
    return { width: w, height: h };
  });

  ipcMain.handle("chat", async (e, userText) => {
    const captureOwner = Symbol("chat capture");
    const pack = currentPack();
    if (!pack) return { text: "还没有角色包。", action: null, displayName: "桌宠" };
    const version = agent.sessionVersion(pack.id);
    const pet = require("./pet-window");
    chatLog.appendChat(userData(), pack.id, "user", userText);
    const from = BrowserWindow.fromWebContents(e.sender);
    const sendThinking = (on) => {
      if (state.petWindow && !state.petWindow.isDestroyed() && from !== state.petWindow) {
        state.petWindow.webContents.send("chat-thinking", on);
      }
      if (state.chatWindow && !state.chatWindow.isDestroyed() && from !== state.chatWindow) {
        state.chatWindow.webContents.send("chat-thinking", on);
      }
    };
    sendThinking(true);
    pet.sendPlay(null, "正在想…");
    try {
      const res = await agent.runAgentTurn({
        pack,
        settings: loadSettings(),
        userText,
        userData: userData(),
        captureScreen: pet.capturePrimaryJpeg,
        notifyCapture: (on) => notifyCapture(on, captureOwner),
        applyPlay: (action, line, move) => {
          if (agent.isSessionCurrent(pack.id, version)) pet.sendPlay(action, line, move);
        },
        applyMove: (dir, dist) => {
          if (agent.isSessionCurrent(pack.id, version)) pet.movePet(dir, dist);
        },
      });
      if (!agent.isSessionCurrent(pack.id, version) || res?.stale) {
        return { text: "", stale: true };
      }
      if (res?.text) chatLog.appendChat(userData(), pack.id, "bot", res.text);
      if (state.chatWindow && !state.chatWindow.isDestroyed() && from !== state.chatWindow) {
        state.chatWindow.webContents.send("chat-turn", { user: userText, reply: res });
      }
      return res;
    } finally {
      sendThinking(false);
    }
  });

  ipcMain.handle("open-chat", () => {
    require("./windows").revealPetChat({ history: true });
    return true;
  });

  ipcMain.handle("open-pet-menu", (_e, pt) => {
    require("./windows").openPetMenu(pt || {});
    return true;
  });

  ipcMain.handle("get-pet-menu", () => ({ actions: require("./windows").menuActions() }));

  ipcMain.handle("pet-menu-command", async (_e, cmd) => {
    const windows = require("./windows");
    const pet = require("./pet-window");
    windows.closePetMenu();
    if (cmd?.kind === "chatter") await windows.runChatter();
    else if (cmd?.kind === "compose") require("./compose").openComposeWindow();
    else if (cmd?.kind === "action" && cmd.id) {
      const pack = currentPack();
      const dialogue = require("../lib/dialogue");
      pet.sendPlay(cmd.id === "idle" ? "idle" : cmd.id, dialogue.lineForAction(pack, cmd.id) || null);
    }
    return true;
  });

  ipcMain.on("mouse-passthrough", (_e, pass) => {
    require("./pet-window").setPetPassthrough(pass);
  });

  ipcMain.handle("voice-start", async (_e, source) => require("./voice").beginVoice(source || "hotkey"));
  ipcMain.handle("voice-stop", async (_e, sessionId) => {
    if (sessionId === undefined || sessionId === null || sessionId === "") return { ok: false, ignored: true };
    return require("./voice").endVoice(sessionId);
  });
  ipcMain.handle("voice-cancel", async (_e, sessionId) => require("./voice").cancelVoice(sessionId));

  ipcMain.handle("transcribe-audio", async (_e, payload) => {
    const voice = require("./voice");
    try {
      const bytes = payload?.data ? Buffer.from(payload.data) : Buffer.alloc(0);
      if (bytes.length < 200) {
        const finished = voice.finishVoice(payload?.sessionId);
        if (!finished.ok) return { ok: false, error: "stale-session", text: "" };
        voice.notifyVoice("idle");
        return { ok: false, error: "too-short", text: "" };
      }
      const text = await stt.transcribeBuffer(bytes);
      if (!voice.isActive(payload?.sessionId)) return { ok: false, error: "stale-session", text: "" };
      const result = await voice.handleTranscribedText(text, {
        autoSend: payload?.autoSend !== false,
        sessionId: payload?.sessionId,
      });
      if (result.stale) return { ok: false, error: "stale-session", text: "" };
      voice.settleTranscribed(payload?.sessionId, result);
      return { ok: true, ...result };
    } catch (err) {
      console.warn("transcribe failed", err && err.stack ? err.stack : err);
      const message = require("../lib/user-errors").sttFailureMessage(err);
      const finished = voice.failTranscribe(payload?.sessionId, message);
      if (!finished.ok) return { ok: false, error: "stale-session", text: "" };
      return { ok: false, error: message, text: "" };
    }
  });

  ipcMain.handle("win-min", (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });

  ipcMain.handle("win-close", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && win !== state.petWindow) win.close();
  });

  ipcMain.handle("get-settings", () => presentSettings(loadSettings()));

  ipcMain.handle("save-settings", (_e, partial) => {
    const tray = require("./tray");
    const next = saveSettings(partial || {});
    tray.applyAlwaysOnTop(next.alwaysOnTop);
    const hotkeyBind = tray.registerHotkeys();
    tray.notifySettings();
    tray.rebuildTrayMenu();
    return { ...presentSettings(next), hotkeyBind };
  });

  ipcMain.handle("set-compose-open", (_e, open) => {
    const compose = require("./compose");
    const on = open && typeof open === "object" ? Boolean(open.compose) : Boolean(open);
    if (on) compose.openComposeWindow();
    else compose.closeComposeWindow();
    return { ok: true, composeOpen: on };
  });

  ipcMain.on("pet-compose-hover", (_e, hovered) => {
    const compose = require("./compose");
    state.petComposeHover = Boolean(hovered);
    if (state.petComposeHover) compose.openComposeWindow({ focus: false });
    else compose.pointerLeftCompose();
  });

  ipcMain.on("compose-hover", (_e, hovered) => {
    const compose = require("./compose");
    state.composerHover = Boolean(hovered);
    if (state.composerHover) clearTimeout(state.composeHoverCloseTimer);
    else compose.pointerLeftCompose();
  });

  ipcMain.on("compose-expanded", (e, expanded) => {
    if (!state.composeWindow || state.composeWindow.isDestroyed()) return;
    if (e.sender !== state.composeWindow.webContents || e.senderFrame !== e.sender.mainFrame) return;
    const compose = require("./compose");
    const was = state.composeExpanded;
    state.composeExpanded = Boolean(expanded);
    if (state.composeExpanded) compose.markComposeInteraction();
    if (state.composeExpanded) compose.positionComposeBesidePet();
    if (state.composeExpanded && !was) compose.armDismiss();
    compose.syncOutsideWatch();
  });

  ipcMain.on("compose-hint-text", (e, text, source) => {
    if (!state.composeWindow || state.composeWindow.isDestroyed()) return;
    if (e.sender !== state.composeWindow.webContents || e.senderFrame !== e.sender.mainFrame) return;
    if (typeof text !== "string") return;
    state.composeHintText = text.slice(0, 4096);
    state.composeHintIsNote = source === "note";
    if (state.composeExpanded) require("./compose").positionComposeBesidePet();
  });

  ipcMain.on("compose-hold", (_e, on) => {
    const compose = require("./compose");
    state.composeVoicePin = Boolean(on);
    if (!on) compose.scheduleComposeHoverClose();
    compose.syncOutsideWatch();
  });

  ipcMain.on("float-text", (_e, text) => {
    require("./pet-window").floatText(text);
  });

  ipcMain.on("pet-drag-by", (_e, delta) => {
    require("./pet-window").nudgePetWindow(delta, { closeMenu: true });
  });

  ipcMain.on("pet-nudge-by", (_e, delta) => {
    require("./pet-window").nudgePetWindow(delta);
  });

  ipcMain.handle("get-work-area", () => {
    const { screen } = require("electron");
    if (!state.petWindow || state.petWindow.isDestroyed()) return null;
    const b = state.petWindow.getBounds();
    const work = screen.getPrimaryDisplay().workArea;
    return {
      win: { x: b.x, y: b.y, width: b.width, height: b.height },
      work: { x: work.x, y: work.y, width: work.width, height: work.height },
    };
  });

  ipcMain.handle("get-chat-log", () => {
    const pack = currentPack();
    return pack ? chatLog.loadChat(userData(), pack.id) : [];
  });

  ipcMain.handle("get-current-pack", () => {
    const pack = currentPack();
    return pack ? { id: pack.id, name: pack.persona?.displayName || pack.name || pack.id } : null;
  });

  ipcMain.handle("clear-memory", (_e, request) => {
    if (request?.phrase !== "goodbye") return { ok: false, error: "请输入 goodbye 后再确认。" };
    const pack = currentPack();
    if (!pack) return { ok: false, error: "当前没有可清空的角色。" };
    if (request.packId !== pack.id) {
      return { ok: false, error: "角色已切换，请重新打开清空确认框。" };
    }
    agent.clearSession(pack.id);
    try {
      memory.clearMemory(userData(), pack.id);
    } catch (err) {
      return { ok: false, memoryCleared: null, chatCleared: false,
        error: "记忆清空状态未确认，聊天记录未清空。请先备份并检查本机数据。" };
    }
    try {
      chatLog.clearChat(userData(), pack.id);
    } catch (err) {
      return { ok: false, partial: true, memoryCleared: true, chatCleared: false,
        error: "当前角色的记忆已清空，但聊天记录未清空。请先备份并检查本机数据。" };
    }
    if (state.chatWindow && !state.chatWindow.isDestroyed()) {
      state.chatWindow.webContents.send("chat-cleared");
    }
    return { ok: true, memoryCleared: true, chatCleared: true };
  });

  ipcMain.handle("import-pack", async () => {
    await require("./windows").importPackDialog();
    return presentSettings(loadSettings());
  });

  ipcMain.handle("import-pack-folder", async () => require("./windows").importPackFolder());
}

module.exports = { registerIpc, notifyCapture };
