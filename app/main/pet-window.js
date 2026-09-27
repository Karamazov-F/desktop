const { BrowserWindow, screen, desktopCapturer } = require("electron");
const { state, BUBBLE_SLOT, appFile, loadSettings, currentPack, clamp } = require("./state");
const { browserWebPreferences, hardenWindow } = require("./window-guard");
const captureNotice = require("./capture-notice");

function rememberPetOuterSize() {
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  const b = state.petWindow.getBounds();
  state.petOuterSize = { width: b.width, height: b.height };
}

function petBox() {
  if (state.petOuterSize) return state.petOuterSize;
  if (!state.petWindow || state.petWindow.isDestroyed()) return { width: 0, height: 0 };
  const b = state.petWindow.getBounds();
  return { width: b.width, height: b.height };
}

function packWindowSize(pack, opts = {}) {
  const w = Math.max(64, Number(pack?.size?.width) || 128);
  const h = Math.max(64, Number(pack?.size?.height) || 128);
  const pad = 32;
  const foot = 16;
  // Always keep the bubble slot. Resizing a transparent window on show/hide
  // clears the surface for a frame and the character flickers.
  const bubbleH = Math.max(BUBBLE_SLOT, Math.round(Number(opts.bubbleH) || 0));
  return { width: w + pad, height: h + pad + foot + bubbleH };
}

function resizePetToPack(pack, opts = {}) {
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  const { width, height } = packWindowSize(pack, opts);
  if (
    state.appliedPetContent &&
    state.appliedPetContent.width === width &&
    state.appliedPetContent.height === height
  ) {
    return;
  }
  const old = state.petWindow.getBounds();
  const bottom = old.y + old.height;
  state.petWindow.setContentSize(width, height);
  const neu = state.petWindow.getBounds();
  const work = screen.getPrimaryDisplay().workArea;
  let x = old.x;
  let y = bottom - neu.height;
  if (y + neu.height > work.y + work.height) y = work.y + work.height - neu.height;
  if (y < work.y) y = work.y;
  if (x + neu.width > work.x + work.width) x = work.x + work.width - neu.width;
  if (x < work.x) x = work.x;
  state.petWindow.setBounds({ x, y, width: neu.width, height: neu.height });
  state.appliedPetContent = { width, height };
  rememberPetOuterSize();
  state.nudgePos = { x, y };
  require("./compose").positionComposeBesidePet();
}

function floatText(text) {
  const label = String(text || "").trim();
  if (!label || !state.petWindow || state.petWindow.isDestroyed()) return;
  state.petWindow.webContents.send("float-text", label);
}

function sendPlay(action, line, move) {
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  if (!action && !line && !move) return;
  if (move) state.nudgePos = null;
  state.petWindow.webContents.send("play-action", {
    action: action || null,
    line: line || null,
    move: move || null,
  });
}

function sendFacing(dir) {
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  state.petWindow.webContents.send("facing", dir);
}

function setPetPassthrough(pass) {
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  state.petWindow.setIgnoreMouseEvents(Boolean(pass), { forward: true });
}

function movePet(direction, distance) {
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  const pack = currentPack();
  const walk = pack?.states?.walk ? "walk" : pack?.states?.run ? "run" : null;
  sendPlay(walk, null, { direction, distance: distance || 220 });
}

async function capturePrimaryJpeg() {
  const display = screen.getPrimaryDisplay();
  const size = display.size;
  const thumbW = Math.min(1280, size.width);
  const thumbH = Math.min(720, size.height);
  const hidden = state.petWindow && !state.petWindow.isDestroyed() && state.petWindow.isVisible();
  if (hidden) state.petWindow.hide();
  captureNotice.concealForGrab();
  await new Promise((r) => setTimeout(r, 80));
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: thumbW, height: thumbH },
    });
    const match =
      sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    if (!match) throw new Error("no screen source");
    return match.thumbnail.toJPEG(70);
  } finally {
    captureNotice.restoreAfterGrab();
    if (hidden && state.petWindow && !state.petWindow.isDestroyed()) {
      state.petWindow.showInactive();
    }
  }
}

function createPetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const settings = loadSettings();
  const pack = currentPack();
  const winSize = packWindowSize(pack);

  state.petWindow = new BrowserWindow({
    width: winSize.width,
    height: winSize.height,
    x: Math.max(0, width - winSize.width - 40),
    y: Math.max(0, height - winSize.height - 40),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    hasShadow: false,
    webPreferences: browserWebPreferences(),
  });
  hardenWindow(state.petWindow);

  state.petWindow.setAlwaysOnTop(settings.alwaysOnTop, "screen-saver");
  state.petWindow.loadFile(appFile("renderer", "index.html"));
  state.petWindow.webContents.on("did-finish-load", () => {
    setPetPassthrough(true);
    rememberPetOuterSize();
    require("./compose").prewarmComposeWindow();
  });
  // Follow only. Do not read getBounds() back into petOuterSize: on Windows a
  // transparent window's reported size drifts, and the next drag would apply it.
  state.petWindow.on("move", () => require("./compose").positionComposeBesidePet());
  state.petWindow.on("closed", () => {
    state.petWindow = null;
  });
}

function nudgePetWindow(delta, { closeMenu = false } = {}) {
  if (!state.petWindow || state.petWindow.isDestroyed()) return;
  if (closeMenu) require("./windows").closePetMenu();
  const b = state.petWindow.getBounds();
  const size = petBox();
  if (!state.nudgePos) state.nudgePos = { x: b.x, y: b.y };
  state.nudgePos.x += Number(delta?.dx || 0);
  state.nudgePos.y += Number(delta?.dy || 0);
  const work = screen.getPrimaryDisplay().workArea;
  const x = clamp(state.nudgePos.x, work.x, work.x + work.width - size.width);
  const y = clamp(state.nudgePos.y, work.y, work.y + work.height - size.height);
  state.nudgePos = { x, y };
  if (state.appliedPetContent) {
    state.petWindow.setContentSize(state.appliedPetContent.width, state.appliedPetContent.height);
  }
  state.petWindow.setPosition(Math.round(x), Math.round(y));
  require("./compose").positionComposeBesidePet();
}

module.exports = {
  rememberPetOuterSize,
  petBox,
  packWindowSize,
  resizePetToPack,
  floatText,
  sendPlay,
  sendFacing,
  setPetPassthrough,
  movePet,
  capturePrimaryJpeg,
  createPetWindow,
  nudgePetWindow,
};
