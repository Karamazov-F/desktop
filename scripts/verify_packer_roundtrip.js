#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const assert = require("assert");
const { resolveFfmpeg } = require("../app/lib/ffmpeg-frames");
const { buildEncryptedPack } = require("../app/lib/pack-build");
const { decryptToDir } = require("../app/lib/dpet");
const { readPack } = require("../app/lib/packs");

async function main() {
  const ffmpeg = await resolveFfmpeg();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "packer-"));
  const png = path.join(__dirname, "..", "packs", "blob", "sprites", "idle.png");
  const video = path.join(tmp, "idle.mp4");
  const r = spawnSync(
    ffmpeg,
    ["-y", "-loop", "1", "-i", png, "-t", "0.4", "-r", "8", "-pix_fmt", "yuv420p", video],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error("ffmpeg make video failed");
  }
  const workDir = path.join(tmp, "work");
  const outFile = path.join(tmp, "blob-roundtrip.dpet");
  const built = await buildEncryptedPack({
    id: "blob-rt",
    name: "水滴球-封装",
    size: { width: 128, height: 128 },
    actions: [{ action: "idle", video }],
    workDir,
    outFile,
  });
  assert.ok(fs.existsSync(built.outFile));
  const unpacked = path.join(tmp, "unpacked");
  decryptToDir(built.outFile, unpacked);
  const pack = readPack(path.dirname(unpacked), path.basename(unpacked));
  assert.ok(pack.states.idle.frames.length >= 1);
  console.log(
    JSON.stringify(
      {
        ok: true,
        outFile: built.outFile,
        bytes: fs.statSync(built.outFile).size,
        idleFrames: pack.states.idle.frames.length,
        fps: pack.states.idle.fps,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
