/**
 * Download pinned Windows voice runtime files for the installer.
 * Nothing here runs inside the end-user app.
 *
 *   node scripts/fetch-vendor.js
 */
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(ROOT, "app", "vendor", ".cache");
const VOICE = path.join(ROOT, "app", "vendor", "voice");

const ASSETS = {
  nodeZip: {
    file: "node-v22.19.0-win-x64.zip",
    url: "https://nodejs.org/dist/v22.19.0/node-v22.19.0-win-x64.zip",
    sha256: "ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86",
  },
  modelArchive: {
    file: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2",
    sha256: "7305f7905bfcf77fa0b39388a313f3da35c68d971661a65475b56fb2162c8e63",
  },
  sherpaNode: {
    file: "sherpa-onnx-node-1.13.4.tgz",
    url: "https://registry.npmjs.org/sherpa-onnx-node/-/sherpa-onnx-node-1.13.4.tgz",
    sha256: "3611dc2e25a2da394459c58346f8f428916f9fd93ab48f5ef12ba674370775f8",
  },
  sherpaWin: {
    file: "sherpa-onnx-win-x64-1.13.4.tgz",
    url: "https://registry.npmjs.org/sherpa-onnx-win-x64/-/sherpa-onnx-win-x64-1.13.4.tgz",
    sha256: "c180199ee4ed16a25b8ed50e2706a2d3dbe1aaa8b0699ea7d249288290c7998e",
  },
  sherpaLicense: {
    file: "sherpa-onnx-1.13.4-LICENSE",
    url: "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v1.13.4/LICENSE",
    sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  },
  onnxruntimeLicense: {
    file: "onnxruntime-v1.22.1-LICENSE",
    url: "https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.1/LICENSE",
    sha256: "2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c",
  },
};

const PYTHON_CANDIDATES = [
  { cmd: "python3", args: [] },
  { cmd: "python", args: [] },
  { cmd: "py", args: ["-3"] },
];

function pickPython(run) {
  const probe =
    run ||
    ((candidate) => {
      const result = spawnSync(
        candidate.cmd,
        [...candidate.args, "-c", "import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)"],
        { encoding: "utf8" }
      );
      return result.status === 0;
    });
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      if (probe(candidate)) return candidate;
    } catch (_) {}
  }
  throw new Error("需要 Python 3 来解压语音模型。请确认 python3、python 或 py -3 可用。");
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(file);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

