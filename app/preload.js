const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petApi", {
  windowMin: () => ipcRenderer.invoke("win-min"),
  windowClose: () => ipcRenderer.invoke("win-close"),
  getBootstrap: () => ipcRenderer.invoke("get-bootstrap"),
  setPack: (packId) => ipcRenderer.invoke("set-pack", packId),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (partial) => ipcRenderer.invoke("save-settings", partial),
  clearAllLocal: () => ipcRenderer.invoke("clear-all-local"),
  importPack: () => ipcRenderer.invoke("import-pack"),
  importPackFolder: () => ipcRenderer.invoke("import-pack-folder"),
  resizeToPack: (size) => ipcRenderer.invoke("resize-to-pack", size),
  chat: (text) => ipcRenderer.invoke("chat", text),
  openChat: () => ipcRenderer.invoke("open-chat"),
  setMousePassthrough: (pass) => ipcRenderer.send("mouse-passthrough", pass),
  setComposeOpen: (open) => ipcRenderer.invoke("set-compose-open", open),
  setComposeHover: (hovered) => ipcRenderer.send("compose-hover", Boolean(hovered)),
  setPetComposeHover: (hovered) => ipcRenderer.send("pet-compose-hover", Boolean(hovered)),
  setComposeExpanded: (expanded) => ipcRenderer.send("compose-expanded", Boolean(expanded)),
  floatText: (text) => ipcRenderer.send("float-text", String(text || "")),
  setComposeHold: (on) => ipcRenderer.send("compose-hold", Boolean(on)),
  onComposeLayout: (cb) => ipcRenderer.on("compose-layout", (_e, layout) => cb(layout || {})),
  onComposeExpand: (cb) => ipcRenderer.on("compose-expand", () => cb()),
  openPetMenu: (pt) => ipcRenderer.invoke("open-pet-menu", pt),
  getPetMenu: () => ipcRenderer.invoke("get-pet-menu"),
  petMenuCommand: (cmd) => ipcRenderer.invoke("pet-menu-command", cmd),
  dragBy: (delta) => ipcRenderer.send("pet-drag-by", delta),
  nudgeBy: (delta) => ipcRenderer.send("pet-nudge-by", delta),
  getWorkArea: () => ipcRenderer.invoke("get-work-area"),
  voiceStart: (source) => ipcRenderer.invoke("voice-start", source || "hotkey"),
  voiceStop: () => ipcRenderer.invoke("voice-stop"),
  voiceCancel: (sessionId) => ipcRenderer.invoke("voice-cancel", sessionId),
  transcribeAudio: (bytes, mime, autoSend, sessionId) =>
    ipcRenderer.invoke("transcribe-audio", {
      data: bytes,
      mime,
      autoSend,
      sessionId,
    }),
  getChatLog: () => ipcRenderer.invoke("get-chat-log"),
  onPackChanged: (cb) => {
    ipcRenderer.on("pack-changed", (_e, id) => cb(id));
  },
  onSettingsChanged: (cb) => {
    ipcRenderer.on("settings-changed", (_e, s) => cb(s));
  },
  onPlayAction: (cb) => {
    ipcRenderer.on("play-action", (_e, name) => cb(name));
  },
  onShowBubble: (cb) => {
    ipcRenderer.on("show-bubble", (_e, text) => cb(text));
  },
  onFacing: (cb) => {
    ipcRenderer.on("facing", (_e, dir) => cb(dir));
  },
  onVoiceRecord: (cb) => {
    ipcRenderer.on("voice-record", (_e, cmd) => cb(cmd));
  },
  onVoiceState: (cb) => {
    ipcRenderer.on("voice-state", (_e, s) => cb(s));
  },
  onVoiceTranscript: (cb) => {
    ipcRenderer.on("voice-transcript", (_e, s) => cb(s));
  },
  onOpenCompose: (cb) => {
    ipcRenderer.on("open-compose", (_e, extra) => cb(extra || {}));
  },
  onComposeFlag: (cb) => {
    ipcRenderer.on("compose-flag", (_e, on) => cb(Boolean(on)));
  },
  onComposeHint: (cb) => {
    ipcRenderer.on("compose-hint", (_e, text) => cb(text || ""));
  },
  onFloatText: (cb) => {
    ipcRenderer.on("float-text", (_e, text) => cb(text || ""));
  },
  onThinking: (cb) => {
    ipcRenderer.on("chat-thinking", (_e, on) => cb(on));
  },
  onChatTurn: (cb) => {
    ipcRenderer.on("chat-turn", (_e, payload) => cb(payload || {}));
  },
  onChatCleared: (cb) => {
    ipcRenderer.on("chat-cleared", () => cb());
  },
});
