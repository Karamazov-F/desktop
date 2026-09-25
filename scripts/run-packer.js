#!/usr/bin/env node
/**
 * Launch the packer as its own Electron process. Never starts the pet.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const appDir = path.join(__dirname, "..", "app");
const electron = path.join(
  appDir,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron"
);
if (!fs.existsSync(electron)) {
  console.error("missing electron, run: cd app && npm install");
  process.exit(1);
}
const child = spawn(electron, ["packer/main.js"], {
  cwd: appDir,
  stdio: "inherit",
  detached: true,
  windowsHide: false,
});
child.unref();
