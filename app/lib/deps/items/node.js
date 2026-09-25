const NODE_DIST = "https://nodejs.org/dist/v22.19.0/node-v22.19.0-win-x64.zip";

/**
 * Sidecar Node for native modules (sherpa-onnx-node cannot load inside Electron).
 */
module.exports = function registerNode(api) {
  api.registerDep({
    id: "node",
    title: "Node.js",
    group: "runtime",
    required: true,
    detail: "语音识别 sidecar（sherpa-onnx-node）需要系统 Node，不能用 Electron 自己的进程加载原生模块。",
    detect: (ctx) => {
      const bin = api.nodeBin(ctx);
      return { ok: Boolean(bin), detail: bin || "未找到 node" };
    },
    install: async (ctx) => {
      ctx.onProgress?.({ message: "下载便携 Node.js …", pct: 5 });
      const zip = api.path.join(ctx.depsRoot, "cache", "node.zip");
      await api.downloadFile(NODE_DIST, zip, (p) =>
        ctx.onProgress?.({ message: `Node.js ${p.pct || 0}%`, pct: Math.min(40, p.pct || 0) })
      );
      const dest = api.path.join(ctx.depsRoot, "node");
      api.fs.mkdirSync(dest, { recursive: true });
      ctx.onProgress?.({ message: "解压 Node.js …", pct: 50 });
      await api.extractArchive(zip, dest);
      const inner = api.fs
        .readdirSync(dest, { withFileTypes: true })
        .find((d) => d.isDirectory() && d.name.startsWith("node-"));
      if (inner) {
        const exe = api.path.join(dest, inner.name, "node.exe");
        if (api.fs.existsSync(exe)) {
          api.fs.copyFileSync(exe, api.path.join(dest, "node.exe"));
          const npmCli = api.path.join(dest, inner.name, "npm.cmd");
          if (api.fs.existsSync(npmCli)) api.fs.copyFileSync(npmCli, api.path.join(dest, "npm.cmd"));
        }
      }
      if (!api.fs.existsSync(api.path.join(dest, "node.exe")) && !api.which("node")) {
        throw new Error("Node 解压后未找到 node.exe");
      }
    },
  });
};
