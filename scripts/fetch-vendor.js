/**
 * Download and stage the pinned Windows voice runtime.
 * Extraction uses the pinned Node packages in the repo-root lockfile
 * (unbzip2-stream, tar, yauzl). Nothing here runs inside the end-user app.
 *
 *   npm ci
 *   node scripts/fetch-vendor.js
 */
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const bz2 = require("unbzip2-stream");
const tar = require("tar");
const yauzl = require("yauzl");

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
  sensevoiceLicense: {
    file: "sensevoice-apache-2.0-LICENSE",
    url: "https://www.apache.org/licenses/LICENSE-2.0.txt",
    sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  },
};

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

function isSafeArchivePath(name) {
  const rel = String(name || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  if (!rel || rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) return false;
  const parts = rel.split("/");
  return parts.length > 0 && parts.every((part) => part && part !== "." && part !== "..");
}

function readZipFiles(zipPath, want) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      let failed = false;
      const fail = (error) => {
        if (failed) return;
        failed = true;
        try {
          zip.close();
        } catch (_) {}
        reject(error);
      };
      zip.on("error", fail);
      zip.on("entry", (entry) => {
        if (failed) return;
        const name = String(entry.fileName || "");
        const stripped = name.replace(/\/+$/, "");
        if (stripped && !isSafeArchivePath(stripped)) {
          fail(new Error("unsafe path in zip: " + name));
          return;
        }
        if (name.endsWith("/")) {
          zip.readEntry();
          return;
        }
        let dest = null;
        try {
          dest = want(name);
        } catch (error) {
          fail(error);
          return;
        }
        if (!dest) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return fail(streamErr);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const out = fs.createWriteStream(dest);
          stream.on("error", fail);
          out.on("error", fail);
          out.on("finish", () => {
            if (!failed) zip.readEntry();
          });
          stream.pipe(out);
        });
      });
      zip.on("end", () => {
        if (!failed) resolve();
      });
      zip.readEntry();
    });
  });
}

function extractBz2Files(archive, pick) {
  return new Promise((resolve, reject) => {
    const parser = new tar.Parser({ strict: true });
    let pending = 0;
    let ended = false;
    let failed = false;
    const fail = (error) => {
      if (failed) return;
      failed = true;
      reject(error);
    };
    const finish = () => {
      if (!failed && ended && pending === 0) resolve();
    };
    parser.on("entry", (entry) => {
      const name = String(entry.path || "");
      if (!isSafeArchivePath(name)) {
        entry.resume();
        fail(new Error("unsafe path in archive: " + name));
        return;
      }
      const base = name.replace(/\\/g, "/").split("/").pop();
      const isFile = entry.type === "File" || entry.type === "0" || entry.type === "ContinuousFile";
      const dest = isFile ? pick(base, name) : null;
      if (!dest) {
        entry.resume();
        return;
      }
      pending += 1;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const out = fs.createWriteStream(dest);
      out.on("finish", () => {
        pending -= 1;
        finish();
      });
      out.on("error", fail);
      entry.on("error", fail);
      entry.pipe(out);
    });
    parser.on("end", () => {
      ended = true;
      finish();
    });
    parser.on("error", fail);
    fs.createReadStream(archive)
      .on("error", fail)
      .pipe(bz2())
      .on("error", fail)
      .pipe(parser);
  });
}

async function extractPackage(archive, dest) {
  fs.mkdirSync(dest, { recursive: true });
  await tar.extract({
    file: archive,
    cwd: dest,
    strip: 1,
    strict: true,
    filter(entryPath) {
      const rel = String(entryPath || "");
      if (!isSafeArchivePath(rel)) {
        throw new Error("unsafe path in archive: " + rel);
      }
      return true;
    },
  });
}

async function stage(paths) {
  fs.rmSync(VOICE, { recursive: true, force: true });
  fs.mkdirSync(VOICE, { recursive: true });
  const modules = path.join(VOICE, "node_modules");
  const lic = path.join(VOICE, "licenses");
  const modelDir = path.join(VOICE, "models", "sensevoice-small");
  fs.mkdirSync(modules, { recursive: true });
  fs.mkdirSync(lic, { recursive: true });
  fs.mkdirSync(modelDir, { recursive: true });

  await readZipFiles(paths.nodeZip, (name) => {
    const norm = name.replace(/\\/g, "/");
    if (norm.endsWith("/node.exe")) return path.join(VOICE, "node.exe");
    const parts = norm.split("/");
    if (parts.length === 2 && parts[1] === "LICENSE") return path.join(lic, "nodejs-LICENSE");
    return null;
  });

  await extractBz2Files(paths.modelArchive, (base) => {
    if (base === "model.int8.onnx" || base === "tokens.txt") return path.join(modelDir, base);
    if (base.toLowerCase() === "readme.md") return path.join(lic, "sensevoice-README.md");
    return null;
  });

  await extractPackage(paths.sherpaNode, path.join(modules, "sherpa-onnx-node"));
  await extractPackage(paths.sherpaWin, path.join(modules, "sherpa-onnx-win-x64"));

  const dllDir = path.join(modules, "sherpa-onnx-win-x64");
  for (const name of fs.readdirSync(dllDir)) {
    if (name.toLowerCase().endsWith(".dll")) {
      fs.copyFileSync(path.join(dllDir, name), path.join(VOICE, name));
    }
  }
  fs.copyFileSync(path.join(ROOT, "app", "workers", "sherpa-stt-worker.js"), path.join(VOICE, "sherpa-stt-worker.js"));

  const needed = [
    path.join(VOICE, "node.exe"),
    path.join(VOICE, "sherpa-stt-worker.js"),
    path.join(modelDir, "model.int8.onnx"),
    path.join(modelDir, "tokens.txt"),
    path.join(modules, "sherpa-onnx-node", "sherpa-onnx.js"),
    path.join(dllDir, "sherpa-onnx.node"),
    path.join(VOICE, "onnxruntime.dll"),
    path.join(lic, "nodejs-LICENSE"),
    path.join(lic, "sensevoice-README.md"),
  ];
  const missing = needed.filter((file) => !fs.existsSync(file));
  if (missing.length) {
    throw new Error("voice runtime incomplete:\n" + missing.join("\n"));
  }
  console.log("staged", VOICE);
}

function installDownloadedLicenses(paths) {
  const dir = path.join(VOICE, "licenses");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(paths.sherpaLicense, path.join(dir, "sherpa-onnx-LICENSE"));
  fs.copyFileSync(paths.onnxruntimeLicense, path.join(dir, "onnxruntime-LICENSE"));
  fs.copyFileSync(paths.sensevoiceLicense, path.join(dir, "sensevoice-LICENSE"));
  for (const name of [
    "nodejs-LICENSE",
    "sensevoice-README.md",
    "sensevoice-LICENSE",
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
  await stage(paths);
  installDownloadedLicenses(paths);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = {
  ASSETS,
  isSafeArchivePath,
  readZipFiles,
  extractBz2Files,
  extractPackage,
  stage,
};
