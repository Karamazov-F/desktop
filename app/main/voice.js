const agent = require("../lib/agent");
const chatLog = require("../lib/chat-log");
const { state, currentPack, loadSettings, userData } = require("./state");

function notifyVoice(next, extra = {}) {
  state.voicePhase = next;
  const payload = { state: next, ...extra };
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send("voice-state", payload);
  }
  if (state.chatWindow && !state.chatWindow.isDestroyed()) {
    state.chatWindow.webContents.send("voice-state", payload);
  }
  if (state.composeWindow && !state.composeWindow.isDestroyed()) {
    state.composeWindow.webContents.send("voice-state", payload);
  }
  if (next === "idle") {
    state.composeVoicePin = false;
    const compose = require("./compose");
    compose.scheduleComposeHoverClose();
    compose.syncOutsideWatch();
  }
}

async function handleTranscribedText(text, { autoSend = true } = {}) {
  const pet = require("./pet-window");
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    pet.sendPlay(null, "没听清，再说一次？");
    notifyVoice("idle", { error: "empty" });
    return { text: "", sent: false };
  }
  if (state.chatWindow && !state.chatWindow.isDestroyed()) {
    state.chatWindow.webContents.send("voice-transcript", { text: cleaned });
  }
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send("voice-transcript", { text: cleaned });
  }
  if (autoSend) {
    const pack = currentPack();
    if (!pack) return { text: cleaned, sent: false };
    const res = await agent.runAgentTurn({
      pack,
      settings: loadSettings(),
      userText: cleaned,
      userData: userData(),
      captureScreen: pet.capturePrimaryJpeg,
      notifyCapture: (on) => require("./ipc").notifyCapture(on),
      applyPlay: (action, line, move) => pet.sendPlay(action, line, move),
      applyMove: (dir, dist) => pet.movePet(dir, dist),
    });
    chatLog.appendChat(userData(), pack.id, "user", cleaned);
    if (res?.text) chatLog.appendChat(userData(), pack.id, "bot", res.text);
    if (state.chatWindow && !state.chatWindow.isDestroyed()) {
      state.chatWindow.webContents.send("voice-transcript", { reply: res });
    }
    if (state.petWindow && !state.petWindow.isDestroyed()) {
      state.petWindow.webContents.send("voice-transcript", { reply: res });
    }
    return { text: cleaned, sent: true, reply: res };
  }
  return { text: cleaned, sent: false };
}

async function beginVoice(source = "hotkey") {
  if (state.voiceBusy) return { ok: false, error: "busy" };
  state.voiceBusy = true;
  state.voiceSource = source === "hold" ? "hold" : "hotkey";
  state.composeVoicePin = true;
  const compose = require("./compose");
  compose.syncOutsideWatch();
  compose.openComposeWindow({ focus: false });
  notifyVoice("listening", { source: state.voiceSource });
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send("voice-record", "start");
  }
  return { ok: true };
}

async function endVoice() {
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send("voice-record", "stop");
  }
  notifyVoice("transcribing");
  return { ok: true };
}

function cancelVoice() {
  state.voiceBusy = false;
  state.voiceHotkeyArmed = false;
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send("voice-record", "cancel");
  }
  notifyVoice("idle", { cancelled: true });
  return { ok: true };
}

function toggleVoiceHotkey() {
  if (state.voiceBusy || state.voiceHotkeyArmed) {
    state.voiceHotkeyArmed = false;
    return endVoice();
  }
  state.voiceHotkeyArmed = true;
  return beginVoice("hotkey");
}

module.exports = {
  notifyVoice,
  handleTranscribedText,
  beginVoice,
  endVoice,
  cancelVoice,
  toggleVoiceHotkey,
};
