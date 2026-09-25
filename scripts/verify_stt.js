#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const paths = require("../app/lib/paths");
const { loadSettings } = require("../app/lib/settings");
const stt = require("../app/lib/stt");

async function main() {
  const userData = process.env.PET_USER_DATA || paths.userDataDir();
  stt.setContext({
    depsRoot: paths.depsRoot(userData),
    settings: loadSettings(userData),
  });
  const bundled = path.join(
    paths.depsRoot(userData),
    "cache",
    "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09",
    "test_wavs",
    "en.wav"
  );
  let wav = bundled;
  if (!fs.existsSync(wav)) {
    wav = path.join(os.tmpdir(), "pet-stt-hello.wav");
    const ps = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = -2
$s.SetOutputToWaveFile(${JSON.stringify(wav)})
$s.Speak('Hello, I am happy today.')
$s.Dispose()
`;
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
    });
    if (r.status !== 0 || !fs.existsSync(wav)) {
      throw new Error("failed to synthesize wav");
    }
  }
  const buf = fs.readFileSync(wav);
  const t0 = Date.now();
  const text = await stt.transcribeBuffer(buf, "wav");
  stt.shutdown();
  console.log(
    JSON.stringify(
      { ok: Boolean(text), text, ms: Date.now() - t0, engine: "sherpa-onnx/sensevoice-small" },
      null,
      2
    )
  );
  if (!text) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
