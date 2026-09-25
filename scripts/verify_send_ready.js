const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 420, height: 120, show: true, backgroundColor: "#efe6d4",
    webPreferences: { preload: path.join(ROOT, "app/preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(ROOT, "app/renderer/compose.html"));
  const read = () => win.webContents.executeJavaScript(`(() => {
    const btn = document.getElementById("send");
    const cs = getComputedStyle(btn);
    return { ready: btn.classList.contains("ready"), bg: cs.backgroundColor };
  })()`);
  await win.webContents.executeJavaScript(`document.body.classList.add("expanded"); document.body.style.background="#efe6d4";`);
  const empty = await read();
  await win.webContents.executeJavaScript(`(() => {
    const input = document.getElementById("input");
    input.value = "   ";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  const spaces = await read();
  await win.webContents.executeJavaScript(`(() => {
    const input = document.getElementById("input");
    input.value = "撒旦";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  const filled = await read();
  await new Promise((r) => setTimeout(r, 220));
  const filledSettled = await read();
  const png = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ROOT, "comfy/verify/send_ready.png"), png.toPNG());
  const ok = !empty.ready && !spaces.ready && filled.ready && filledSettled.bg !== empty.bg;
  console.log(JSON.stringify({ ok, empty, spaces, filled, filledSettled }));
  app.exit(ok ? 0 : 1);
}).catch((err) => { console.error(err); app.exit(1); });
