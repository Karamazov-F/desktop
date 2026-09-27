const { BrowserWindow, screen } = require("electron");
const { state, appFile, clamp } = require("./state");
const { browserWebPreferences, hardenWindow } = require("./window-guard");

const COMPOSE_SIZE = { width: 360, height: 68 };
const COMPOSE_PILL_SIZE = { width: 120, height: 76 };
const COMPOSE_HOVER_CLOSE_MS = 400;

function composeBox() {
  if (state.composeExpanded && state.composeNoteText) {
    return require("../lib/note-layout").composeNoteSize(state.composeNoteText, COMPOSE_SIZE.width);
  }
  const size = state.composeExpanded ? COMPOSE_SIZE : COMPOSE_PILL_SIZE;
  return { width: size.width, height: size.height };
}

function setComposeFlag(on) {
  state.composeOpen = Boolean(on);
  if (state.petWindow && !state.petWindow.isDestroyed()) {
    state.petWindow.webContents.send("compose-flag", state.composeOpen);
  }
}

function composeBesidePetBounds() {
  if (!state.petWindow || state.petWindow.isDestroyed()) return null;
  const pb = state.petWindow.getBounds();
  const work = screen.getPrimaryDisplay().workArea;
  const size = composeBox();
  let x = pb.x + Math.round((pb.width - size.width) / 2);
  x = clamp(x, work.x, work.x + work.width - size.width);
  let y = pb.y + pb.height - 34;
  y = clamp(y, work.y, work.y + work.height - size.height);
  return { x, y, width: size.width, height: size.height };
}

function positionComposeBesidePet() {
  if (!state.composeWindow || state.composeWindow.isDestroyed()) return;
  const box = composeBesidePetBounds();
  if (!box) return;
  // Always write the locked content size. Reading getBounds() and writing it
  // back grows transparent windows by about a pixel per move on Windows.
  state.composeWindow.setContentSize(box.width, box.height);
  state.composeWindow.setPosition(Math.round(box.x), Math.round(box.y));
  const pb = state.petWindow.getBounds();
  state.composeWindow.webContents.send("compose-layout", {
    dockX: pb.x + pb.width / 2 - box.x,
  });
}

function closeComposeWindow() {
  if (state.composeWindow && !state.composeWindow.isDestroyed()) state.composeWindow.close();
}

function cursorInsideWindow(win) {
  if (!win || win.isDestroyed() || !win.isVisible()) return false;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
}

function unstickHoldVoice() {
  if (state.voiceBusy && state.voiceSource === "hold") require("./voice").endVoice();
}

function wireComposeWindow(win) {
  win.on("blur", () => {
    // A click that focuses something else already landed. Closing here must
    // not be the thing that ate it — only skip clicks that are on the dock.
    if (!state.composeBlurArmed || !state.composeExpanded || state.composeVoicePin) return;
    if (cursorInsideWindow(state.composeWindow)) return;
    closeComposeWindow();
  });
  win.on("closed", () => {
    clearTimeout(state.composeNoteHoldTimer);
    state.composeNoteHoldTimer = null;
    state.composeNoteText = "";
    state.composeNoteUntilLeave = false;
    state.composeWindow = null;
    state.composerHover = false;
    state.composeExpanded = false;
    state.composeVoicePin = false;
    state.composeBlurArmed = false;
    setComposeFlag(false);
    unstickHoldVoice();
    syncOutsideWatch();
    setTimeout(() => prewarmComposeWindow(), 120);
  });
}

// Desktop clicks do not blur a topmost dock. Watch the button edge without
// inserting a window into the hit-test path, so the click still reaches
// whatever is underneath and the dock closes as a side effect.
let stopOutsideWatch = null;
let outsideWatchArmed = false;
let outsideArmTimer = null;

function armDismiss() {
  state.composeBlurArmed = false;
  outsideWatchArmed = false;
  clearTimeout(outsideArmTimer);
  outsideArmTimer = setTimeout(() => {
    if (!state.composeExpanded) return;
    state.composeBlurArmed = true;
    outsideWatchArmed = true;
  }, 280);
}

function outsideWatchWanted() {
  return Boolean(
    state.composeExpanded &&
      state.composeWindow &&
      !state.composeWindow.isDestroyed() &&
      state.composeWindow.isVisible()
  );
}

function syncOutsideWatch() {
  if (!outsideWatchWanted()) {
    outsideWatchArmed = false;
    clearTimeout(outsideArmTimer);
    if (stopOutsideWatch) {
      stopOutsideWatch();
      stopOutsideWatch = null;
    }
    return;
  }
  if (stopOutsideWatch) return;
  outsideWatchArmed = false;
  clearTimeout(outsideArmTimer);
  outsideArmTimer = setTimeout(() => {
    if (outsideWatchWanted()) outsideWatchArmed = true;
  }, 180);
  stopOutsideWatch = require("./pointer-watch").watchPresses(() => {
    if (!outsideWatchArmed || !outsideWatchWanted() || state.composeVoicePin) return;
    if (cursorInsideWindow(state.composeWindow)) return;
    closeComposeWindow();
  });
}

function cancelComposeNoteHold() {
  clearTimeout(state.composeNoteHoldTimer);
  state.composeNoteHoldTimer = null;
  state.composeNoteUntilLeave = false;
  state.composeNoteText = "";
}

