const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const deps = require("./deps");
const paths = require("./paths");

async function resolveFfmpeg() {
  const bin = deps.findFfmpeg({ depsRoot: paths.depsRoot() });
  if (bin) return bin;
  throw new Error("找不到 ffmpeg，请先打开桌宠「环境依赖」一键安装");
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.slice(-1500) || `ffmpeg exit ${code}`));
    });
  });
}

async function probeFps(ffmpeg, video) {
  try {
    const { stderr, stdout } = await run(ffmpeg, ["-i", video, "-hide_banner"]);
    const text = stderr + stdout;
    const m = text.match(/(\d+(?:\.\d+)?)\s*fps/) || text.match(/(\d+(?:\.\d+)?)\s*tbr/);
    const fps = m ? Number(m[1]) : 12;
    return Number.isFinite(fps) && fps > 0 ? fps : 12;
  } catch {
    return 12;
  }
}

function filterChain({ width, height, chroma }) {
  const w = Math.max(32, Number(width) || 256);
  const h = Math.max(32, Number(height) || 256);
  const parts = [];
  if (chroma) {
    const color = chroma === true ? "0x00FF00" : String(chroma);
    parts.push(`colorkey=${color}:0.30:0.12`);
    parts.push("format=rgba");
  }
  parts.push(
    `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos`
  );
  parts.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`);
  return parts.join(",");
}

function pickEven(files, maxCount) {
  if (files.length <= maxCount) return files;
  const out = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.round((i * (files.length - 1)) / (maxCount - 1));
    out.push(files[idx]);
  }
  return out;
}

/**
 * Extract PNG frames from a video into destDir as `{prefix}_{i}.png`.
 */
async function extractActionFrames({
  video,
  destDir,
  prefix,
  width = 256,
  height = 256,
  chroma = false,
  maxFrames = 90,
}) {
  if (!video || !fs.existsSync(video)) throw new Error(`视频不存在：${prefix}`);
  const ffmpeg = await resolveFfmpeg();
  fs.mkdirSync(destDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pet-frames-"));
  const pattern = path.join(tmp, "raw_%04d.png");
  const vf = filterChain({ width, height, chroma });
  await run(ffmpeg, ["-y", "-i", video, "-vsync", "0", "-vf", vf, pattern]);
  let files = fs
    .readdirSync(tmp)
    .filter((f) => f.startsWith("raw_") && f.endsWith(".png"))
    .sort()
    .map((f) => path.join(tmp, f));
  if (!files.length) {
    throw new Error(`${prefix} 没有抽出帧`);
  }
  files = pickEven(files, maxFrames);
  const written = [];
  for (const old of fs.readdirSync(destDir)) {
    if (old.startsWith(prefix + "_") && old.endsWith(".png")) {
      fs.unlinkSync(path.join(destDir, old));
    }
  }
  files.forEach((src, i) => {
    const name = `${prefix}_${i}.png`;
    const dest = path.join(destDir, name);
    fs.copyFileSync(src, dest);
    written.push(`sprites/${name}`);
  });
  const fps = await probeFps(ffmpeg, video);
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {}
  return { frames: written, fps: Math.max(4, Math.min(24, Math.round(fps))), count: written.length };
}

module.exports = {
  resolveFfmpeg,
  extractActionFrames,
  pickEven,
};
