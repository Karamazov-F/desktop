/**
 * Self-verify: open pet window for a pack, assert content size, capture idle + action frames.
 * Usage: node_modules/electron/dist/electron.exe scripts/verify_pet_display.js [packId]
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { readPack } = require("../app/lib/packs");

app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, "..");
const PACKS = path.join(ROOT, "packs");
const OUT = path.join(ROOT, "comfy", "verify");
const packId = process.argv[2] || "sample-human";

function packWindowSize(pack) {
  const w = Math.max(64, Number(pack?.size?.width) || 128);
  const h = Math.max(64, Number(pack?.size?.height) || 128);
  const bubble = pack?.persona || pack?.dialogue ? 88 : 0;
  return { width: w + 32, height: h + 32 + 16 + bubble };
}

app.whenReady().then(async () => {
  const pack = readPack(PACKS, packId);
  if (!pack) {
    console.error("pack missing", packId);
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

  // preload bootstrap needs ipc — stub minimal handlers
  const { ipcMain } = require("electron");
  ipcMain.handle("get-bootstrap", () => ({
    settings: { packId, alwaysOnTop: true },
    packsDir: PACKS,
    packs: [{ id: pack.id, name: pack.name }],
    pack,
  }));
  ipcMain.handle("set-pack", () => pack);
  ipcMain.handle("get-settings", () => ({ packId }));
  ipcMain.handle("resize-to-pack", (_e, size) => {
    const s = packWindowSize({
      ...pack,
      size: size || pack.size,
    });
    win.setContentSize(s.width, s.height);
    return { width: s.width, height: s.height };
  });
  ipcMain.handle("set-compose-open", () => ({ ok: true }));
  ipcMain.handle("open-pet-menu", () => true);
  ipcMain.handle("get-chat-log", () => []);
  ipcMain.on("mouse-passthrough", () => {});
  ipcMain.on("pet-drag-by", () => {});
  ipcMain.on("pet-nudge-by", () => {});
  ipcMain.handle("get-work-area", () => ({
    win: { x: 100, y: 100, width: 200, height: 200 },
    work: { x: 0, y: 0, width: 1920, height: 1080 },
  }));

  await win.loadFile(path.join(ROOT, "app", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 1200));
  // Opaque backdrop; hide bubble so margin check is sprite-only
  await win.webContents.executeJavaScript(
    `document.documentElement.style.background='#222';document.body.style.background='#222';
     const b=document.getElementById('bubble'); if(b){b.classList.remove('show');b.style.display='none';}`
  );

  const [cw, ch] = win.getContentSize();
  const needW = pack.size.width;
  const needH = pack.size.height;
  const sizeOk = cw >= needW && ch >= needH;

  async function pinFrame(url) {
    if (!url) return;
    const result = await win.webContents.executeJavaScript(
      `window.__petTest && window.__petTest.pinFrame(${JSON.stringify(url)})`
    );
    console.log("pinFrame", path.basename(String(url)), "->", result);
    await new Promise((r) => setTimeout(r, 120));
  }

  async function capture(name) {
    const p = path.join(OUT, name);
    const img = await win.webContents.capturePage();
    const size = img.getSize();
    fs.writeFileSync(p, img.toPNG());
    // non-transparent pixel bbox via raw bitmap
    const raw = img.toBitmap();
    let minY = size.height,
      maxY = 0,
      minX = size.width,
      maxX = 0,
      hit = 0;
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) {
        const i = (y * size.width + x) * 4;
        const a = raw[i + 3];
        const r = raw[i + 2],
          g = raw[i + 1],
          b = raw[i];
        // ignore near-backdrop
        if (a < 8) continue;
        if (Math.abs(r - 34) < 8 && Math.abs(g - 34) < 8 && Math.abs(b - 34) < 8) continue;
        hit++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const topMargin = hit ? minY : -1;
    const bottomMargin = hit ? size.height - 1 - maxY : -1;
    console.log("wrote", p, { size, hit, topMargin, bottomMargin });
    return { topMargin, bottomMargin, hit };
  }

  // Pin contact/idle_0 for margin audit (ignore mid-loop animation frame)
  const idleUrl =
    pack.states.idle?.frames?.[0] ||
    pack.states.meow?.frames?.[0];
  if (idleUrl) await pinFrame(idleUrl);
  const idleCap = await capture(`${packId}_idle_window.png`);
  const marginsOk = idleCap.topMargin >= 2 && idleCap.bottomMargin >= 2;

  // Sample wave: first, mid, last (full dumps are slow; seam already pixel-checked)
  const meowFrames = pack.states.meow?.frames || [];
  const sampleIdx = meowFrames.length
    ? [0, Math.floor((meowFrames.length - 1) / 2), meowFrames.length - 1]
    : [];
  for (const i of sampleIdx) {
    await pinFrame(meowFrames[i]);
    await capture(`${packId}_meow_${i}_window.png`);
  }

  const walkFrames = pack.states.walk?.frames || [];
  const walkIdx = walkFrames.length
    ? [0, Math.floor((walkFrames.length - 1) / 2), walkFrames.length - 1]
    : [];
  for (const i of walkIdx) {
    await pinFrame(walkFrames[i]);
    await capture(`${packId}_walk_${i}_window.png`);
  }

  let facingLeft = null;
  if (walkFrames.length) {
    const mid = walkFrames[Math.floor((walkFrames.length - 1) / 2)];
    await pinFrame(mid);
    await win.webContents.executeJavaScript(
      `window.__petTest && window.__petTest.setFacing("right")`
    );
    await capture(`${packId}_walk_face_right.png`);
    await win.webContents.executeJavaScript(
      `window.__petTest && window.__petTest.setFacing("left")`
    );
    facingLeft = await win.webContents.executeJavaScript(
      `window.__petTest && window.__petTest.getState()`
    );
    await capture(`${packId}_walk_face_left.png`);
  }

  const walkOk = !walkFrames.length || walkFrames.length >= 6;
  const facingOk = !walkFrames.length || facingLeft?.facing === "left";

  let walkMotionOk = !walkFrames.length;
  if (walkFrames.length) {
    await win.webContents.executeJavaScript(
      `window.__petTest && window.__petTest.play("walk")`
    );
    await new Promise((r) => setTimeout(r, 120));
    const srcA = await win.webContents.executeJavaScript(
      `window.__petTest && window.__petTest.frameSrc()`
    );
    await new Promise((r) => setTimeout(r, 400));
    const srcB = await win.webContents.executeJavaScript(
      `window.__petTest && window.__petTest.frameSrc()`
    );
    const playing = await win.webContents.executeJavaScript(
      `window.__petTest && window.__petTest.getState()`
    );
    walkMotionOk =
      Boolean(srcA) && srcA !== srcB && playing?.currentStateName === "walk";
    console.log("walkMotion", { srcA, srcB, state: playing?.currentStateName, walkMotionOk });
  }

  console.log(
    JSON.stringify({
      packId,
      packSize: pack.size,
      contentSize: { width: cw, height: ch },
      sizeOk,
      marginsOk,
      topMargin: idleCap.topMargin,
      bottomMargin: idleCap.bottomMargin,
      actionLabel: pack.states.meow?.label || null,
      walkLabel: pack.states.walk?.label || null,
      meowFrames: pack.states.meow?.frames?.length || 0,
      walkFrames: walkFrames.length,
      facing: facingLeft?.facing || null,
      lifeEnabled: facingLeft?.lifeEnabled,
      walkMotionOk,
    })
  );

  if (!sizeOk) {
    console.error("FAIL: content size smaller than pack sprite");
    app.exit(2);
    return;
  }
  if (!marginsOk) {
    console.error("FAIL: sprite touches window edge (likely clipped)");
    app.exit(3);
    return;
  }
  if (!walkOk) {
    console.error("FAIL: walk clip too short");
    app.exit(4);
    return;
  }
  if (!facingOk) {
    console.error("FAIL: facing left did not apply");
    app.exit(5);
    return;
  }
  if (!walkMotionOk) {
    console.error("FAIL: walk frames did not change while playing");
    app.exit(6);
    return;
  }
  app.exit(0);
});
