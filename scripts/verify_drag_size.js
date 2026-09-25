/**
 * Drag must not grow the pet window or the speech bubble.
 * Reproduces the Windows feedback loop (setBounds size read back from getBounds)
 * and checks setPosition leaves size and bubble metrics stable.
 *
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_drag_size.js
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { readPack } = require("../app/lib/packs");

app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, "..");
const PACKS = path.join(ROOT, "packs");

function fail(code, msg, extra) {
  console.error("FAIL:", msg, extra ? JSON.stringify(extra) : "");
  app.exit(code);
}

app.whenReady().then(async () => {
  const pack = readPack(PACKS, "xiao-jing");
  if (!pack) {
    fail(1, "pack missing");
    return;
  }

  const bare = new BrowserWindow({
    width: 220,
    height: 180,
    frame: false,
    transparent: true,
    resizable: false,
    show: true,
  });
  let fed = bare.getBounds();
  const start = { width: fed.width, height: fed.height };
  for (let i = 0; i < 25; i++) {
    bare.setBounds({ x: fed.x + 3, y: fed.y + 2, width: fed.width, height: fed.height });
    fed = bare.getBounds();
  }
  const fedDelta = {
    dw: fed.width - start.width,
    dh: fed.height - start.height,
  };
  bare.close();

  const w = (pack.size?.width || 128) + 48;
  const h = (pack.size?.height || 128) + 80;
  const win = new BrowserWindow({
    width: w,
    height: h,
    x: 200,
    y: 200,
    frame: false,
    transparent: true,
    resizable: false,
    show: true,
    webPreferences: {
      preload: path.join(ROOT, "app", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ipcMain.handle("get-bootstrap", () => ({
    settings: { packId: pack.id, alwaysOnTop: true, lifeStream: false },
    packsDir: PACKS,
    packs: [{ id: pack.id, name: pack.name }],
    pack,
    chatLog: [],
  }));
  ipcMain.handle("set-pack", () => pack);
  ipcMain.handle("get-settings", () => ({ packId: pack.id, lifeStream: false }));
  ipcMain.handle("resize-to-pack", (_e, size) => {
    const bubbleH = Math.max(0, Math.round(Number(size?.bubbleH) || 0));
    const pw = Math.max(64, Number(size?.width) || 128) + 32;
    const ph = Math.max(64, Number(size?.height) || 128) + 48 + bubbleH;
    const old = win.getBounds();
    const bottom = old.y + old.height;
    win.setContentSize(pw, ph);
    const neu = win.getBounds();
    win.setBounds({
      x: old.x,
      y: bottom - neu.height,
      width: neu.width,
      height: neu.height,
    });
    return { width: pw, height: ph };
  });
  ipcMain.on("mouse-passthrough", () => {});
  ipcMain.on("pet-drag-by", () => {});
  ipcMain.on("pet-nudge-by", () => {});

  await win.loadFile(path.join(ROOT, "app", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 600));
  const line =
    "主人今天想喝奶茶还是咖啡呀？甜一点的话加珍珠好不好？要是累了我给主人捏捏肩～不过太晚喝会睡不着哦。";
  await win.webContents.executeJavaScript(
    `window.__petTest.showBubble(${JSON.stringify(line)}, 8000)`
  );
  await new Promise((r) => setTimeout(r, 300));

  const before = win.getBounds();
  const bubbleBefore = await win.webContents.executeJavaScript(`(() => {
    const r = document.getElementById("bubble").getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  })()`);

  let pos = { x: before.x, y: before.y };
  const [contentW, contentH] = win.getContentSize();
  for (let i = 0; i < 40; i++) {
    pos = { x: pos.x + 4, y: pos.y + 3 };
    win.setContentSize(contentW, contentH);
    win.setPosition(pos.x, pos.y);
  }
  await new Promise((r) => setTimeout(r, 80));

  const after = win.getBounds();
  const bubbleAfter = await win.webContents.executeJavaScript(`(() => {
    const r = document.getElementById("bubble").getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  })()`);

  const sizeDrift = Math.abs(after.width - before.width) + Math.abs(after.height - before.height);
  const bubbleDrift =
    Math.abs(bubbleAfter.w - bubbleBefore.w) + Math.abs(bubbleAfter.h - bubbleBefore.h);
  if (sizeDrift > 4 || bubbleDrift > 4) {
    fail(2, "drag grew the window or the bubble", {
      before,
      after,
      bubbleBefore,
      bubbleAfter,
      fedDelta,
    });
    return;
  }

  console.log(
    JSON.stringify(
      { ok: true, fedDelta, sizeDrift, bubbleDrift, bubbleBefore, bubbleAfter },
      null,
      2
    )
  );
  app.exit(0);
});