function holdComposeForNote(note) {
  const text = String(note || "");
  if (!text) return;
  clearTimeout(state.composeHoverCloseTimer);
  clearTimeout(state.composeNoteHoldTimer);
  state.composeVoicePin = true;
  state.composeNoteUntilLeave = false;
  state.composeNoteText = text;
  state.composeExpanded = true;
  if (state.composeWindow && !state.composeWindow.isDestroyed()) {
    positionComposeBesidePet();
    if (!state.composeWindow.isVisible()) state.composeWindow.showInactive();
    state.composeWindow.webContents.send("compose-note", { text });
    syncOutsideWatch();
  }
  const wait = require("../lib/note-layout").holdMs(text);
  state.composeNoteHoldTimer = setTimeout(() => releaseComposeNoteHold(), wait);
}

function releaseComposeNoteHold() {
  state.composeNoteHoldTimer = null;
  state.composeVoicePin = false;
  if (state.composerHover || state.petComposeHover || cursorInsideWindow(state.composeWindow)) {
    state.composeNoteUntilLeave = true;
    return;
  }
  closeComposeWindow();
}

function pointerLeftCompose() {
  if (state.composeNoteUntilLeave) {
    state.composeNoteUntilLeave = false;
    closeComposeWindow();
    return;
  }
  scheduleComposeHoverClose();
}

function scheduleComposeHoverClose() {
  clearTimeout(state.composeHoverCloseTimer);
  if (state.petComposeHover || state.composerHover) return;
  if (state.composeExpanded || state.composeVoicePin) return;
  state.composeHoverCloseTimer = setTimeout(() => {
    if (state.petComposeHover || state.composerHover || state.composeExpanded || state.composeVoicePin) {
      return;
    }
    if (!state.composeWindow || state.composeWindow.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = state.composeWindow.getBounds();
    const inDock = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (!inDock) closeComposeWindow();
  }, COMPOSE_HOVER_CLOSE_MS);
}

function prewarmComposeWindow() {
  if (state.composeWindow && !state.composeWindow.isDestroyed()) return;
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  state.composeExpanded = false;
  const box = composeBesidePetBounds();
  if (!box) return;
  state.composeWindow = new BrowserWindow({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: browserWebPreferences(),
  });
  hardenWindow(state.composeWindow);
  state.composeWindow.setAlwaysOnTop(true, "screen-saver");
  state.composeWindow.loadFile(appFile("renderer", "compose.html"));
  state.composeWindow.once("ready-to-show", () => {
    if (!state.composeWindow || state.composeWindow.isDestroyed()) return;
    positionComposeBesidePet();
  });
  wireComposeWindow(state.composeWindow);
}

function requestComposeExpand() {
  if (!state.composeExpanded) armDismiss();
  state.composeExpanded = true;
  if (state.composeWindow && !state.composeWindow.isDestroyed()) {
    state.composeWindow.webContents.send("compose-expand");
  }
}

function openComposeWindow({ focus = true } = {}) {
  require("./windows").closePetMenu();
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  state.hiddenByFullscreen = false;
  state.petWindow.show();
  if (state.composeWindow && !state.composeWindow.isDestroyed()) {
    if (focus) requestComposeExpand();
    positionComposeBesidePet();
    if (!state.composeWindow.isVisible()) {
      if (focus) state.composeWindow.show();
      else state.composeWindow.showInactive();
    }
    setComposeFlag(true);
    if (focus) state.composeWindow.focus();
    syncOutsideWatch();
    return;
  }
  state.composeExpanded = Boolean(focus);
  if (focus) armDismiss();
  const box = composeBesidePetBounds() || {
    x: 80,
    y: 80,
    width: COMPOSE_SIZE.width,
    height: COMPOSE_SIZE.height,
  };
  state.composeWindow = new BrowserWindow({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: browserWebPreferences(),
  });
  hardenWindow(state.composeWindow);
  state.composeWindow.setAlwaysOnTop(true, "screen-saver");
  state.composeWindow.loadFile(appFile("renderer", "compose.html"));
  state.composeWindow.once("ready-to-show", () => {
    if (!state.composeWindow || state.composeWindow.isDestroyed()) return;
    positionComposeBesidePet();
    if (focus) {
      state.composeWindow.webContents.send("compose-expand");
      state.composeWindow.show();
      state.composeWindow.focus();
    } else {
      state.composeWindow.showInactive();
    }
    setComposeFlag(true);
    if (state.voicePhase !== "idle") {
      state.composeWindow.webContents.send("voice-state", {
        state: state.voicePhase,
        source: state.voiceSource,
      });
    }
    syncOutsideWatch();
  });
  wireComposeWindow(state.composeWindow);
}

module.exports = {
  COMPOSE_SIZE,
  COMPOSE_PILL_SIZE,
  COMPOSE_HOVER_CLOSE_MS,
  positionComposeBesidePet,
  closeComposeWindow,
  syncOutsideWatch,
  armDismiss,
  scheduleComposeHoverClose,
  holdComposeForNote,
  cancelComposeNoteHold,
  releaseComposeNoteHold,
  pointerLeftCompose,
  prewarmComposeWindow,
  openComposeWindow,
  unstickHoldVoice,
};
