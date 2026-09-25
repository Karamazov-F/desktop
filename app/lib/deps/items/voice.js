const ARCHIVE_URLS = [
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2",
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2",
];

const MODEL_URLS = [
  "https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx?download=true",
  "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx?download=true",
  "https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/resolve/main/model.int8.onnx?download=true",
];

const TOKENS_URLS = [
  "https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt?download=true",
  "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt?download=true",
  "https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/resolve/main/tokens.txt?download=true",
];

function copyModelFiles(api, searchRoot, dest) {
  api.fs.mkdirSync(dest, { recursive: true });
  for (const name of ["model.int8.onnx", "tokens.txt"]) {
    const from = api.findNamedFile(searchRoot, name);
    if (from) api.fs.copyFileSync(from, api.path.join(dest, name));
  }
}

module.exports = function registerVoice(api) {
  api.registerDep({
    id: "sherpa-onnx",
    title: "sherpa-onnx 运行时",
    group: "voice",
    required: true,
    detail: "本地语音识别引擎（npm: sherpa-onnx-node）。",
    detect: (ctx) => {
      const ok =
        api.fs.existsSync(api.path.join(api.sherpaPkg(ctx), "index.js")) ||
        api.fs.existsSync(api.path.join(api.sherpaPkg(ctx), "package.json"));
      return { ok, detail: ok ? api.sherpaPkg(ctx) : "未安装 sherpa-onnx-node" };
    },
    install: async (ctx) => {
      api.fs.mkdirSync(ctx.depsRoot, { recursive: true });
      ctx.onProgress?.({ message: "安装 sherpa-onnx-node …", pct: 15 });
      const npm = api.npmCmd();
      await api.run(npm.cmd, ["install", "sherpa-onnx-node@1.13.4", "--omit=dev"], {
        cwd: ctx.depsRoot,
      });
      if (!api.fs.existsSync(api.path.join(api.sherpaPkg(ctx), "package.json"))) {
        throw new Error("sherpa-onnx-node 安装失败");
      }
    },
  });

  api.registerDep({
    id: "sensevoice-small",
    title: "SenseVoice-Small 模型",
    group: "voice",
    required: true,
    detail: "FunAudioLLM SenseVoice-Small 的 sherpa-onnx int8 包（中英日韩粤）。约 230MB。",
    detect: (ctx) => {
      const f = api.senseVoiceFiles(ctx);
      return { ok: f.ok, detail: f.ok ? f.model : "未下载模型" };
    },
    install: async (ctx) => {
      const dest = api.senseVoiceDir(ctx);
      api.fs.mkdirSync(dest, { recursive: true });
      if (api.senseVoiceFiles(ctx).ok) return;

      const cache = api.path.join(ctx.depsRoot, "cache");
      api.fs.mkdirSync(cache, { recursive: true });
      let lastErr;

      const tryExtractCache = async () => {
        let names = [];
        try {
          names = api.fs.readdirSync(cache);
        } catch {
          return;
        }
        for (const name of names) {
          if (!/sense-voice/i.test(name)) continue;
          if (!/\.(bz2|gz|tgz|tar|zip)$/i.test(name)) continue;
          try {
            ctx.onProgress?.({ message: `解压已缓存的 ${name} …`, pct: 80 });
            await api.extractArchive(api.path.join(cache, name), cache);
            copyModelFiles(api, cache, dest);
            if (api.senseVoiceFiles(ctx).ok) return true;
          } catch (err) {
            lastErr = err;
          }
        }
        copyModelFiles(api, cache, dest);
        return api.senseVoiceFiles(ctx).ok;
      };

      if (await tryExtractCache()) return;

      try {
        ctx.onProgress?.({ message: "下载 tokens.txt …", pct: 5 });
        await api.downloadFirst(TOKENS_URLS, api.path.join(dest, "tokens.txt"), (p) =>
          ctx.onProgress?.({ message: `tokens.txt ${p.pct || 0}%`, pct: Math.min(10, p.pct || 0) })
        );
        ctx.onProgress?.({ message: "下载 model.int8.onnx …", pct: 10 });
        await api.downloadFirst(MODEL_URLS, api.path.join(dest, "model.int8.onnx"), (p) =>
          ctx.onProgress?.({ message: `SenseVoice-Small ${p.pct || 0}%`, pct: p.pct || 10 })
        );
        if (api.senseVoiceFiles(ctx).ok) return;
      } catch (err) {
        lastErr = err;
      }

      for (const url of ARCHIVE_URLS) {
        try {
          const tarPath = api.path.join(cache, api.path.basename(new URL(url).pathname));
          ctx.onProgress?.({ message: `下载 ${api.path.basename(tarPath)}`, pct: 5 });
          await api.downloadFile(url, tarPath, (p) =>
            ctx.onProgress?.({
              message: `SenseVoice-Small ${p.pct || 0}%`,
              pct: p.pct || 0,
            })
          );
          ctx.onProgress?.({ message: "解压模型 …", pct: 90 });
          await api.extractArchive(tarPath, cache);
          copyModelFiles(api, cache, dest);
          if (api.senseVoiceFiles(ctx).ok) return;
          lastErr = new Error("解压后缺少 model.int8.onnx / tokens.txt");
        } catch (err) {
          lastErr = err;
        }
      }

      throw lastErr || new Error("SenseVoice-Small 安装失败");
    },
  });
};
