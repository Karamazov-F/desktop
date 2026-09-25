const fs = require("fs");
const path = require("path");
const { downloadFile, downloadFirst } = require("./download");
const { extractArchive, findNamedFile, which, run, pythonBin } = require("./extract");

/**
 * Extensible dependency catalog.
 *
 * 新增依赖（后续功能一律走这里，不要另起检测/安装）：
 * 1. 在 `app/lib/deps/items/<id>.js` 导出 `module.exports = (api) => api.registerDep({...})`
 * 2. 启动页、托盘「环境依赖」、`node scripts/install-deps.js` 会自动扫到并支持一键安装
 *
 * Item shape:
 *   id, title, detail, required, group,
 *   detect(ctx) => { ok, detail }
 *   install(ctx) => Promise<void>   ctx.onProgress({ message, pct })
 */

const extras = [];
let itemsLoaded = false;

function registerDep(item) {
  extras.push(item);
  return item;
}

function npmCmd() {
  return { cmd: process.platform === "win32" ? "npm.cmd" : "npm" };
}

function ffmpegCandidates(ctx) {
  return [
    process.env.FFMPEG,
    ctx.ffmpegPath,
    path.join(ctx.depsRoot, "ffmpeg", "ffmpeg.exe"),
    path.join(ctx.depsRoot, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    which("ffmpeg"),
    path.join(process.env.LOCALAPPDATA || "", "Python", "bin", "ffmpeg.exe"),
    "L:\\openclaw\\voice\\ffmpeg\\ffmpeg.exe",
  ].filter(Boolean);
}

function findFfmpeg(ctx) {
  for (const p of ffmpegCandidates(ctx || {})) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function nodeBin(ctx) {
  const portable = path.join(ctx.depsRoot, "node", "node.exe");
  if (fs.existsSync(portable)) return portable;
  return which("node");
}

function senseVoiceDir(ctx) {
  return path.join(ctx.depsRoot, "models", "sensevoice-small");
}

function senseVoiceFiles(ctx) {
  const dir = senseVoiceDir(ctx);
  const model = path.join(dir, "model.int8.onnx");
  const tokens = path.join(dir, "tokens.txt");
  return { dir, model, tokens, ok: fs.existsSync(model) && fs.existsSync(tokens) };
}

function sherpaPkg(ctx) {
  return path.join(ctx.depsRoot, "node_modules", "sherpa-onnx-node");
}

function helpers() {
  return {
    registerDep,
    downloadFile,
    downloadFirst,
    extractArchive,
    findNamedFile,
    which,
    run,
    pythonBin,
    npmCmd,
    findFfmpeg,
    nodeBin,
    senseVoiceDir,
    senseVoiceFiles,
    sherpaPkg,
    fs,
    path,
  };
}

function loadItems() {
  if (itemsLoaded) return;
  itemsLoaded = true;
  const dir = path.join(__dirname, "items");
  if (!fs.existsSync(dir)) return;
  const api = helpers();
  const rank = { "node.js": 10, "ffmpeg.js": 20, "voice.js": 30, "deepseek.js": 90 };
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".js"))
    .sort((a, b) => (rank[a] || 50) - (rank[b] || 50) || a.localeCompare(b));
  for (const name of names) {
    const mod = require(path.join(dir, name));
    if (typeof mod === "function") mod(api);
  }
}

function catalog(ctx) {
  loadItems();
  return extras.slice();
}

function scan(ctx) {
  return catalog(ctx).map((item) => {
    let detected;
    try {
      detected = item.detect(ctx);
    } catch (err) {
      detected = { ok: false, detail: String(err.message || err) };
    }
    return {
      id: item.id,
      title: item.title,
      group: item.group,
      required: Boolean(item.required),
      detail: item.detail,
      ok: Boolean(detected.ok),
      status: detected.detail,
      canInstall: typeof item.install === "function" && item.id !== "deepseek-key",
    };
  });
}

function missingRequired(rows) {
  return rows.filter((r) => r.required && !r.ok);
}

function requireReady(ctx, ids) {
  const rows = scan(ctx);
  const miss = rows.filter((r) => ids.includes(r.id) && !r.ok);
  if (!miss.length) return rows;
  const err = new Error("缺少依赖：" + miss.map((m) => m.title).join("、") + "。请先打开「环境依赖」一键安装。");
  err.missing = miss;
  throw err;
}

async function installIds(ctx, ids) {
  fs.mkdirSync(ctx.depsRoot, { recursive: true });
  const pkg = path.join(ctx.depsRoot, "package.json");
  if (!fs.existsSync(pkg)) {
    fs.writeFileSync(
      pkg,
      JSON.stringify({ name: "desktop-pet-deps", private: true }, null, 2)
    );
  }
  const all = catalog(ctx);
  const want = all.filter((i) => ids.includes(i.id));
  for (let i = 0; i < want.length; i++) {
    const item = want[i];
    ctx.onProgress?.({
      message: `正在安装 ${item.title}（${i + 1}/${want.length}）`,
      pct: Math.round((i / want.length) * 100),
      id: item.id,
    });
    await item.install(ctx);
  }
}

module.exports = {
  registerDep,
  catalog,
  scan,
  missingRequired,
  installIds,
  requireReady,
  findFfmpeg,
  nodeBin,
  senseVoiceFiles,
  senseVoiceDir,
  sherpaPkg,
};
