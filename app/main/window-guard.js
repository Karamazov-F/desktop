const { appFile } = require("./state");

function browserWebPreferences() {
  return {
    preload: appFile("preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  };
}

function hardenWindow(win) {
  if (!win || win.isDestroyed()) return win;
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-navigate", (event) => {
    event.preventDefault();
  });
  wc.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  return win;
}

module.exports = { browserWebPreferences, hardenWindow };
