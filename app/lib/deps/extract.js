const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

function which(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null;
}

function pythonBin() {
  return which("python") || which("python3") || which("py");
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const spawnOpts = { windowsHide: true, ...opts };
    if (process.platform === "win32" && /\.cmd$/i.test(String(cmd))) {
      spawnOpts.shell = true;
    }
    const p = spawn(cmd, args, spawnOpts);
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (d) => (stdout += d.toString()));
    p.stderr?.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `exit ${code}`).slice(-2000)));
    });
  });
}

/**
 * Extract zip / tar.gz / tar.bz2.
 * Windows tar.exe cannot decode bz2 without a separate bzip2.exe;
 * Python's tarfile can, so Python is preferred for archives.
 */
async function extractArchive(archive, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const py = pythonBin();
  const helper = path.join(__dirname, "extract_archive.py");
  if (py && fs.existsSync(helper)) {
    await run(py, [helper, archive, destDir]);
    return;
  }
  await run("tar", ["-xf", archive, "-C", destDir]);
}

function findNamedFile(root, name, depth = 0) {
  if (!root || !fs.existsSync(root) || depth > 5) return null;
  const direct = path.join(root, name);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  let ents;
  try {
    ents = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of ents) {
    if (!ent.isDirectory()) continue;
    const found = findNamedFile(path.join(root, ent.name), name, depth + 1);
    if (found) return found;
  }
  return null;
}

module.exports = { extractArchive, findNamedFile, which, run, pythonBin };
