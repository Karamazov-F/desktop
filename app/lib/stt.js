const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const deps = require("./deps");
const paths = require("./paths");

const WORKER = path.join(__dirname, "..", "workers", "sherpa-stt-worker.js");

let proc = null;
let starting = null;
let seq = 0;
const pending = new Map();
let lineBuf = "";
let ctxRef = null;

function setContext(ctx) {
  ctxRef = ctx;
}

function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.ready) {
    if (pending.has("ready")) {
      pending.get("ready").resolve(msg);
      pending.delete("ready");
    }
    return;
  }
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg);
    else p.reject(new Error(msg.error || "stt failed"));
  }
}

function attach(child) {
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    lineBuf += chunk;
    let idx;
    while ((idx = lineBuf.indexOf("\n")) >= 0) {
      const line = lineBuf.slice(0, idx).trim();
      lineBuf = lineBuf.slice(idx + 1);
      if (line) handleLine(line);
    }
  });
  child.stderr.on("data", (d) => {
    const s = d.toString();
    if (s) console.warn("[sherpa]", s.trim().slice(0, 300));
  });
  child.on("exit", () => {
    proc = null;
    for (const [, p] of pending) p.reject(new Error("sherpa worker exited"));
    pending.clear();
  });
}

function ensureWorker() {
  if (proc && !proc.killed) return Promise.resolve();
  if (starting) return starting;
  starting = new Promise((resolve, reject) => {
    if (!ctxRef) {
      reject(new Error("stt context missing"));
      return;
    }
    try {
      deps.requireReady(ctxRef, ["node", "ffmpeg", "sherpa-onnx", "sensevoice-small"]);
    } catch (err) {
      reject(err);
      return;
    }
    const node = deps.nodeBin(ctxRef);
    const files = deps.senseVoiceFiles(ctxRef);
    const child = spawn(node, [WORKER, files.dir], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_PATH: path.join(ctxRef.depsRoot, "node_modules"),
      },
      cwd: ctxRef.depsRoot,
    });
    proc = child;
    attach(child);
    const timer = setTimeout(() => {
      pending.delete("ready");
      reject(new Error("SenseVoice 启动超时"));
    }, 60000);
    pending.set("ready", {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
      reject,
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  }).finally(() => {
    starting = null;
  });
  return starting;
}

function sendRequest(obj) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    if (!proc) {
      reject(new Error("sherpa worker not running"));
      return;
    }
    pending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ ...obj, id }) + "\n");
  });
}

async function toWav16k(inputPath) {
  const ffmpeg = deps.findFfmpeg(ctxRef || {});
  if (!ffmpeg) throw new Error("未找到 ffmpeg，请先一键安装依赖");
  const out = path.join(os.tmpdir(), `pet-stt-${Date.now()}.wav`);
  await new Promise((resolve, reject) => {
    const p = spawn(
      ffmpeg,
      ["-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-f", "wav", out],
      { windowsHide: true }
    );
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-800) || "ffmpeg wav failed"));
    });
  });
  return out;
}

async function transcribeBuffer(buffer, ext = "webm") {
  await ensureWorker();
  // ext may arrive as a raw MIME type ("audio/webm;codecs=opus") — normalize
  // to a bare extension or the "/" would turn the temp path into a subdir.
  const bareExt = String(ext).toLowerCase().includes("wav") ? "wav" : "webm";
  const raw = path.join(os.tmpdir(), `pet-rec-${Date.now()}.${bareExt}`);
  fs.writeFileSync(raw, buffer);
  let wav = raw;
  try {
    if (bareExt !== "wav") wav = await toWav16k(raw);
    const result = await sendRequest({ path: wav });
    return String(result.text || "").trim();
  } finally {
    try {
      fs.unlinkSync(raw);
    } catch (_) {}
    if (wav !== raw) {
      try {
        fs.unlinkSync(wav);
      } catch (_) {}
    }
  }
}

function warmup() {
  return ensureWorker().catch((err) => {
    console.warn("sherpa warmup failed", err.message);
    return null;
  });
}

function shutdown() {
  if (proc && !proc.killed) {
    try {
      proc.kill();
    } catch (_) {}
  }
  proc = null;
}

function defaultCtx(userData, settings) {
  const root = paths.depsRoot(userData);
  paths.ensureDir(root);
  return { depsRoot: root, settings: settings || {}, onProgress: null };
}

module.exports = {
  setContext,
  transcribeBuffer,
  warmup,
  shutdown,
  ensureWorker,
  defaultCtx,
};
