/**
 * Confirm Electron can register the default global shortcuts.
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_hotkey_bind.js
 */
const { app, globalShortcut } = require("electron");
const hotkeys = require("../app/lib/hotkeys");

app.whenReady().then(() => {
  const voice = hotkeys.DEFAULTS.voiceHotkey;
  const hide = hotkeys.DEFAULTS.hideHotkey;
  const v = globalShortcut.register(voice, () => {});
  const h = globalShortcut.register(hide, () => {});
  const extra = {};
  for (const a of ["Shift+~", "Shift+`", "~", "Alt+Q", "Shift+!"]) {
    extra[a] = false;
    try {
      extra[a] = globalShortcut.register(a, () => {});
    } catch (err) {
      extra[a] = String(err.message || err);
    }
    try {
      globalShortcut.unregister(a);
    } catch (_) {}
  }
  const out = {
    ok: Boolean(v && h),
    voice: { accel: voice, registered: v },
    hide: { accel: hide, registered: h },
    twoKey: extra,
  };
  console.log(JSON.stringify(out, null, 2));
  globalShortcut.unregisterAll();
  app.exit(out.ok ? 0 : 2);
});
