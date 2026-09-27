const agent = require("../lib/agent");
const chatLog = require("../lib/chat-log");
const { TOO_EARLY, replyFallbackNote } = require("../lib/user-errors");
const { createVoiceGate, voiceReleaseTooSoon, MIN_VOICE_MS } = require("../lib/voice-session");
const { state, currentPack, loadSettings, userData } = require("./state");

const gate = createVoiceGate();

function sendRecord(payload) {
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send("voice-record", payload);
  }
}

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
    return { text: "", sent: false, idleNotified: true };
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
    const note = replyFallbackNote(res);
    notifyVoice("idle", { text: cleaned, note });
    return { text: cleaned, sent: true, reply: res, note, idleNotified: true };
  }
  return { text: cleaned, sent: false, idleNotified: false };
}

async function beginVoice(source = "hotkey") {
  const started = gate.begin();
  if (!started.ok) return started;
  state.voiceBusy = true;
  state.voiceSession = started.sessionId;
  state.voiceStartedAt = Date.now();
  state.voiceSource = source === "hold" ? "hold" : "hotkey";
  state.composeVoicePin = true;
  const compose = require("./compose");
  compose.syncOutsideWatch();
  compose.openComposeWindow({ focus: false });
  notifyVoice("listening", { source: state.voiceSource });
  sendRecord({ cmd: "start", sessionId: started.sessionId });
  return started;
}

async function endVoice() {
  const sessionId = gate.current();
  if (voiceReleaseTooSoon(state.voiceSource, state.voiceStartedAt)) {
    cancelVoice(sessionId);
    try {
      require("./pet-window").sendPlay(null, TOO_EARLY);
    } catch (err) {
      console.warn("voice too early", err && err.message);
    }
    return { ok: false, error: "too-short", sessionId };
  }
  sendRecord({ cmd: "stop", sessionId });
  notifyVoice("transcribing");
  return { ok: true, sessionId };
}

function cancelVoice(sessionId) {
  const result = gate.cancel(sessionId);
  if (!result.ok) return result;
  state.voiceBusy = false;
  state.voiceHotkeyArmed = false;
  state.voiceStartedAt = 0;
  sendRecord({ cmd: "cancel", sessionId: result.sessionId });
  notifyVoice("idle", { cancelled: true });
  return result;
}

function settleTranscribed(sessionId, result) {
  const finished = finishVoice(sessionId);
  if (finished.ok && !(result && result.idleNotified)) {
    const extra = { text: (result && result.text) || "" };
    if (result && result.note) extra.note = result.note;
    notifyVoice("idle", extra);
  }
  return finished;
}

function finishVoice(sessionId) {
  const result = gate.finish(sessionId);
  if (!result.ok) return result;
  state.voiceBusy = false;
  state.voiceHotkeyArmed = false;
  state.voiceStartedAt = 0;
  return result;
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
  finishVoice,
  settleTranscribed,
  toggleVoiceHotkey,
};
