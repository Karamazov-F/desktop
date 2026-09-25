const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { buildEncryptedPack } = require("../lib/pack-build");
const { ensureDesktopShortcut } = require("../lib/shortcut");

app.setName("desktop-pet-packer");
try {
  app.setPath("userData", path.join(app.getPath("appData"), "desktop-pet-packer"));
} catch (_) {}

let win = null;

function create() {
  win = new BrowserWindow({
    width: 720,
    height: 780,
    minWidth: 560,
    minHeight: 560,
    title: "桌宠出包工具",
    frame: false,
    show: false,
    backgroundColor: "#121211",
    autoHideMenuBar: true,
    minimizable: true,
    maximizable: false,
    resizable: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());
}

ipcMain.handle("win-min", (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});
ipcMain.handle("win-close", (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});

ipcMain.handle("pick-video", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "选择动作视频",
    properties: ["openFile"],
    filters: [
      { name: "视频", extensions: ["mp4", "webm", "mov", "mkv", "avi"] },
      { name: "全部", extensions: ["*"] },
    ],
  });
  if (r.canceled) return null;
  return r.filePaths[0];
});

ipcMain.handle("pick-save", async (_e, suggested) => {
  const r = await dialog.showSaveDialog(win, {
    title: "导出加密角色包",
    defaultPath: suggested || "character.dpet",
    filters: [{ name: "桌宠加密包", extensions: ["dpet"] }],
  });
  if (r.canceled) return null;
  return r.filePath;
});

ipcMain.handle("build-pack", async (_e, spec) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-pack-"));
  try {
    const result = await buildEncryptedPack({
      ...spec,
      workDir,
      onProgress: (msg) => {
        if (win && !win.isDestroyed()) win.webContents.send("build-progress", msg);
      },
    });
    return { ok: true, outFile: result.outFile, pack: result.pack };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

app.whenReady().then(() => {
  create();
  try {
    ensureDesktopShortcut({
      electronPath: process.execPath,
      appDir: path.resolve(__dirname, ".."),
      desktopDir: app.getPath("desktop"),
      name: "桌宠出包.lnk",
      args: "packer/main.js",
      description: "角色包出包工具（与桌宠分开运行）",
      windowStyle: 1,
    });
  } catch (err) {
    console.warn("packer shortcut", err.message);
  }
});
app.on("window-all-closed", () => app.quit());
