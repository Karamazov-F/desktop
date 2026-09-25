/**
 * Sidecar worker: system Node + sherpa-onnx-node + SenseVoice-Small.
 * stdin: JSON line { id, path }
 * stdout: JSON line { id, ok, text } or { ready: true }
 */
const fs = require("fs");
const path = require("path");

const modelDir = process.argv[2];
if (!modelDir) {
  process.stderr.write("missing model dir\n");
  process.exit(2);
}

const model = path.join(modelDir, "model.int8.onnx");
const tokens = path.join(modelDir, "tokens.txt");
if (!fs.existsSync(model) || !fs.existsSync(tokens)) {
  process.stderr.write("SenseVoice-Small files missing\n");
  process.exit(3);
}

let sherpa_onnx;
try {
  sherpa_onnx = require("sherpa-onnx-node");
} catch (err) {
  process.stderr.write("require sherpa-onnx-node failed: " + err.message + "\n");
  process.exit(4);
}

const recognizer = new sherpa_onnx.OfflineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    senseVoice: {
      model,
      language: "auto",
      useInverseTextNormalization: 1,
    },
    tokens,
    numThreads: 2,
    provider: "cpu",
    debug: 0,
  },
});

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function transcribeWav(wavPath) {
  const stream = recognizer.createStream();
  const wave = sherpa_onnx.readWave(wavPath);
  stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  const text = String(result?.text || result || "").trim();
  return text.replace(/<\|[^|]+\|>/g, "").trim();
}

emit({ ready: true, engine: "sherpa-onnx", model: "sensevoice-small" });

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let req = {};
    try {
      req = JSON.parse(line);
      const text = transcribeWav(req.path);
      emit({ ok: true, id: req.id, text });
    } catch (err) {
      emit({ ok: false, id: req.id, error: String(err.message || err) });
    }
  }
});
