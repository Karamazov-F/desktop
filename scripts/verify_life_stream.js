/**
 * Live: load pet, click-ack changes animation, drag lift class, facing flip, roam plan.
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_life_stream.js
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { readPack } = require("../app/lib/packs");

app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, "..");
const PACKS = path.join(ROOT, "packs");
const OUT = path.join(ROOT, "comfy", "verify");
const packId = "sample-human";

function packWindowSize(pack) {
  const w = Math.max(64, Number(pack?.size?.width) || 128);
  const h = Math.max(64, Number(pack?.size?.height) || 128);
  return { width: w + 32, height: h + 32 + 16 + 88 };
}

app.whenReady().then(async () => {
  const pack = readPack(PACKS, packId);
  if (!pack) {
    console.error("pack missing");
    app.exit(1);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const winSize = packWindowSize(pack);
  const win = new BrowserWindow({
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
    settings: { packId, alwaysOnTop: true, lifeStream: true },
    packsDir: PACKS,
    packs: [{ id: pack.id, name: pack.name }],
    pack,
  }));
  ipcMain.handle("set-pack", () => pack);
  ipcMain.handle("get-settings", () => ({ packId, lifeStream: true }));
  ipcMain.handle("resize-to-pack", (_e, size) => {
    const s = packWindowSize({ ...pack, size: size || pack.size });
    win.setContentSize(s.width, s.height);
    return { width: s.width, height: s.height };
  });
  ipcMain.handle("set-compose-open", () => ({ ok: true }));
  ipcMain.handle("open-pet-menu", () => true);
  ipcMain.handle("get-pet-menu", () => ({ actions: [] }));
  ipcMain.handle("get-chat-log", () => []);
  ipcMain.on("mouse-passthrough", () => {});
  const outer = { width: winSize.width, height: winSize.height };
  ipcMain.on("pet-drag-by", (_e, delta) => {
    const b = win.getBounds();
    win.setBounds({
      x: Math.round(b.x + Number(delta?.dx || 0)),
      y: Math.round(b.y + Number(delta?.dy || 0)),
      width: outer.width,
      height: outer.height,
    });
  });
  ipcMain.on("pet-nudge-by", () => {});
  ipcMain.handle("get-work-area", () => ({
    win: { x: 400, y: 300, width: winSize.width, height: winSize.height },
    work: { x: 0, y: 0, width: 1920, height: 1080 },
  }));

  await win.loadFile(path.join(ROOT, "app", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 1400));

  const ready = await win.webContents.executeJavaScript(`({
    hasBehavior: Boolean(window.PetBehavior),
    hasTest: Boolean(window.__petTest),
    puppet: Boolean(document.getElementById("puppet")),
    spriteB: Boolean(document.getElementById("sprite-b")),
    state: window.__petTest && window.__petTest.getState(),
    catalog: window.__petTest && window.__petTest.catalog(),
  })`);
  if (!ready.hasBehavior || !ready.hasTest || !ready.puppet || !ready.spriteB) {
    console.error("FAIL: renderer hooks missing", ready);
    app.exit(2);
    return;
  }
  if (!ready.catalog.clicks.includes("meow")) {
    console.error("FAIL: click pool", ready.catalog);
    app.exit(3);
    return;
  }

  await win.webContents.executeJavaScript(`document.documentElement.style.background='#222';document.body.style.background='#222';`);
  const idlePng = path.join(OUT, "life_idle.png");
  fs.writeFileSync(idlePng, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`window.__petTest.clickAck()`);
  await new Promise((r) => setTimeout(r, 900));
  const afterClick = await win.webContents.executeJavaScript(`window.__petTest.getState()`);
  if (afterClick.currentStateName === "idle") {
    console.error("FAIL: click did not leave idle", afterClick);
    app.exit(4);
    return;
  }
  if (!["meow", "happy"].includes(afterClick.currentStateName)) {
    console.error("FAIL: click action not in pool", afterClick);
    app.exit(5);
    return;
  }
  const clickPng = path.join(OUT, "life_click.png");
  fs.writeFileSync(clickPng, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`window.__petTest.setDragging(true)`);
  const lifted = await win.webContents.executeJavaScript(`window.__petTest.getState()`);
  if (!lifted.dragging || !lifted.lifted) {
    console.error("FAIL: drag lift", lifted);
    app.exit(6);
    return;
  }
  const h0 = win.getBounds().height;
  await win.webContents.executeJavaScript(`
    for (let i = 0; i < 40; i++) window.petApi.dragBy({ dx: 2, dy: 1 });
  `);
  await new Promise((r) => setTimeout(r, 80));
  const h1 = win.getBounds().height;
  if (Math.abs(h1 - h0) > 2) {
    console.error("FAIL: window grew while dragging", { h0, h1 });
    app.exit(10);
    return;
  }
  await win.webContents.executeJavaScript(`
    document.getElementById("hit").dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, button: 0
    }));
  `);
  const afterMenu = await win.webContents.executeJavaScript(`window.__petTest.getState()`);
  if (afterMenu.composeOpen) {
    console.error("FAIL: long-press/drag opened compose", afterMenu);
    app.exit(11);
    return;
  }
  const scroll = await win.webContents.executeJavaScript(`({
    htmlOverflow: getComputedStyle(document.documentElement).overflow,
    bodyOverflow: getComputedStyle(document.body).overflow,
    hBar: window.innerHeight - document.documentElement.clientHeight,
    vBar: window.innerWidth - document.documentElement.clientWidth,
  })`);
  if (scroll.htmlOverflow !== "hidden" || scroll.bodyOverflow !== "hidden") {
    console.error("FAIL: overflow not hidden", scroll);
    app.exit(8);
    return;
  }
  if (scroll.hBar > 1 || scroll.vBar > 1) {
    console.error("FAIL: scrollbar while dragging", scroll);
    app.exit(9);
    return;
  }
  const dragPng = path.join(OUT, "life_drag.png");
  fs.writeFileSync(dragPng, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`window.__petTest.setDragging(false)`);

  await win.webContents.executeJavaScript(`window.__petTest.setFacing("left")`);
  const faced = await win.webContents.executeJavaScript(`window.__petTest.getState()`);
  if (faced.facing !== "left") {
    console.error("FAIL: facing", faced);
    app.exit(7);
    return;
  }
  const facePng = path.join(OUT, "life_face_left.png");
  fs.writeFileSync(facePng, (await win.webContents.capturePage()).toPNG());

  console.log(
    JSON.stringify({
      ok: true,
      idleState: ready.state,
      afterClick,
      lifted: { dragging: lifted.dragging, lifted: lifted.lifted },
      facing: faced.facing,
      shots: [idlePng, clickPng, dragPng, facePng],
    })
  );
  app.exit(0);
});
