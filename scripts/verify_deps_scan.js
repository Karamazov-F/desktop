/**
 * Run the REAL boot-time dependency scan inside Electron (same code path as
 * app/main.js: depsCtx + deps.scan + missingRequired) and print the rows.
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_deps_scan.js
 */
const { app } = require("electron");
const path = require("path");
const deps = require("../app/lib/deps");
const paths = require("../app/lib/paths");
const { loadSettings } = require("../app/lib/settings");

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  const userData = path.join(app.getPath("userData"), "desktop-pet-custom");
  const ctx = {
    depsRoot: paths.ensureDir(paths.depsRoot(userData)),
    settings: loadSettings(userData),
    onProgress: () => {},
  };
  const rows = deps.scan(ctx);
  const missing = deps.missingRequired(rows);
  console.log(JSON.stringify({ userData, depsRoot: ctx.depsRoot, missing: missing.map((m) => m.id), rows }, null, 1));
  app.exit(missing.length ? 1 : 0);
});
