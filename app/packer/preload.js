const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("packerApi", {
  pickVideo: () => ipcRenderer.invoke("pick-video"),
  pickSave: (suggested) => ipcRenderer.invoke("pick-save", suggested),
  build: (spec) => ipcRenderer.invoke("build-pack", spec),
  windowMin: () => ipcRenderer.invoke("win-min"),
  windowClose: () => ipcRenderer.invoke("win-close"),
  onProgress: (cb) => {
    ipcRenderer.on("build-progress", (_e, msg) => cb(msg));
  },
});
