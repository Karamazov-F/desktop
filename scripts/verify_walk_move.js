/**
 * Verify dialogue-style directed walk: face left, play walk while translating, then idle.
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_walk_move.js
 */
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { readPack } = require("../app/lib/packs");

app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, "..");
const PACKS = path.join(ROOT, "packs");
const OUT = path.join(ROOT, "comfy", "verify");
const packId = "xiao-jing";

function packWindowSize(pack) {
  const w = Math.max(64, Number(pack?.size?.width) || 128);
  const h = Math.max(64, Number(pack?.size?.height) || 128);
  const bubble = pack?.persona || pack?.dialogue ? 88 : 0;
  return { width: w + 32, height: h + 32 + 16 + bubble };
}

function fail(code, msg, extra) {
  console.error("FAIL:", msg, extra ? JSON.stringify(extra) : "");
  app.exit(code);
}

app.whenReady().then(async () => {
  const pack = readPack(PACKS, packId);
  if (!pack?.states?.walk) {
    fail(1, "xiao-jing walk missing");
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const winSize = packWindowSize(pack);
  const work = screen.getPrimaryDisplay().workArea;
  const startX = Math.round(work.x + work.width / 2);
  const startY = Math.round(work.y + work.height / 2);
  const win = new BrowserWindow({
    x: startX,
    y: startY,
    width: winSize.width,
    height: winSize.height,
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
  }));
  ipcMain.handle("set-pack", () => pack);
  ipcMain.handle("get-settings", () => ({ packId, lifeStream: false }));
  ipcMain.handle("resize-to-pack", (_e, size) => {
    const s = packWindowSize({ ...pack, size: size || pack.size });
    win.setContentSize(s.width, s.height);
    return { width: s.width, height: s.height };
  });
  ipcMain.handle("set-compose-open", () => ({ ok: true }));
  ipcMain.handle("open-pet-menu", () => true);
  ipcMain.handle("get-chat-log", () => []);
  ipcMain.on("mouse-passthrough", () => {});
  ipcMain.on("pet-drag-by", () => {});
  let nudgePos = null;
  ipcMain.on("pet-nudge-by", (_e, delta) => {
    const b = win.getBounds();
    const area = screen.getPrimaryDisplay().workArea;
    if (!nudgePos) nudgePos = { x: b.x, y: b.y };
    nudgePos.x += Number(delta?.dx || 0);
    nudgePos.y += Number(delta?.dy || 0);
    const x = Math.max(
      area.x,
      Math.min(area.x + area.width - b.width, nudgePos.x)
    );
    const y = Math.max(
      area.y,
      Math.min(area.y + area.height - b.height, nudgePos.y)
    );
    nudgePos = { x, y };
    win.setBounds({ x, y, width: b.width, height: b.height });
  });
  ipcMain.handle("get-work-area", () => {
    const b = win.getBounds();
    const area = screen.getPrimaryDisplay().workArea;
    return {
      win: { x: b.x, y: b.y, width: b.width, height: b.height },
      work: { x: area.x, y: area.y, width: area.width, height: area.height },
    };
  });

  await win.loadFile(path.join(ROOT, "app", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 1400));

  const ready = await win.webContents.executeJavaScript(`({
    hasTest: Boolean(window.__petTest && window.__petTest.walkMove),
    hasPlan: Boolean(window.PetBehavior && window.PetBehavior.directedPlan),
    state: window.__petTest && window.__petTest.getState(),
  })`);
  if (!ready.hasTest || !ready.hasPlan) {
    fail(2, "renderer walkMove/directedPlan missing", ready);
    return;
  }

  const origin = win.getBounds();
  await win.webContents.executeJavaScript(
    `window.__petTest.setFacing("right")`
  );
  nudgePos = null;
  win.webContents.send("play-action", {
    action: "walk",
    line: "那我走两步。",
    move: { direction: "left", distance: 160 },
  });

  await new Promise((r) => setTimeout(r, 180));
  const midState = await win.webContents.executeJavaScript(
    `window.__petTest.getState()`
  );
  const srcA = await win.webContents.executeJavaScript(
    `window.__petTest.frameSrc()`
  );
  const midBounds = win.getBounds();
  fs.writeFileSync(
    path.join(OUT, "walk_move_mid.png"),
    (await win.webContents.capturePage()).toPNG()
  );

  await new Promise((r) => setTimeout(r, 400));
  const srcB = await win.webContents.executeJavaScript(
    `window.__petTest.frameSrc()`
  );
  const laterBounds = win.getBounds();

  await new Promise((r) => setTimeout(r, 2800));
  const endState = await win.webContents.executeJavaScript(
    `window.__petTest.getState()`
  );
  const endBounds = win.getBounds();
  fs.writeFileSync(
    path.join(OUT, "walk_move_idle.png"),
    (await win.webContents.capturePage()).toPNG()
  );

  const movedLeft = laterBounds.x < origin.x - 40 && endBounds.x < origin.x - 40;
  const distanceOk = Math.abs(endBounds.x - origin.x + 160) <= 24;
  const walked = midState.currentStateName === "walk" && srcA && srcA !== srcB;
  const facedLeft = midState.facing === "left" && endState.facing === "left";
  const backIdle = endState.currentStateName === "idle";

  const report = {
    ok: movedLeft && walked && facedLeft && backIdle && distanceOk,
    originX: origin.x,
    midX: midBounds.x,
    laterX: laterBounds.x,
    endX: endBounds.x,
    dx: endBounds.x - origin.x,
    midState: midState.currentStateName,
    endState: endState.currentStateName,
    facing: endState.facing,
    walkMotion: Boolean(srcA && srcA !== srcB),
    distanceOk,
    srcA,
    srcB,
  };
  console.log(JSON.stringify(report, null, 2));

  if (!walked) {
    fail(3, "walk animation did not play while moving", report);
    return;
  }
  if (!facedLeft) {
    fail(4, "did not face left", report);
    return;
  }
  if (!movedLeft) {
    fail(5, "window did not translate left", report);
    return;
  }
  if (!distanceOk) {
    fail(7, "walk distance drifted too far from 160px", report);
    return;
  }
  if (!backIdle) {
    fail(6, "did not return to idle", report);
    return;
  }
  app.exit(0);
});
