module.exports = function registerFfmpeg(api) {
  api.registerDep({
    id: "ffmpeg",
    title: "FFmpeg",
    group: "runtime",
    required: true,
    detail: "语音转 16kHz WAV、角色包从视频抽帧。",
    detect: (ctx) => {
      const bin = api.findFfmpeg(ctx);
      return { ok: Boolean(bin), detail: bin || "未找到 ffmpeg" };
    },
    install: async (ctx) => {
      const npm = api.npmCmd();
      ctx.onProgress?.({ message: "安装 ffmpeg-static …", pct: 10 });
      await api.run(npm.cmd, ["install", "ffmpeg-static@5.2.0", "--omit=dev"], {
        cwd: ctx.depsRoot,
      });
      const exe = api.path.join(ctx.depsRoot, "node_modules", "ffmpeg-static", "ffmpeg.exe");
      if (!api.fs.existsSync(exe)) throw new Error("ffmpeg-static 安装后仍没有 ffmpeg.exe");
      const dir = api.path.join(ctx.depsRoot, "ffmpeg");
      api.fs.mkdirSync(dir, { recursive: true });
      api.fs.copyFileSync(exe, api.path.join(dir, "ffmpeg.exe"));
    },
  });
};
