/**
 * Open packer UI and capture a screenshot (no videos required).
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "comfy", "verify", "packer_ui.png");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 720,
    height: 780,
    show: true,
    webPreferences: {
      preload: path.join(ROOT, "app", "packer", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(ROOT, "app", "packer", "index.html"));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, img.toPNG());
  const html = await win.webContents.executeJavaScript(
    `({ title: document.querySelector('h1')?.textContent, rows: document.querySelectorAll('#rows tr').length, add: !!document.getElementById('add'), exp: !!document.getElementById('export') })`
  );
  console.log(JSON.stringify({ ok: true, out: OUT, ...html }, null, 2));
  if (!html.add || !html.exp || html.rows < 1) {
    app.exit(2);
    return;
  }
  app.exit(0);
});
