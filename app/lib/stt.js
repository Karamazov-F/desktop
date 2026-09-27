const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const paths = require("./paths");

const WORKER_NAME = "sherpa-stt-worker.js";
const REQUEST_TIMEOUT_MS = 25000;
const READY_TIMEOUT_MS = 60000;

let proc = null;
let starting = null;
let seq = 0;
const pending = new Map();
let lineBuf = "";

function runtimePaths() {
  const root = paths.voiceRuntimeDir();
  return {
    root,
    node: path.join(root, "node.exe"),
    modelDir: path.join(root, "models", "sensevoice-small"),
    worker: path.join(root, WORKER_NAME),
    modules: path.join(root, "node_modules"),
    dllDir: path.join(root, "node_modules", "sherpa-onnx-win-x64"),
  };
}

function assertReady() {
  const rt = runtimePaths();
  const model = path.join(rt.modelDir, "model.int8.onnx");
  const tokens = path.join(rt.modelDir, "tokens.txt");
  if (
    !fs.existsSync(rt.node) ||
    !fs.existsSync(rt.worker) ||
    !fs.existsSync(model) ||
    !fs.existsSync(tokens)
  ) {
    throw new Error("语音组件未随安装包提供，请重新安装桌宠。");
  }
  return rt;
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
    let rt;
    try {
      rt = assertReady();
    } catch (err) {
      reject(err);
      return;
    }
    const pathKey = process.platform === "win32" ? "Path" : "PATH";
    const child = spawn(rt.node, [rt.worker, rt.modelDir], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      cwd: rt.root,
      env: {
        ...process.env,
        NODE_PATH: rt.modules,
        [pathKey]: [rt.dllDir, rt.root, process.env[pathKey] || process.env.PATH || ""]
          .filter(Boolean)
          .join(path.delimiter),
      },
    });
    proc = child;
    attach(child);
    const timer = setTimeout(() => {
      pending.delete("ready");
      reject(new Error("SenseVoice 启动超时"));
    }, READY_TIMEOUT_MS);
    pending.set("ready", {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      pending.delete("ready");
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
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error("语音识别超时"));
      shutdown();
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    proc.stdin.write(JSON.stringify({ ...obj, id }) + "\n");
  });
}

function tempWavPath() {
  return path.join(
    os.tmpdir(),
    `pet-rec-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.wav`
  );
}

async function transcribeBuffer(buffer) {
  await ensureWorker();
  const wav = tempWavPath();
  fs.writeFileSync(wav, buffer);
  try {
    const result = await sendRequest({ path: wav });
    return String(result.text || "").trim();
  } finally {
    try {
      fs.unlinkSync(wav);
    } catch (_) {}
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

module.exports = {
  transcribeBuffer,
  warmup,
  shutdown,
  ensureWorker,
  tempWavPath,
  REQUEST_TIMEOUT_MS,
};
