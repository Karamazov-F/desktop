const fs = require("fs");
const path = require("path");

function trayIconFiles(appDir) {
  const dir = path.join(appDir, "build");
  return {
    ico: path.join(dir, "tray.ico"),
    png: path.join(dir, "tray.png"),
    png2x: path.join(dir, "tray@2x.png"),
  };
}

function selectTrayAssets(files, { platform, scaleFactor, exists } = {}) {
  const there = exists || ((file) => fs.existsSync(file));
  const scale = Number(scaleFactor) || 1;
  const hiDpi = scale >= 1.5 && there(files.png2x);
  return {
    useIco: platform === "win32" && there(files.ico),
    ico: files.ico,
    primary: hiDpi ? files.png2x : files.png,
    png: files.png,
    png2x: files.png2x,
    includeHiDpi: there(files.png2x) && there(files.png),
    scale,
  };
}

module.exports = { trayIconFiles, selectTrayAssets };
