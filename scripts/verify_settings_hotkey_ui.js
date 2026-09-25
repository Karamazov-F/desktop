/**
 * Load settings page and assert hotkey fields render + capture combo.
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_settings_hotkey_ui.js
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const hotkeys = require("../app/lib/hotkeys");

const OUT = path.join(__dirname, "..", "comfy", "verify", "settings_hotkeys.png");

app.whenReady().then(async () => {
  ipcMain.handle("win-min", () => {});
  ipcMain.handle("win-close", () => {});
  ipcMain.handle("get-settings", () => ({
    deepseekEnabled: false,
    memoryEnabled: false,
    visionEnabled: false,
    alwaysOnTop: true,
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

  const win = new BrowserWindow({
    width: 400,
    height: 760,
    show: true,
    frame: false,
    backgroundColor: "#121211",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "app", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("console-message", (_e, _lv, msg) => console.log("[renderer]", msg));
  await win.loadFile(path.join(__dirname, "..", "app", "renderer", "settings.html"));
  await new Promise((r) => setTimeout(r, 800));
  await win.webContents.executeJavaScript(`document.fonts.ready.then(() => true)`);
  const face = await win.webContents.executeJavaScript(
    `({ family: getComputedStyle(document.body).fontFamily, loaded: document.fonts.check('13px "乐米石朗体"') })`
  );
  if (!/乐米石朗体/i.test(String(face.family)) || !face.loaded) {
    console.error("FAIL: settings must use 乐米石朗体", face);
    app.exit(8);
    return;
  }
  let vals;
  try {
    vals = await win.webContents.executeJavaScript(`({
      hide: document.getElementById("hideHotkey") && document.getElementById("hideHotkey").value,
      voice: document.getElementById("voiceHotkey") && document.getElementById("voiceHotkey").value,
      hideAccel: document.getElementById("hideHotkey") && document.getElementById("hideHotkey").dataset.accel,
      voiceAccel: document.getElementById("voiceHotkey") && document.getElementById("voiceHotkey").dataset.accel,
      hasPetHotkeys: Boolean(window.PetHotkeys),
      hasChrome: Boolean(document.querySelector("[data-win=close]")),
    })`);
  } catch (err) {
    console.error("eval failed", err);
    app.exit(3);
    return;
  }
  const captured = await win.webContents.executeJavaScript(`
    window.PetHotkeys.fromKeyboardEvent({
      code: "KeyH", key: "h", ctrlKey: true, shiftKey: true, altKey: false, metaKey: false
    })
  `);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  const ok =
    vals.hasChrome &&
    vals.hideAccel === hotkeys.DEFAULTS.hideHotkey &&
    vals.voiceAccel === hotkeys.DEFAULTS.voiceHotkey &&
    captured === "CommandOrControl+Shift+H" &&
    /Ctrl/.test(vals.hide) &&
    /空格/.test(vals.voice);
  console.log(JSON.stringify({ ok, vals, captured, png: OUT, bytes: img.toPNG().length }, null, 2));
  app.exit(ok ? 0 : 2);
});
