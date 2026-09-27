const { BrowserWindow, screen } = require("electron");
const { appFile } = require("./state");
const { browserWebPreferences, hardenWindow } = require("./window-guard");
const { createHideWait } = require("./hide-wait");

const MIN_VISIBLE_MS = 1200;
let win = null;
let shownAt = 0;
let visibleWanted = false;
const hideWait = createHideWait();

function place() {
  if (!win || win.isDestroyed()) return;
  const work = screen.getPrimaryDisplay().workArea;
  const width = 460;
  const height = 76;
  win.setBounds({
    width,
    height,
    x: work.x + Math.round((work.width - width) / 2),
    y: work.y + 28,
  });
}

function show() {
  visibleWanted = true;
  shownAt = Date.now();
  hideWait.cancel();
  if (win && !win.isDestroyed()) {
    place();
    if (!win.isVisible()) win.showInactive();
    return;
  }
  const work = screen.getPrimaryDisplay().workArea;
  const width = 460;
  const height = 76;
  win = new BrowserWindow({
    width,
    height,
    x: work.x + Math.round((work.width - width) / 2),
    y: work.y + 28,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: browserWebPreferences(),
  });
  hardenWindow(win);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(true);
  win.loadFile(appFile("renderer", "capture-notice.html"));
  win.once("ready-to-show", () => {
    if (!visibleWanted || !win || win.isDestroyed()) return;
    win.showInactive();
  });
  win.on("closed", () => {
    win = null;
  });
}

function concealForGrab() {
  if (win && !win.isDestroyed() && win.isVisible()) win.hide();
}

function restoreAfterGrab() {
  if (!visibleWanted) return;
  if (win && !win.isDestroyed()) win.showInactive();
}

async function hide() {
  visibleWanted = false;
  const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
  await hideWait.wait(wait);
  if (!visibleWanted && win && !win.isDestroyed()) win.hide();
}

async function setCaptureNotice(on) {
  if (on) show();
  else await hide();
}

module.exports = {
  setCaptureNotice,
  concealForGrab,
  restoreAfterGrab,
};
