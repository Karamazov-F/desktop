const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function ensureDesktopShortcut({
  electronPath,
  appDir,
  desktopDir,
  name = "桌宠.lnk",
  args = ".",
  description = "开源可换角桌宠",
  windowStyle = 7,
  force = false,
}) {
  const lnk = path.join(desktopDir, name);
  if (fs.existsSync(lnk) && !force) return { ok: true, path: lnk, created: false };
  const target = String(electronPath).replace(/'/g, "''");
  const work = String(appDir).replace(/'/g, "''");
  const out = lnk.replace(/'/g, "''");
  const arg = String(args).replace(/'/g, "''");
  const desc = String(description).replace(/'/g, "''");
  const ps = `
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('${out}')
$s.TargetPath = '${target}'
$s.Arguments = '${arg}'
$s.WorkingDirectory = '${work}'
$s.WindowStyle = ${Number(windowStyle) || 1}
$s.Description = '${desc}'
$s.Save()
`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (r.status !== 0 || !fs.existsSync(lnk)) {
    return { ok: false, error: (r.stderr || r.stdout || "shortcut failed").slice(0, 400) };
  }
  return { ok: true, path: lnk, created: true };
}

module.exports = { ensureDesktopShortcut };
