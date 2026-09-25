/**
 * Spam action switches; assert a sprite layer stays covered (no blank flash hole).
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_anim_switch.js
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { readPack } = require("../app/lib/packs");

app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, "..");
const PACKS = path.join(ROOT, "packs");
const packId = "xiao-jing";

function fail(code, msg, extra) {
  console.error("FAIL:", msg, extra ? JSON.stringify(extra) : "");
  app.exit(code);
}

app.whenReady().then(async () => {
  const pack = readPack(PACKS, packId);
  if (!pack) {
    fail(1, "pack missing");
    return;
  }
  const w = (pack.size?.width || 128) + 32;
  const h = (pack.size?.height || 128) + 48;
  const win = new BrowserWindow({
    width: w,
    height: h,
    frame: false,
    transparent: true,
    show: true,
    webPreferences: {
      preload: path.join(ROOT, "app", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ipcMain.handle("get-bootstrap", () => ({
    settings: { packId, alwaysOnTop: true, lifeStream: false },
    packsDir: PACKS,
    packs: [{ id: pack.id, name: pack.name }],
    pack,
    chatLog: [],
  }));
  ipcMain.handle("set-pack", () => pack);
  ipcMain.handle("get-settings", () => ({ packId, lifeStream: false }));
  ipcMain.handle("resize-to-pack", () => ({ width: w, height: h }));
  ipcMain.on("mouse-passthrough", () => {});
  ipcMain.on("pet-drag-by", () => {});
  ipcMain.on("pet-nudge-by", () => {});

  await win.loadFile(path.join(ROOT, "app", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 700));

  const actions = Object.keys(pack.states || {}).filter((k) => k !== "idle");
  if (actions.length < 2) {
    fail(2, "need >=2 actions to spam", { actions });
    return;
  }

  const samples = [];
  for (let round = 0; round < 8; round++) {
    const snap = await win.webContents.executeJavaScript(
      `window.__petTest.spamActions(${JSON.stringify(actions)}, 16)`
    );
    samples.push(snap);
    await new Promise((r) => setTimeout(r, 40));
    const mid = await win.webContents.executeJavaScript(`({
      aShow: document.getElementById("sprite").classList.contains("show"),
      bShow: document.getElementById("sprite-b").classList.contains("show"),
      aOp: getComputedStyle(document.getElementById("sprite")).opacity,
      bOp: getComputedStyle(document.getElementById("sprite-b")).opacity,
      state: window.__petTest.getState().currentStateName,
    })`);
    samples.push(mid);
    if (!mid.aShow && !mid.bShow) {
      fail(3, "both sprite layers hidden mid spam (flicker hole)", mid);
      return;
    }
    if (Number(mid.aOp) < 0.05 && Number(mid.bOp) < 0.05) {
      fail(4, "both layers near-transparent mid spam", mid);
      return;
    }
  }

  // Settle on idle; still covered.
  await win.webContents.executeJavaScript(`window.__petTest.play("idle")`);
  await new Promise((r) => setTimeout(r, 200));
  const idle = await win.webContents.executeJavaScript(`({
    aShow: document.getElementById("sprite").classList.contains("show"),
    bShow: document.getElementById("sprite-b").classList.contains("show"),
    state: window.__petTest.getState().currentStateName,
  })`);
  if (!idle.aShow && !idle.bShow) {
    fail(5, "idle left both layers hidden", idle);
    return;
  }

  console.log(JSON.stringify({ ok: true, actions, samples: samples.slice(0, 4), idle }, null, 2));
  app.exit(0);
});
