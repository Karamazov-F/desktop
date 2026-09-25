/**
 * Capture every UI surface for docs/features/*.md into docs/features/img/.
 *
 * Self-splitting: run with plain `node scripts/capture_docs_ui.js` and it spawns
 * one Electron process per section (transparent windows + software rendering
 * crash intermittently when 6+ windows pile up in one process — keep sections
 * isolated, same pattern as the existing verify_*.js scripts).
 *
 * Sections: pet, menu, compose, chat, settings, setup, packer.
 * Re-run whenever UI changes; docs/features/*.md reference these PNGs.
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const PACKS = path.join(ROOT, "packs");
const OUT = path.join(ROOT, "docs", "features", "img");
const SECTIONS = ["pet", "menu", "compose", "chat", "settings", "setup", "packer"];
const EXPECTED = [
  "pet_idle.png",
  "pet_bubble.png",
  "pet_menu.png",
  "compose_pill.png",
  "compose.png",
  "chat_history.png",
  "settings.png",
  "setup_deps.png",
  "packer.png",
];

// ---------------------------------------------------------------- runner (node)
if (!process.versions.electron) {
  const { spawnSync } = require("child_process");
  const electron = path.join(ROOT, "app", "node_modules", "electron", "dist", "electron.exe");
  fs.mkdirSync(OUT, { recursive: true });
  let failed = 0;
  for (const s of SECTIONS) {
    const r = spawnSync(electron, [__filename, s], { stdio: "inherit", timeout: 60000 });
    if (r.status !== 0) {
      failed += 1;
      console.error(`section ${s} FAILED (exit ${r.status})`);
    }
  }
  const missing = EXPECTED.filter((f) => {
    const p = path.join(OUT, f);
    return !fs.existsSync(p) || fs.statSync(p).size < 3000;
  });
  if (missing.length) {
    failed += 1;
    console.error("missing/suspicious captures:", missing.join(", "));
  }
  console.log(JSON.stringify({ ok: failed === 0, dir: OUT, files: EXPECTED }, null, 2));
  process.exit(failed === 0 ? 0 : 2);
}

// ---------------------------------------------------------------- worker (electron)
const section = process.argv[2];
const { app, BrowserWindow, ipcMain } = require("electron");
const { readPack } = require("../app/lib/packs");
const hotkeys = require("../app/lib/hotkeys");
const deps = require("../app/lib/deps");

app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});

const pack = readPack(PACKS, "sample-human");
const preload = path.join(ROOT, "app", "preload.js");

function basePrefs(pre) {
  return { preload: pre, contextIsolation: true, nodeIntegration: false };
}

function packWindowSize(p, { bubbleH = 0 } = {}) {
  const w = Math.max(64, Number(p?.size?.width) || 128);
  const h = Math.max(64, Number(p?.size?.height) || 128);
  return { width: w + 32, height: h + 32 + 16 + Math.max(240, Math.round(bubbleH)) };
}

async function waitFonts(win) {
  await win.webContents.executeJavaScript(`document.fonts.ready.then(() => true)`);
  await new Promise((r) => setTimeout(r, 120));
}

async function shot(win, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const img = await win.webContents.capturePage();
  const p = path.join(OUT, name);
  fs.writeFileSync(p, img.toPNG());
  const bytes = fs.statSync(p).size;
  console.log("captured", name, bytes);
  if (bytes < 3000) throw new Error(`suspicious tiny capture ${name} ${bytes}`);
}

function stubChrome() {
  ipcMain.handle("win-min", (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.handle("win-close", (e) => BrowserWindow.fromWebContents(e.sender)?.close());
}

const builders = {
  // pet window: idle frame on a docs-only backdrop, then a long speech bubble
  async pet() {
    const size = packWindowSize(pack);
    const win = new BrowserWindow({
      width: size.width,
      height: size.height,
      frame: false,
      transparent: true,
      show: true,
      webPreferences: basePrefs(preload),
    });
    ipcMain.handle("get-bootstrap", () => ({
      settings: { packId: pack.id, alwaysOnTop: true, lifeStream: false },
      packsDir: PACKS,
      packs: [{ id: pack.id, name: pack.name }],
      pack,
      voiceHotkey: hotkeys.DEFAULTS.voiceHotkey,
      hideHotkey: hotkeys.DEFAULTS.hideHotkey,
      chatLog: [],
    }));
    ipcMain.handle("set-pack", () => pack);
    ipcMain.handle("get-settings", () => ({ packId: pack.id, lifeStream: false }));
    ipcMain.handle("resize-to-pack", (_e, s) => {
      const next = packWindowSize({ ...pack, size: s || pack.size }, { bubbleH: s?.bubbleH });
      const old = win.getBounds();
      win.setContentSize(next.width, next.height);
      const neu = win.getBounds();
      win.setBounds({ x: old.x, y: old.y + old.height - neu.height, width: neu.width, height: neu.height });
      return { width: next.width, height: next.height };
    });
    ipcMain.handle("set-compose-open", () => ({ ok: true }));
    ipcMain.handle("open-pet-menu", () => true);
    ipcMain.handle("get-pet-menu", () => ({ actions: [] }));
    ipcMain.handle("get-chat-log", () => []);
    ipcMain.handle("open-chat", () => true);
    ipcMain.on("mouse-passthrough", () => {});
    ipcMain.on("pet-drag-by", () => {});
    ipcMain.on("pet-nudge-by", () => {});

    await win.loadFile(path.join(ROOT, "app", "renderer", "index.html"));
    await new Promise((r) => setTimeout(r, 1500));
    await waitFonts(win);
    // Docs-only backdrop so the transparent window reads as a still image.
    await win.webContents.executeJavaScript(`
      document.documentElement.style.background = 'linear-gradient(180deg,#3b404c 0%,#26272c 100%)';
      document.body.style.background = 'transparent';
      document.getElementById('bubble').classList.remove('show');
    `);
    await win.webContents.executeJavaScript(
      `window.__petTest.pinFrame(${JSON.stringify(pack.states.idle.frames[0])})`
    );
    await new Promise((r) => setTimeout(r, 200));
    await shot(win, "pet_idle.png");

    await win.webContents.executeJavaScript(
      `window.__petTest.showBubble(${JSON.stringify("主人今天想喝奶茶还是咖啡呀？甜一点的话加珍珠好不好？")}, 30000)`
    );
    await new Promise((r) => setTimeout(r, 300));
    await shot(win, "pet_bubble.png");
  },

  // right-click menu with the action flyout open
  async menu() {
    stubChrome();
    const menuWin = new BrowserWindow({
      width: 420,
      height: 180,
      frame: false,
      transparent: true,
      show: true,
      webPreferences: basePrefs(preload),
    });
    ipcMain.handle("get-pet-menu", () => ({
      actions: [
        { id: "idle", label: "待机" },
        { id: "stretch", label: "伸懒腰" },
        { id: "sleep", label: "睡觉" },
        { id: "happy", label: "开心" },
        { id: "meow", label: "挥手" },
      ],
    }));
    ipcMain.handle("pet-menu-command", () => true);
    await menuWin.loadFile(path.join(ROOT, "app", "renderer", "pet-menu.html"));
    await new Promise((r) => setTimeout(r, 400));
    await menuWin.webContents.executeJavaScript(`
      document.getElementById("actions-btn").dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      document.getElementById("sub").dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    `);
    await waitFonts(menuWin);
    await shot(menuWin, "pet_menu.png");
  },

  // Mini composer dock: collapsed quick-action pill (hover preview) and the
  // expanded capsule input (explicit open). Both on a docs-only backdrop.
  async compose() {
    stubChrome();
    const backdrop = `
      document.documentElement.style.background = 'linear-gradient(180deg,#3b404c 0%,#26272c 100%)';
      document.body.style.background = 'transparent';
    `;
    const pillWin = new BrowserWindow({
      width: 120,
      height: 76,
      frame: false,
      transparent: true,
      show: true,
      webPreferences: basePrefs(preload),
    });
    await pillWin.loadFile(path.join(ROOT, "app", "renderer", "compose.html"));
    await new Promise((r) => setTimeout(r, 400));
    await pillWin.webContents.executeJavaScript(`
      ${backdrop}
      document.getElementById("card").style.setProperty("--dock-x", "60px");
    `);
    await waitFonts(pillWin);
    await shot(pillWin, "compose_pill.png");
    pillWin.close();

    const composeWin = new BrowserWindow({
      width: 360,
      height: 68,
      frame: false,
      transparent: true,
      show: true,
      webPreferences: basePrefs(preload),
    });
    await composeWin.loadFile(path.join(ROOT, "app", "renderer", "compose.html"));
    await new Promise((r) => setTimeout(r, 300));
    await composeWin.webContents.executeJavaScript(`
      ${backdrop}
      document.getElementById("open-compose").click();
    `);
    await new Promise((r) => setTimeout(r, 350));
    await waitFonts(composeWin);
    await shot(composeWin, "compose.png");
  },

  // standalone chat history window with a seeded conversation
  async chat() {
    stubChrome();
    const chatWin = new BrowserWindow({
      width: 360,
      height: 520,
      frame: false,
      show: true,
      backgroundColor: "#121211",
      webPreferences: basePrefs(preload),
    });
    ipcMain.handle("get-bootstrap", () => ({
      settings: {
        packId: pack.id,
        deepseekEnabled: true,
        hasDeepseekKey: true,
        memoryEnabled: true,
        visionEnabled: false,
        lifeStream: false,
      },
      packsDir: PACKS,
      packs: [{ id: pack.id, name: pack.name }],
      pack,
      voiceHotkey: hotkeys.DEFAULTS.voiceHotkey,
      hideHotkey: hotkeys.DEFAULTS.hideHotkey,
      chatLog: [
        { role: "user", text: "你好呀", at: "2026-09-22T07:00:00Z" },
        { role: "bot", text: "嗨～我在。", at: "2026-09-22T07:00:01Z" },
        { role: "user", text: "我有点困", at: "2026-09-22T07:01:00Z" },
        { role: "bot", text: "那…我陪你眯一会儿？", at: "2026-09-22T07:01:02Z" },
      ],
    }));
    ipcMain.handle("chat", () => ({ text: "嗯。", displayName: "小杏", source: "local" }));
    ipcMain.handle("voice-start", () => ({ ok: true }));
    ipcMain.handle("voice-stop", () => ({ ok: true }));
    await chatWin.loadFile(path.join(ROOT, "app", "renderer", "chat.html"));
    await new Promise((r) => setTimeout(r, 500));
    await waitFonts(chatWin);
    await shot(chatWin, "chat_history.png");
  },

  // settings window, fresh-install state (no key saved yet)
  async settings() {
    stubChrome();
    const settingsWin = new BrowserWindow({
      width: 400,
      height: 700,
      frame: false,
      show: true,
      backgroundColor: "#121211",
      webPreferences: basePrefs(preload),
    });
    ipcMain.handle("get-settings", () => ({
      deepseekEnabled: false,
      memoryEnabled: false,
      visionEnabled: false,
      alwaysOnTop: true,
      lifeStream: false,
      hideOnFullscreen: true,
      deepseekBaseUrl: "https://api.deepseek.com",
      deepseekModel: "deepseek-flash",
      visionModel: "deepseek-flash",
      hasDeepseekKey: false,
      hideHotkey: hotkeys.DEFAULTS.hideHotkey,
      voiceHotkey: hotkeys.DEFAULTS.voiceHotkey,
    }));
    ipcMain.handle("save-settings", (_e, partial) => ({
      ...partial,
      hasDeepseekKey: false,
      hotkeyBind: { voice: true, hide: true },
    }));
    ipcMain.handle("clear-memory", () => ({ ok: true }));
    ipcMain.handle("import-pack", () => ({}));
    ipcMain.handle("import-pack-folder", () => null);
    ipcMain.handle("open-deps", () => true);
    await settingsWin.loadFile(path.join(ROOT, "app", "renderer", "settings.html"));
    await new Promise((r) => setTimeout(r, 500));
    await waitFonts(settingsWin);
    await shot(settingsWin, "settings.png");
  },

  // deps window — REAL detection against this machine (repo .deps + PATH)
  async setup() {
    stubChrome();
    const setupWin = new BrowserWindow({
      width: 440,
      height: 620,
      frame: false,
      show: true,
      backgroundColor: "#121211",
      webPreferences: basePrefs(preload),
    });
    const ctx = { depsRoot: path.join(ROOT, ".deps"), settings: {}, onProgress: null };
    ipcMain.handle("deps-status", () => deps.scan(ctx));
    ipcMain.handle("deps-install", () => ({ ok: true, rows: deps.scan(ctx) }));
    ipcMain.handle("deps-continue", () => ({ ok: true }));
    await setupWin.loadFile(path.join(ROOT, "app", "renderer", "setup.html"));
    await new Promise((r) => setTimeout(r, 600));
    await waitFonts(setupWin);
    await shot(setupWin, "setup_deps.png");
  },

  // author-side packer tool (separate process in production, same HTML here)
  async packer() {
    stubChrome();
    const packerWin = new BrowserWindow({
      width: 720,
      height: 780,
      frame: false,
      show: true,
      backgroundColor: "#121211",
      webPreferences: basePrefs(path.join(ROOT, "app", "packer", "preload.js")),
    });
    ipcMain.handle("pick-video", () => null);
    ipcMain.handle("pick-save", () => null);
    ipcMain.handle("build-pack", () => ({ ok: false, error: "docs capture only" }));
    await packerWin.loadFile(path.join(ROOT, "app", "packer", "index.html"));
    await new Promise((r) => setTimeout(r, 500));
    await waitFonts(packerWin);
    await shot(packerWin, "packer.png");
  },
};

app.whenReady().then(async () => {
  if (!pack) throw new Error("pack sample-human missing");
  const build = builders[section];
  if (!build) throw new Error(`unknown section ${section}`);
  await build();
  app.exit(0);
}).catch((err) => {
  console.error("CAPTURE FAILED:", (err && err.stack) || err);
  app.exit(9);
});
