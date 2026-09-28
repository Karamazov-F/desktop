const agent = require("../lib/agent");
const chatLog = require("../lib/chat-log");
const { TOO_EARLY, noteFromReply } = require("../lib/user-errors");
const { createVoiceGate, voiceReleaseTooSoon, MIN_VOICE_MS } = require("../lib/voice-session");
const { state, currentPack, loadSettings, userData } = require("./state");

const gate = createVoiceGate();
let voiceTurnAbort = null;
let captureOwner = null;

function isActive(sessionId) {
  return gate.isActive(sessionId);
}

function stopCaptureFor(sessionId) {
  if (captureOwner !== sessionId) return;
  captureOwner = null;
  require("./ipc").notifyCapture(false, `voice:${sessionId}`).catch((err) => console.warn("hide capture notice", err));
}

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
    const compose = require("./compose");
    if (extra && extra.note) compose.holdComposeForNote(extra.note);
    else {
      state.composeVoicePin = false;
      compose.scheduleComposeHoverClose();
    }
    compose.syncOutsideWatch();
  }
}

async function handleTranscribedText(text, { autoSend = true, sessionId = gate.current() } = {}) {
  const pet = require("./pet-window");
  const stale = () => ({ text: "", sent: false, stale: true, idleNotified: true });
  if (!isActive(sessionId)) return stale();
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
    const sessionSignal = voiceTurnAbort?.signal;
    const res = await agent.runAgentTurn({
      pack,
      settings: loadSettings(),
      userText: cleaned,
      userData: userData(),
      signal: sessionSignal,
      captureScreen: () => {
        if (!isActive(sessionId)) throw new Error("voice session cancelled");
        return pet.capturePrimaryJpeg({ signal: sessionSignal });
      },
      notifyCapture: (on) => {
        if (on) {
          if (!isActive(sessionId)) return;
          captureOwner = sessionId;
          return require("./ipc").notifyCapture(true, `voice:${sessionId}`);
        }
        stopCaptureFor(sessionId);
      },
      applyPlay: (action, line, move) => {
        if (isActive(sessionId)) pet.sendPlay(action, line, move);
      },
      applyMove: (dir, dist) => {
        if (isActive(sessionId)) pet.movePet(dir, dist);
      },
    });
    if (!isActive(sessionId)) return stale();
    chatLog.appendChat(userData(), pack.id, "user", cleaned);
    if (res?.text) chatLog.appendChat(userData(), pack.id, "bot", res.text);
    if (state.chatWindow && !state.chatWindow.isDestroyed()) {
      state.chatWindow.webContents.send("voice-transcript", { reply: res });
    }
    if (state.petWindow && !state.petWindow.isDestroyed()) {
      state.petWindow.webContents.send("voice-transcript", { reply: res });
    }
    const note = noteFromReply(res);
    notifyVoice("idle", note ? { text: cleaned, note } : { text: cleaned });
    return { text: cleaned, sent: true, reply: res, note, idleNotified: true };
  }
  return { text: cleaned, sent: false, idleNotified: false };
}

async function beginVoice(source = "hotkey") {
  const started = gate.begin();
  if (!started.ok) return started;
  voiceTurnAbort = new AbortController();
  state.voiceBusy = true;
  state.voiceSession = started.sessionId;
  state.voiceStartedAt = Date.now();
  state.voiceSource = source === "hold" ? "hold" : "hotkey";
  const compose = require("./compose");
  compose.cancelComposeNoteHold();
  state.composeVoicePin = true;
  compose.syncOutsideWatch();
  compose.openComposeWindow({ focus: false });
  notifyVoice("listening", { source: state.voiceSource });
  sendRecord({ cmd: "start", sessionId: started.sessionId });
  return started;
}

async function endVoice(sessionId = gate.current()) {
  if (!isActive(sessionId)) return { ok: false, ignored: true, sessionId: gate.current() };
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
  voiceTurnAbort?.abort();
  voiceTurnAbort = null;
  stopCaptureFor(result.sessionId);
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
    notifyVoice("idle", { text: (result && result.text) || "" });
  }
  return finished;
}

function failTranscribe(sessionId, message) {
  const finished = finishVoice(sessionId);
  if (finished.ok) {
    const composeAvailable = Boolean(state.composeWindow && !state.composeWindow.isDestroyed());
    notifyVoice("idle", { note: message, suppressPetFloat: composeAvailable });
  }
  return finished;
}

function finishVoice(sessionId) {
  const result = gate.finish(sessionId);
  if (!result.ok) return result;
  voiceTurnAbort?.abort();
  voiceTurnAbort = null;
  stopCaptureFor(result.sessionId);
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
  isActive,
  notifyVoice,
  handleTranscribedText,
  beginVoice,
  endVoice,
  cancelVoice,
  finishVoice,
  settleTranscribed,
  failTranscribe,
  toggleVoiceHotkey,
};