function download(url, dest, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error("too many redirects: " + url));
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("http://") ? http : https;
    const req = lib.get(url, { headers: { "User-Agent": "desktop-pet-build" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).href;
        download(next, dest, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error("download " + res.statusCode + " " + url));
        return;
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on("finish", () => out.close(resolve));
      out.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function ensureAsset(asset) {
  fs.mkdirSync(CACHE, { recursive: true });
  const dest = path.join(CACHE, asset.file);
  if (fs.existsSync(dest) && (await sha256File(dest)) === asset.sha256) {
    console.log("cached", asset.file);
    return dest;
  }
  const partial = dest + ".partial";
  console.log("download", asset.url);
  await download(asset.url, partial);
  const got = await sha256File(partial);
  if (got !== asset.sha256) {
    fs.rmSync(partial, { force: true });
    throw new Error(`${asset.file} sha256 mismatch\n  expected ${asset.sha256}\n  got      ${got}`);
  }
  fs.renameSync(partial, dest);
  return dest;
}

function stage(paths) {
  const script = `
import json, shutil, sys, tarfile, zipfile
from pathlib import Path
spec = json.loads(sys.argv[1])
voice = Path(spec["voice"])
if voice.exists():
    shutil.rmtree(voice)
voice.mkdir(parents=True)
modules = voice / "node_modules"
modules.mkdir()
lic = voice / "licenses"
lic.mkdir()

with zipfile.ZipFile(spec["nodeZip"]) as zf:
    name = next(n for n in zf.namelist() if n.endswith("/node.exe") or n.endswith("node.exe"))
    (voice / "node.exe").write_bytes(zf.read(name))
    node_license = next(n for n in zf.namelist() if n.endswith("/LICENSE") and n.count("/") == 1)
    (lic / "nodejs-LICENSE").write_bytes(zf.read(node_license))

model_dir = voice / "models" / "sensevoice-small"
model_dir.mkdir(parents=True)
with tarfile.open(spec["modelArchive"], "r:bz2") as tf:
    for member in tf.getmembers():
        base = Path(member.name).name
        if not member.isfile():
            continue
        if base in ("model.int8.onnx", "tokens.txt"):
            src = tf.extractfile(member)
            (model_dir / base).write_bytes(src.read())
        elif base.lower() == "readme.md":
            src = tf.extractfile(member)
            (lic / "sensevoice-README.md").write_bytes(src.read())

def untar_pkg(archive, dest_name):
    dest = modules / dest_name
    dest.mkdir()
    with tarfile.open(archive, "r:gz") as tf:
        for member in tf.getmembers():
            if not member.isfile():
                continue
            rel = Path(member.name)
            parts = rel.parts[1:]  # strip leading package/
            if not parts or any(p in ("..", "") for p in parts):
                raise SystemExit("unsafe path in " + archive)
            out = dest.joinpath(*parts)
            out.parent.mkdir(parents=True, exist_ok=True)
            src = tf.extractfile(member)
            out.write_bytes(src.read())

untar_pkg(spec["sherpaNode"], "sherpa-onnx-node")
untar_pkg(spec["sherpaWin"], "sherpa-onnx-win-x64")

dll_dir = modules / "sherpa-onnx-win-x64"
for dll in dll_dir.glob("*.dll"):
    shutil.copy2(dll, voice / dll.name)

shutil.copy2(spec["worker"], voice / "sherpa-stt-worker.js")
needed = [
    voice / "node.exe",
    voice / "sherpa-stt-worker.js",
    model_dir / "model.int8.onnx",
    model_dir / "tokens.txt",
    modules / "sherpa-onnx-node" / "sherpa-onnx.js",
    dll_dir / "sherpa-onnx.node",
    voice / "onnxruntime.dll",
    lic / "nodejs-LICENSE",
    lic / "sensevoice-README.md",
]
missing = [str(p) for p in needed if not p.exists()]
if missing:
    raise SystemExit("voice runtime incomplete:\\n" + "\\n".join(missing))
print("staged", voice)
`;
  const spec = JSON.stringify({
    voice: VOICE,
    nodeZip: paths.nodeZip,
    modelArchive: paths.modelArchive,
    sherpaNode: paths.sherpaNode,
    sherpaWin: paths.sherpaWin,
    worker: path.join(ROOT, "app", "workers", "sherpa-stt-worker.js"),
  });
  const python = pickPython();
  const result = spawnSync(python.cmd, [...python.args, "-c", script, spec], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error("failed to stage voice runtime");
  }
}

function installDownloadedLicenses(paths) {
  const dir = path.join(VOICE, "licenses");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(paths.sherpaLicense, path.join(dir, "sherpa-onnx-LICENSE"));
  fs.copyFileSync(paths.onnxruntimeLicense, path.join(dir, "onnxruntime-LICENSE"));
  for (const name of [
    "nodejs-LICENSE",
    "sensevoice-README.md",
    "sherpa-onnx-LICENSE",
    "onnxruntime-LICENSE",
  ]) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file) || fs.statSync(file).size < 20) {
      throw new Error("missing license " + name);
    }
  }
}

async function main() {
  const paths = {};
  for (const [key, asset] of Object.entries(ASSETS)) {
    paths[key] = await ensureAsset(asset);
  }
  stage(paths);
  installDownloadedLicenses(paths);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { pickPython, PYTHON_CANDIDATES };
