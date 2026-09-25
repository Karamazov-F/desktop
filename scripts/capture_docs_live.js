/**
 * Live boot check: spawn the REAL app (app/main.js), wait, screenshot the
 * primary desktop (pet window + tray + any dialogs), then kill the child.
 * Proves the app boots today and shows what a real first screen looks like.
 *
 * Usage: app/node_modules/electron/dist/electron.exe scripts/capture_docs_live.js
 */
const { app, desktopCapturer, screen } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});

const ROOT = path.join(__dirname, "..");
const ELECTRON = path.join(ROOT, "app", "node_modules", "electron", "dist", "electron.exe");
const OUT = path.join(ROOT, "docs", "features", "img", "live_desktop.png");

app.whenReady().then(async () => {
  const child = spawn(ELECTRON, ["."], {
    cwd: path.join(ROOT, "app"),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let childLog = "";
  child.stdout.on("data", (d) => (childLog += d.toString()));
  child.stderr.on("data", (d) => (childLog += d.toString()));

  const bootMs = Number(process.env.DOC_LIVE_WAIT) || 8000;
  await new Promise((r) => setTimeout(r, bootMs));

  const alive = child.exitCode === null && !child.killed;
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: display.size.width, height: display.size.height },
  });
  const match =
    sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];

  let saved = null;
  if (match) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, match.thumbnail.toPNG());
    saved = { file: OUT, bytes: fs.statSync(OUT).size, size: match.thumbnail.getSize() };
  }

  try {
    child.kill();
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 500));
  if (child.exitCode === null) {
    try {
      process.kill(child.pid, "SIGKILL");
    } catch (_) {}
  }

  console.log(
    JSON.stringify(
      {
        ok: Boolean(alive && saved),
        appAliveAfterBoot: alive,
        screenshot: saved,
        childLogTail: childLog.slice(-400),
      },
      null,
      2
    )
  );
  app.exit(alive && saved ? 0 : 2);
});
