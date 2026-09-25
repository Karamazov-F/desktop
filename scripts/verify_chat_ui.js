/**
 * Verify right-click menu at cursor, compose float that follows the pet,
 * independent chat history, and wrapping speech bubbles.
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_chat_ui.js
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
const log = [
  { role: "user", text: "嗨" },
  { role: "bot", text: "我在呀。" },
];
const LONG =
  "主人今天想喝奶茶还是咖啡呀？甜一点的话加珍珠好不好？要是累了我给主人捏捏肩～不过太晚喝会睡不着哦。";

function packWindowSize(pack, { bubbleH = 0 } = {}) {
  const w = Math.max(64, Number(pack?.size?.width) || 128);
  const h = Math.max(64, Number(pack?.size?.height) || 128);
  return { width: w + 32, height: h + 32 + 16 + Math.max(0, Number(bubbleH) || 0) };
}

function fail(code, msg, extra) {
  console.error("FAIL:", msg, extra ? JSON.stringify(extra) : "");
  app.exit(code);
}

function keepFeet(win, next) {
  const old = win.getBounds();
  win.setContentSize(next.width, next.height);
  const neu = win.getBounds();
  win.setBounds({
    x: old.x,
    y: old.y + old.height - neu.height,
    width: neu.width,
    height: neu.height,
  });
}

app.whenReady().then(async () => {
  const pack = readPack(PACKS, packId);
  if (!pack) {
    fail(1, "pack missing");
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const base = packWindowSize(pack);
  const win = new BrowserWindow({
    width: base.width,
    height: base.height,
    x: 520,
    y: 240,
    frame: false,
    transparent: true,
    show: true,
    webPreferences: {
      preload: path.join(ROOT, "app", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  let chatWin = null;
  let menuWin = null;
  let composeWin = null;

  // Mirror app/main.js: Mini-style dock anchored below the character.
  const COMPOSE_SIZE = { width: 360, height: 68 };
  const COMPOSE_PILL_SIZE = { width: 120, height: 76 };
  const COMPOSE_HOVER_CLOSE_MS = 400;
  let composeExpandedFlag = false;
  let petComposeHover = false;
  let composerHover = false;
  let hoverCloseTimer = null;
  let composeVoicePin = false;
  let voicePhase = "idle";
  // Tests inject the cursor position so blur semantics are deterministic
  // (null = fall back to the real OS cursor).
  let fakeCursor = { x: 10, y: 10 };

  function cursorInsideWindow(w) {
    if (!w || w.isDestroyed() || !w.isVisible()) return false;
    const p = fakeCursor || screen.getCursorScreenPoint();
    const b = w.getBounds();
    return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  }

  function petCenter() {
    const b = win.getBounds();
    return { x: b.x + Math.round(b.width / 2), y: b.y + Math.round(b.height / 2) };
  }

  function broadcastVoice(state, extra = {}) {
    voicePhase = state;
    const payload = { state, ...extra };
    for (const w of [win, chatWin, composeWin]) {
      if (w && !w.isDestroyed()) w.webContents.send("voice-state", payload);
    }
    if (state === "idle") {
      composeVoicePin = false;
      scheduleHoverClose();
    }
  }

  function composeDockBounds() {
    const pb = win.getBounds();
    const size = composeExpandedFlag ? COMPOSE_SIZE : COMPOSE_PILL_SIZE;
    return {
      x: pb.x + Math.round((pb.width - size.width) / 2),
      y: pb.y + pb.height - 34,
      width: size.width,
      height: size.height,
    };
  }

  function followCompose() {
    if (!composeWin || composeWin.isDestroyed() || !composeWin.isVisible()) return;
    const pb = win.getBounds();
    const box = composeDockBounds();
    composeWin.setBounds(box);
    composeWin.webContents.send("compose-layout", {
      dockX: pb.x + pb.width / 2 - box.x,
    });
  }

  function closeCompose() {
    if (composeWin && !composeWin.isDestroyed()) composeWin.close();
  }

  function scheduleHoverClose() {
    clearTimeout(hoverCloseTimer);
    if (petComposeHover || composerHover || composeExpandedFlag || composeVoicePin) return;
    hoverCloseTimer = setTimeout(() => {
      if (petComposeHover || composerHover || composeExpandedFlag || composeVoicePin) return;
      if (cursorInsideWindow(composeWin)) return;
      closeCompose();
    }, COMPOSE_HOVER_CLOSE_MS);
  }

  async function openCompose({ focus = true } = {}) {
    if (composeWin && !composeWin.isDestroyed()) {
      if (focus) {
        composeExpandedFlag = true;
        composeWin.webContents.send("compose-expand");
      }
      followCompose();
      if (!composeWin.isVisible()) {
        if (focus) composeWin.show();
        else composeWin.showInactive();
      }
      if (focus) composeWin.focus();
      return;
    }
    if (focus) composeExpandedFlag = true; // explicit open: born expanded
    const box = composeDockBounds();
    composeWin = new BrowserWindow({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      frame: false,
      transparent: true,
      show: false,
      webPreferences: {
        preload: path.join(ROOT, "app", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    composeWin.on("blur", () => {
      // Mirrors app/main/compose.js: any click that is not on the dock closes
      // it. The click itself is not captured.
      if (!composeExpandedFlag || composeVoicePin) return;
      if (cursorInsideWindow(composeWin)) return;
      closeCompose();
    });
    composeWin.on("closed", () => {
      composeWin = null;
      composeExpandedFlag = false;
      composerHover = false;
      win.webContents.send("compose-flag", false);
    });
    await composeWin.loadFile(path.join(ROOT, "app", "renderer", "compose.html"));
    followCompose();
    if (focus) {
      composeWin.webContents.send("compose-expand");
      composeWin.show();
      composeWin.focus();
    } else {
      composeWin.showInactive();
    }
  }

  ipcMain.handle("get-bootstrap", () => ({
    settings: { packId, alwaysOnTop: true, lifeStream: false },
    packsDir: PACKS,
    packs: [{ id: pack.id, name: pack.name }],
    pack,
    chatLog: log,
  }));
  ipcMain.handle("set-pack", () => pack);
  ipcMain.handle("get-settings", () => ({ packId, lifeStream: false }));
  ipcMain.handle("resize-to-pack", (_e, size) => {
    const s = packWindowSize({ ...pack, size: size || pack.size }, { bubbleH: size?.bubbleH });
    keepFeet(win, s);
    return { width: s.width, height: s.height };
  });
  ipcMain.handle("set-compose-open", async (_e, open) => {
    const on = open && typeof open === "object" ? Boolean(open.compose) : Boolean(open);
    if (on) {
      await openCompose();
      win.webContents.send("compose-flag", true);
    } else if (composeWin && !composeWin.isDestroyed()) {
      composeWin.close();
      win.webContents.send("compose-flag", false);
    }
    return { ok: true, composeOpen: on };
  });
  ipcMain.handle("get-chat-log", () => log);
  ipcMain.handle("chat", (e, text) => {
    log.push({ role: "user", text: String(text || "") });
    log.push({ role: "bot", text: "嗯，记下了。" });
    const res = { text: "嗯，记下了。", displayName: "小鲸", source: "local" };
    win.webContents.send("show-bubble", res.text);
    const from = BrowserWindow.fromWebContents(e.sender);
    if (chatWin && !chatWin.isDestroyed() && from !== chatWin) {
      chatWin.webContents.send("chat-turn", { user: String(text || ""), reply: res });
    }
    return res;
  });
  ipcMain.handle("open-chat", async () => {
    if (chatWin && !chatWin.isDestroyed()) {
      chatWin.focus();
      return true;
    }
    chatWin = new BrowserWindow({
      width: 360,
      height: 520,
      x: 64,
      y: 64,
      show: true,
      webPreferences: {
        preload: path.join(ROOT, "app", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await chatWin.loadFile(path.join(ROOT, "app", "renderer", "chat.html"));
    return true;
  });
  ipcMain.handle("open-pet-menu", async (_e, pt) => {
    if (menuWin && !menuWin.isDestroyed()) menuWin.close();
    menuWin = new BrowserWindow({
      x: Math.round(Number(pt?.x) || 80),
      y: Math.round(Number(pt?.y) || 80),
      width: 420,
      height: 180,
      frame: false,
      transparent: true,
      show: true,
      webPreferences: {
        preload: path.join(ROOT, "app", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await menuWin.loadFile(path.join(ROOT, "app", "renderer", "pet-menu.html"));
    return true;
  });
  ipcMain.handle("get-pet-menu", () => ({
    actions: [
      { id: "idle", label: "待机" },
      { id: "walk", label: "走" },
    ],
  }));
  ipcMain.handle("pet-menu-command", async (_e, cmd) => {
    if (menuWin && !menuWin.isDestroyed()) menuWin.close();
    if (cmd?.kind === "compose") {
      await openCompose();
      win.webContents.send("compose-flag", true);
    }
    if (cmd?.kind === "chatter") {
      await win.webContents.executeJavaScript(
        `window.__petTest.showBubble(${JSON.stringify("鱼片要不要歇一会儿？")})`
      );
    }
    return true;
  });
  ipcMain.handle("win-min", (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipcMain.handle("win-close", (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w && w !== win) w.close();
  });
  ipcMain.on("mouse-passthrough", () => {});
  ipcMain.on("pet-drag-by", (_e, delta) => {
    const b = win.getBounds();
    win.setBounds({
      x: b.x + Number(delta?.dx || 0),
      y: b.y + Number(delta?.dy || 0),
      width: b.width,
      height: b.height,
    });
    followCompose();
  });
  ipcMain.on("pet-nudge-by", (_e, delta) => {
    const b = win.getBounds();
    win.setBounds({
      x: b.x + Number(delta?.dx || 0),
      y: b.y + Number(delta?.dy || 0),
      width: b.width,
      height: b.height,
    });
    followCompose();
  });
  win.on("move", () => followCompose());
  ipcMain.handle("get-work-area", () => {
    const b = win.getBounds();
    return {
      win: { x: b.x, y: b.y, width: b.width, height: b.height },
      work: { x: 0, y: 0, width: 1920, height: 1080 },
    };
  });
  // Voice cycle mirrors main.js: pin the dock, show it focus-free, broadcast
  // state to every window, and unpin (hover rules resume) on idle.
  ipcMain.handle("voice-start", async (_e, source) => {
    composeVoicePin = true;
    await openCompose({ focus: false });
    win.webContents.send("compose-flag", true);
    broadcastVoice("listening", { source: source || "hotkey" });
    return { ok: true };
  });
  ipcMain.handle("voice-stop", async () => {
    broadcastVoice("transcribing");
    // STT is stubbed here; simulate the transcription completing.
    setTimeout(() => broadcastVoice("idle", { text: "" }), 220);
    return { ok: true };
  });
  ipcMain.handle("voice-cancel", async () => {
    broadcastVoice("idle", { cancelled: true });
    return { ok: true };
  });
  // Hover-owned preview + expand state (mirrors main.js Mini composer).
  ipcMain.on("pet-compose-hover", (_e, hovered) => {
    petComposeHover = Boolean(hovered);
    if (petComposeHover) {
      clearTimeout(hoverCloseTimer);
      openCompose({ focus: false })
        .then(() => win.webContents.send("compose-flag", true))
        .catch(() => {});
    } else {
      scheduleHoverClose();
    }
  });
  ipcMain.on("compose-hover", (_e, hovered) => {
    composerHover = Boolean(hovered);
    if (composerHover) clearTimeout(hoverCloseTimer);
    else scheduleHoverClose();
  });
  ipcMain.on("compose-expanded", (_e, on) => {
    composeExpandedFlag = Boolean(on);
    if (composeExpandedFlag) followCompose(); // grow pill -> full dock
  });
  ipcMain.on("compose-hold", (_e, on) => {
    composeVoicePin = Boolean(on);
    if (!on) scheduleHoverClose();
  });
  ipcMain.on("float-text", () => {});

  await win.loadFile(path.join(ROOT, "app", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 1400));

  const petHasCompose = await win.webContents.executeJavaScript(
    `Boolean(document.getElementById("compose"))`
  );
  if (petHasCompose) {
    fail(2, "compose should not live on the pet window");
    return;
  }

  const clickAt = { x: 640, y: 360 };
  await win.webContents.executeJavaScript(`
    const ev = new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, button: 2,
      screenX: ${clickAt.x}, screenY: ${clickAt.y},
    });
    document.getElementById("hit").dispatchEvent(ev);
  `);
  await new Promise((r) => setTimeout(r, 500));
  if (!menuWin || menuWin.isDestroyed()) {
    fail(3, "right-click should open a menu window");
    return;
  }
  const menuLabels = await menuWin.webContents.executeJavaScript(
    `[...document.querySelectorAll("#menu .item")].map((el) => el.textContent.replace(/\\s+/g, " ").trim())`
  );
  if (
    !menuLabels.some((t) => t.includes("碎碎念")) ||
    !menuLabels.some((t) => t.includes("对话(双击角色可直接对话)")) ||
    !menuLabels.some((t) => t.includes("动作"))
  ) {
    fail(4, "menu missing items", { menuLabels });
    return;
  }
  if (menuLabels.some((t) => t.includes("初始位置"))) {
    fail(5, "reset-position should be removed", { menuLabels });
    return;
  }
  const menuBounds = menuWin.getBounds();
  if (Math.abs(menuBounds.x - clickAt.x) > 24 || Math.abs(menuBounds.y - clickAt.y) > 24) {
    fail(6, "menu should open at click position", { menuBounds, clickAt });
    return;
  }
  await menuWin.webContents.executeJavaScript(`document.fonts.ready.then(() => true)`);
  const menuFace = await menuWin.webContents.executeJavaScript(
    `({ family: getComputedStyle(document.body).fontFamily, loaded: document.fonts.check('14px "乐米石朗体"') })`
  );
  if (!/乐米石朗体/i.test(String(menuFace.family)) || !menuFace.loaded) {
    fail(8, "menu must use 乐米石朗体", menuFace);
    return;
  }
  fs.writeFileSync(path.join(OUT, "compose_l1.png"), (await menuWin.webContents.capturePage()).toPNG());

  // Flyout must stay open when moving from 动作 into the submenu (no transparent gap kill).
  const flyout = await menuWin.webContents.executeJavaScript(`(() => {
    const actions = document.getElementById("actions-btn");
    const sub = document.getElementById("sub");
    actions.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const opened = sub.classList.contains("open");
    const bridge = getComputedStyle(sub).paddingLeft;
    const gap = getComputedStyle(sub).marginLeft;
    sub.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    const still = sub.classList.contains("open");
    return { opened, still, bridge, gap, hasPanel: Boolean(document.getElementById("sub-panel")) };
  })()`);
  if (!flyout.opened || !flyout.still || !flyout.hasPanel || flyout.gap !== "0px") {
    fail(6, "action submenu should stay open across the bridge", flyout);
    return;
  }

  await menuWin.webContents.executeJavaScript(`
    document.querySelector('[data-kind="compose"]').dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
  `);
  await new Promise((r) => setTimeout(r, 500));
  if (!composeWin || composeWin.isDestroyed()) {
    fail(7, "对话 should open compose float");
    return;
  }
  // Explicit opens (menu / tray / double-click) are born expanded.
  let expandedAtOpen = false;
  for (let i = 0; i < 20; i++) {
    expandedAtOpen = await composeWin.webContents.executeJavaScript(
      `document.body.classList.contains("expanded")`
    );
    if (expandedAtOpen) break;
    await new Promise((r) => setTimeout(r, 60));
  }
  if (!expandedAtOpen) {
    fail(7, "explicit open should expand the composer (skip the pill)", {});
    return;
  }
  {
    const pb = win.getBounds();
    const cb = composeWin.getBounds();
    const expectX = pb.x + Math.round((pb.width - 360) / 2);
    const expectY = pb.y + pb.height - 34;
    if (Math.abs(cb.x - expectX) > 24 || Math.abs(cb.y - expectY) > 24) {
      fail(7, "first open compose must dock below the pet, not screen center", {
        pet: pb,
        compose: cb,
        expectX,
        expectY,
      });
      return;
    }
  }
  const composeUi = await composeWin.webContents.executeJavaScript(`({
    ph: document.getElementById("input") && document.getElementById("input").placeholder,
    sendLabel: document.getElementById("send") && document.getElementById("send").getAttribute("aria-label"),
    quickMic: document.getElementById("quick-mic") && document.getElementById("quick-mic").getAttribute("aria-label"),
    fieldMic: document.getElementById("field-mic") && document.getElementById("field-mic").getAttribute("aria-label"),
    openCompose: document.getElementById("open-compose") && document.getElementById("open-compose").getAttribute("aria-label"),
    expanded: document.body.classList.contains("expanded"),
    hint: document.getElementById("hint") && document.getElementById("hint").textContent,
  })`);
  if (
    composeUi.ph !== "说点什么…" ||
    composeUi.sendLabel !== "发送" ||
    composeUi.quickMic !== "按住说话" ||
    composeUi.fieldMic !== "按住说话" ||
    composeUi.openCompose !== "输入消息" ||
    composeUi.expanded !== true
  ) {
    fail(8, "compose chrome", composeUi);
    return;
  }
  const composeBounds = composeWin.getBounds();
  if (composeBounds.width !== 360 || composeBounds.height !== 68) {
    fail(8, "compose window must stay 360x68 (Mini dock)", composeBounds);
    return;
  }
  const dock = await composeWin.webContents.executeJavaScript(`(() => {
    const card = document.getElementById("card");
    const qa = document.getElementById("quick-actions");
    const field = document.getElementById("field");
    const send = document.getElementById("send");
    return {
      qaRadius: getComputedStyle(qa).borderTopLeftRadius,
      fieldRadius: getComputedStyle(field).borderTopLeftRadius,
      sendRadius: getComputedStyle(send).borderTopLeftRadius,
      sendFontSize: getComputedStyle(send).fontSize,
      sendIcon: getComputedStyle(send, "::before").content,
      dockX: getComputedStyle(card).getPropertyValue("--dock-x").trim(),
    };
  })()`);
  if (
    dock.qaRadius !== "999px" ||
    dock.fieldRadius !== "999px" ||
    dock.sendRadius !== "50%" ||
    dock.sendFontSize !== "0px" ||
    !String(dock.sendIcon).includes("↑") ||
    !Number.isFinite(parseFloat(dock.dockX))
  ) {
    fail(8, "compose must be the Mini capsule dock (pill + capsule field + icon send)", dock);
    return;
  }
  await composeWin.webContents.executeJavaScript(`document.fonts.ready.then(() => true)`);
  const face = await composeWin.webContents.executeJavaScript(`({
    body: getComputedStyle(document.body).fontFamily,
    send: getComputedStyle(document.getElementById("send")).fontFamily,
    loaded: document.fonts.check('14px "乐米石朗体"'),
  })`);
  if (!/乐米石朗体/i.test(String(face.body)) || !face.loaded) {
    fail(8, "compose must use 乐米石朗体", face);
    return;
  }
  fs.writeFileSync(path.join(OUT, "compose_l2.png"), (await composeWin.webContents.capturePage()).toPNG());

  const composeBefore = composeWin.getBounds();
  const petBefore = win.getBounds();
  win.setBounds({
    x: petBefore.x + 140,
    y: petBefore.y + 80,
    width: petBefore.width,
    height: petBefore.height,
  });
  followCompose();
  await new Promise((r) => setTimeout(r, 120));
  const composeAfterMove = composeWin.getBounds();
  if (composeAfterMove.x === composeBefore.x && composeAfterMove.y === composeBefore.y) {
    fail(9, "compose float should follow the pet", { composeBefore, composeAfterMove });
    return;
  }

  const footBefore = win.getBounds().y + win.getBounds().height;
  const stageBefore = await win.webContents.executeJavaScript(`(() => {
    const r = document.getElementById("stage").getBoundingClientRect();
    return { bottom: r.bottom, top: r.top };
  })()`);
  const stageScreenBefore = win.getBounds().y + stageBefore.bottom;
  await win.webContents.executeJavaScript(
    `window.__petTest.showBubble(${JSON.stringify(LONG)}, 6000)`
  );
  await new Promise((r) => setTimeout(r, 250));
  const bubble = await win.webContents.executeJavaScript(`(() => {
    const el = document.getElementById("bubble");
    const r = el.getBoundingClientRect();
    return { show: el.classList.contains("show"), text: el.textContent, w: r.width, h: r.height };
  })()`);
  if (!bubble.show || !bubble.text.includes("奶茶") || bubble.h < 48) {
    fail(12, "long reply should wrap in a speech bubble", bubble);
    return;
  }
  await win.webContents.executeJavaScript(`document.fonts.ready.then(() => true)`);
  const bubbleFace = await win.webContents.executeJavaScript(`({
    family: getComputedStyle(document.getElementById("bubble")).fontFamily,
    loaded: document.fonts.check('14px "乐米石朗体"') || document.fonts.check('13px "乐米石朗体"'),
  })`);
  if (!/乐米石朗体/.test(String(bubbleFace.family))) {
    fail(12, "bubble must use 乐米石朗体", bubbleFace);
    return;
  }
  const footAfter = win.getBounds().y + win.getBounds().height;
  const stageAfter = await win.webContents.executeJavaScript(`(() => {
    const r = document.getElementById("stage").getBoundingClientRect();
    return { bottom: r.bottom, top: r.top };
  })()`);
  const stageScreenAfter = win.getBounds().y + stageAfter.bottom;
  if (Math.abs(footAfter - footBefore) > 4 || Math.abs(stageScreenAfter - stageScreenBefore) > 4) {
    fail(13, "long bubble moved the character feet", {
      footBefore,
      footAfter,
      stageScreenBefore,
      stageScreenAfter,
      bubble,
    });
    return;
  }
  fs.writeFileSync(path.join(OUT, "compose_l3.png"), (await win.webContents.capturePage()).toPNG());

  // The dock starts collapsed; the pencil expands it into the capsule input.
  await composeWin.webContents.executeJavaScript(`
    document.getElementById("open-compose").click();
  `);
  await new Promise((r) => setTimeout(r, 300));
  const expandedNow = await composeWin.webContents.executeJavaScript(
    `document.body.classList.contains("expanded")`
  );
  if (!expandedNow) {
    fail(14, "pencil button should expand the composer", { expandedNow });
    return;
  }
  await composeWin.webContents.executeJavaScript(`
    document.getElementById("input").value = "左走";
    document.getElementById("send").click();
  `);
  await new Promise((r) => setTimeout(r, 400));
  const afterSend = await win.webContents.executeJavaScript(
    `document.getElementById("bubble").textContent`
  );
  if (!String(afterSend).includes("记下了")) {
    fail(14, "compose send should show reply bubble", { afterSend });
    return;
  }

  try {
    // Ensure pet renderer knows compose is open before testing close.
    let flagOn = false;
    for (let i = 0; i < 20; i++) {
      flagOn = await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      );
      if (flagOn) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!flagOn) {
      // Force-sync flag if menu path raced; production main always sends it.
      win.webContents.send("compose-flag", true);
      await new Promise((r) => setTimeout(r, 80));
    }

    // 15a: pressing the pet must NOT close the composer from the renderer side
    // anymore (pet.js dropped its close call; the expanded composer is
    // blur-owned by main). The press is a normal click now.
    await win.webContents.executeJavaScript(`(() => {
      const hit = document.getElementById("hit");
      if (!hit) throw new Error("no-hit");
      hit.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, button: 0, pointerId: 41,
        pointerType: "mouse", clientX: 40, clientY: 40, isPrimary: true,
      }));
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 120));
    await win.webContents.executeJavaScript(`
      document.getElementById("hit").dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, cancelable: true, button: 0, pointerId: 41,
        pointerType: "mouse", clientX: 40, clientY: 40, isPrimary: true,
      }));
    `);
    await new Promise((r) => setTimeout(r, 200));
    const afterPress = {
      flag: await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      ),
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
    };
    if (!afterPress.flag || !afterPress.alive) {
      fail(15, "press on pet should NOT close the composer (blur owns it now)", afterPress);
      return;
    }

    // 15b-i: a click on the pet blurs the dock and closes it, but the press
    // itself already reached the pet (15a). The dock must not stay up.
    fakeCursor = petCenter();
    if (composeWin && !composeWin.isDestroyed()) composeWin.focus();
    await new Promise((r) => setTimeout(r, 150));
    if (composeWin && !composeWin.isDestroyed()) {
      if (composeWin.isFocused()) composeWin.blur();
      else composeWin.emit("blur");
    }
    await new Promise((r) => setTimeout(r, 300));
    const blurOnPet = {
      flag: await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      ),
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
    };
    if (blurOnPet.flag || blurOnPet.alive) {
      fail(15, "click on the pet should close the dock without being swallowed", blurOnPet);
      return;
    }

    // 15b-ii: blur with the cursor on the desktop closes a freshly expanded dock.
    await openCompose();
    fakeCursor = { x: 10, y: 10 };
    if (composeWin && !composeWin.isDestroyed()) composeWin.focus();
    await new Promise((r) => setTimeout(r, 150));
    if (composeWin && !composeWin.isDestroyed()) {
      if (composeWin.isFocused()) composeWin.blur();
      else composeWin.emit("blur");
    }
    await new Promise((r) => setTimeout(r, 300));
    const afterBlur = {
      flag: await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      ),
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
    };
    if (afterBlur.flag || afterBlur.alive) {
      fail(15, "expanded composer should close on an outside click", afterBlur);
      return;
    }

    // 15c: hovering the pet opens the collapsed pill (preview, no focus);
    // leaving hover closes it after the close grace period.
    await win.webContents.executeJavaScript(`
      document.getElementById("hit").dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    `);
    await new Promise((r) => setTimeout(r, 500));
    const hoverOpen = {
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
      expanded:
        composeWin && !composeWin.isDestroyed()
          ? await composeWin.webContents.executeJavaScript(
              `document.body.classList.contains("expanded")`
            )
          : null,
      size:
        composeWin && !composeWin.isDestroyed() ? composeWin.getBounds() : null,
      flag: await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      ),
    };
    if (
      !hoverOpen.alive ||
      hoverOpen.expanded ||
      !hoverOpen.flag ||
      !hoverOpen.size ||
      hoverOpen.size.width !== 120 ||
      hoverOpen.size.height !== 76
    ) {
      fail(15, "hovering the pet should open the collapsed 120x76 pill", hoverOpen);
      return;
    }
    await win.webContents.executeJavaScript(`
      document.getElementById("hit").dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    `);
    await new Promise((r) => setTimeout(r, 750));
    const hoverGone = {
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
      flag: await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      ),
    };
    if (hoverGone.alive || hoverGone.flag) {
      fail(15, "leaving hover should close the preview pill", hoverGone);
      return;
    }

    // 15d: hold-to-talk pins the dock — drifting the pointer off both the pet
    // and the dock mid-hold must NOT close the window (that orphaned the
    // recorder and stuck the red dot). Releasing ends the cycle and the dock
    // tidies itself.
    await win.webContents.executeJavaScript(`
      document.getElementById("hit").dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    `);
    await new Promise((r) => setTimeout(r, 400));
    await composeWin.webContents.executeJavaScript(`
      document.getElementById("quick-mic").dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, button: 0, pointerId: 7, pointerType: "mouse",
      }));
    `);
    await new Promise((r) => setTimeout(r, 150));
    await win.webContents.executeJavaScript(`
      document.getElementById("hit").dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    `);
    await composeWin.webContents.executeJavaScript(`
      document.getElementById("card").dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    `);
    await new Promise((r) => setTimeout(r, 1000)); // past the 1s listen threshold and the close grace
    const holdState = {
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
      hot:
        composeWin && !composeWin.isDestroyed()
          ? await composeWin.webContents.executeJavaScript(
              `document.getElementById("quick-mic").classList.contains("hot")`
            )
          : null,
      expanded:
        composeWin && !composeWin.isDestroyed()
          ? await composeWin.webContents.executeJavaScript(
              `document.body.classList.contains("expanded")`
            )
          : null,
    };
    if (!holdState.alive || !holdState.hot || holdState.expanded) {
      fail(15, "hold-to-talk should pin the collapsed pill with a red mic", holdState);
      return;
    }
    await composeWin.webContents.executeJavaScript(`
      document.getElementById("quick-mic").dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, cancelable: true, button: 0, pointerId: 7, pointerType: "mouse",
      }));
    `);
    await new Promise((r) => setTimeout(r, 900)); // transcribe stub + close grace
    const afterHold = {
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
      flag: await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      ),
    };
    if (afterHold.alive || afterHold.flag) {
      fail(15, "dock should close after the voice cycle goes idle", afterHold);
      return;
    }

    // 15e: hotkey voice with the pointer nowhere near the pet must still
    // surface the collapsed pill with a red mic (state-driven, not
    // hover-driven), without stealing focus, and tidy up on idle.
    fakeCursor = { x: 10, y: 10 };
    await win.webContents.executeJavaScript(`window.petApi.voiceStart("hotkey")`);
    await new Promise((r) => setTimeout(r, 400));
    const voicePill = {
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
      hot:
        composeWin && !composeWin.isDestroyed()
          ? await composeWin.webContents.executeJavaScript(
              `document.getElementById("quick-mic").classList.contains("hot")`
            )
          : null,
      expanded:
        composeWin && !composeWin.isDestroyed()
          ? await composeWin.webContents.executeJavaScript(
              `document.body.classList.contains("expanded")`
            )
          : null,
      focused:
        composeWin && !composeWin.isDestroyed() ? composeWin.isFocused() : null,
    };
    if (!voicePill.alive || !voicePill.hot || voicePill.expanded || voicePill.focused) {
      fail(15, "hotkey voice should show an unfocused collapsed pill with red mic", voicePill);
      return;
    }
    await win.webContents.executeJavaScript(`window.petApi.voiceStop()`);
    await new Promise((r) => setTimeout(r, 900));
    const voiceDone = {
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
      flag: await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      ),
    };
    if (voiceDone.alive || voiceDone.flag) {
      fail(15, "dock should tidy itself after hotkey voice ends", voiceDone);
      return;
    }

    await win.webContents.executeJavaScript(`(() => {
      const hit = document.getElementById("hit");
      const fire = (type, id) => hit.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, button: 0, pointerId: id,
        pointerType: "mouse", clientX: 42, clientY: 42, isPrimary: true,
      }));
      fire("pointerdown", 51); fire("pointerup", 51);
      fire("pointerdown", 52); fire("pointerup", 52);
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    const afterOpen = {
      flag: await win.webContents.executeJavaScript(
        `Boolean(window.__petTest && window.__petTest.getState().composeOpen)`
      ),
      alive: Boolean(composeWin && !composeWin.isDestroyed()),
    };
    if (!afterOpen.flag && !afterOpen.alive) {
      fail(16, "double-click pet should open compose", afterOpen);
      return;
    }
  } catch (err) {
    fail(17, "compose close/open pointer tests threw", String(err && err.message || err));
    return;
  }

  // Chat history is a standalone window that must NOT follow the pet. Opening
  // it takes focus, which (by design) blur-closes the expanded composer — so
  // this runs after all composer assertions.
  await win.webContents.executeJavaScript(`window.__petTest.openHistory()`);
  await new Promise((r) => setTimeout(r, 500));
  if (!chatWin || chatWin.isDestroyed()) {
    fail(10, "history should stay a standalone window");
    return;
  }
  const chatBefore = chatWin.getBounds();
  win.setBounds({
    x: win.getBounds().x + 80,
    y: win.getBounds().y + 40,
    width: win.getBounds().width,
    height: win.getBounds().height,
  });
  followCompose();
  await new Promise((r) => setTimeout(r, 120));
  const chatAfter = chatWin.getBounds();
  if (chatAfter.x !== chatBefore.x || chatAfter.y !== chatBefore.y) {
    fail(11, "chat history followed the pet", { chatBefore, chatAfter });
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        menuLabels,
        composeUi,
        composeFollowed: true,
        chatFollowed: false,
        bubble,
        out: [
          path.join(OUT, "compose_l1.png"),
          path.join(OUT, "compose_l2.png"),
          path.join(OUT, "compose_l3.png"),
        ],
      },
      null,
      2
    )
  );
  app.exit(0);
});
