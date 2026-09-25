const fs = require("fs");
const path = require("path");
const { extractActionFrames } = require("./ffmpeg-frames");
const { encryptDir } = require("./dpet");

const LOOP_DEFAULT = new Set(["idle", "sleep", "blink"]);
const PINGPONG_DEFAULT = new Set(["idle", "sleep"]);

const DEFAULT_LABELS = {
  idle: "待机",
  blink: "眨眼",
  sleep: "睡觉",
  stretch: "伸懒腰",
  meow: "挥手",
  wave: "挥手",
  happy: "开心",
  walk: "走路",
  run: "跑步",
};

function slugId(s) {
  const t = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return t || "pack";
}

function actionId(s) {
  const t = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return t;
}

/**
 * @param {object} spec
 * @param {string} spec.id
 * @param {string} spec.name
 * @param {{width:number,height:number}} spec.size
 * @param {Array<{action:string, video:string, label?:string, loop?:boolean, pingpong?:boolean}>} spec.actions
 * @param {string} spec.workDir
 * @param {string} spec.outFile
 * @param {boolean} [spec.chroma]
 * @param {function} [spec.onProgress]
 */
async function buildEncryptedPack(spec) {
  const id = slugId(spec.id);
  const name = String(spec.name || id);
  const width = Math.max(32, Number(spec.size?.width) || 256);
  const height = Math.max(32, Number(spec.size?.height) || 256);
  const actions = (spec.actions || []).filter((a) => a && a.action && a.video);
  if (!actions.some((a) => actionId(a.action) === "idle")) {
    throw new Error("必须包含 idle 动作视频");
  }
  const workDir = spec.workDir;
  const sprites = path.join(workDir, "sprites");
  fs.mkdirSync(sprites, { recursive: true });

  const states = {};
  for (const row of actions) {
    const key = actionId(row.action);
    if (!key) continue;
    spec.onProgress?.(`抽取 ${key} …`);
    const extracted = await extractActionFrames({
      video: row.video,
      destDir: sprites,
      prefix: key,
      width,
      height,
      chroma: spec.chroma || false,
      maxFrames: Number(spec.maxFrames) > 0 ? Number(spec.maxFrames) : 90,
    });
    if (extracted.count < 1) throw new Error(`${key} 抽出 0 帧`);
    const loop =
      row.loop != null ? Boolean(row.loop) : LOOP_DEFAULT.has(key);
    const pingpong =
      row.pingpong != null
        ? Boolean(row.pingpong)
        : PINGPONG_DEFAULT.has(key) && extracted.count > 2;
    const st = {
      frames: extracted.frames,
      fps: extracted.fps,
      loop,
    };
    if (pingpong) st.pingpong = true;
    const label = row.label || DEFAULT_LABELS[key];
    if (label && key !== "idle" && key !== "blink") st.label = label;
    states[key] = st;
  }

  const pack = {
    id,
    name,
    version: spec.version || "1.0.0",
    author: spec.author || "",
    license: spec.license || "proprietary-pack",
    size: { width, height },
    states,
  };
  if (spec.persona && typeof spec.persona === "object") pack.persona = spec.persona;
  if (spec.dialogue && typeof spec.dialogue === "object") pack.dialogue = spec.dialogue;

  fs.writeFileSync(path.join(workDir, "pack.json"), JSON.stringify(pack, null, 2), "utf8");
  spec.onProgress?.("加密打包 …");
  const outFile = spec.outFile;
  encryptDir(workDir, outFile, { id, name, version: pack.version });
  spec.onProgress?.("完成");
  return { outFile, pack };
}

module.exports = {
  buildEncryptedPack,
  slugId,
  actionId,
  DEFAULT_LABELS,
};
