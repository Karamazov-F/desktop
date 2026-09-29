const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const paths = require("./paths");

const WORKER_NAME = "sherpa-stt-worker.js";
const REQUEST_TIMEOUT_MS = 25000;
const READY_TIMEOUT_MS = 60000;

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

function assertRuntime() {
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

function createSupervisor(options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
  let proc = null;
  let starting = null;
  let seq = 0;
  const pending = new Map();
  let lineBuf = "";

  function resetSession() {
    lineBuf = "";
    for (const [, item] of pending) {
      try {
        item.reject(new Error("sherpa worker restarted"));
      } catch (_) {}
    }
    pending.clear();
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
      const item = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.ok) item.resolve(msg);
      else item.reject(new Error(msg.error || "stt failed"));
    }
  }

  function attach(child) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (proc !== child) return;
      lineBuf += chunk;
      let idx;
      while ((idx = lineBuf.indexOf("\n")) >= 0) {
        const line = lineBuf.slice(0, idx).trim();
        lineBuf = lineBuf.slice(idx + 1);
        if (line) handleLine(line);
      }
    });
    child.stderr.on("data", (data) => {
      if (proc !== child) return;
      const text = data.toString();
      if (text) console.warn("[sherpa]", text.trim().slice(0, 300));
    });
    child.on("exit", () => {
      if (proc !== child) return;
      proc = null;
      for (const [, item] of pending) item.reject(new Error("sherpa worker exited"));
      pending.clear();
    });
  }

  function ensureWorker() {
    if (proc && !proc.killed) return Promise.resolve();
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      let rt;
      try {
        rt = options.runtime || assertRuntime();
      } catch (err) {
        reject(err);
        return;
      }
      resetSession();
      const pathKey = process.platform === "win32" ? "Path" : "PATH";
      const child = spawnImpl(rt.node, [rt.worker, rt.modelDir], {
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
      }, readyTimeoutMs);
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

  function shutdown() {
    const child = proc;
    proc = null;
    if (child && !child.killed) {
      try {
        child.kill();
      } catch (_) {}
    }
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
      }, requestTimeoutMs);
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

  function pendingCount() {
    return pending.size;
  }

  return { ensureWorker, sendRequest, shutdown, pendingCount };
}

function tempWavPath() {
  return path.join(
    os.tmpdir(),
    `pet-rec-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.wav`
  );
}

const shared = createSupervisor();

async function transcribeBuffer(buffer) {
  await shared.ensureWorker();
  const wav = tempWavPath();
  fs.writeFileSync(wav, buffer);
  try {
    const result = await shared.sendRequest({ path: wav });
    return String(result.text || "").trim();
  } finally {
    try {
      fs.unlinkSync(wav);
    } catch (_) {}
  }
}

function warmup() {
  return shared.ensureWorker().catch((err) => {
    console.warn("sherpa warmup failed", err.message);
    return null;
  });
}

module.exports = {
  transcribeBuffer,
  warmup,
  shutdown: () => shared.shutdown(),
  ensureWorker: () => shared.ensureWorker(),
  tempWavPath,
  createSupervisor,
  REQUEST_TIMEOUT_MS,
};
