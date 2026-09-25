module.exports = function registerDeepseek(api) {
  api.registerDep({
    id: "deepseek-key",
    title: "DeepSeek API Key",
    group: "optional",
    required: false,
    detail: "可选。没有 Key 时用角色包本地台词；有 Key 才能自由聊、工具驱动动画、截屏感知。",
    detect: (ctx) => {
      const ok = Boolean(ctx.settings?.deepseekApiKey);
      return { ok, detail: ok ? "已配置" : "未配置（可选）" };
    },
    install: async () => {
      throw new Error("请在设置里粘贴 DeepSeek API Key，或写入 secrets.local.json");
    },
  });
};
