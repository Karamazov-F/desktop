const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

test("clearing a pack invalidates a pending agent turn before it can write or display", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-clear-generation-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const deepseekEntry = require.resolve("../app/lib/deepseek");
  const agentEntry = require.resolve("../app/lib/agent");
  const originalDeepseek = require.cache[deepseekEntry];
  const originalAgent = require.cache[agentEntry];
  let resolveReply;
  require.cache[deepseekEntry] = {
    id: deepseekEntry, filename: deepseekEntry, loaded: true,
    exports: { chatCompletionsRetry: () => new Promise((resolve) => { resolveReply = resolve; }) },
  };
  delete require.cache[agentEntry];
  try {
    const agent = require("../app/lib/agent");
    const actions = [];
    const pack = {
      id: "first", name: "测试角色", persona: { displayName: "测试角色" },
      states: { idle: { frames: [] } }, dialogue: { fallback: ["嗯"] },
    };
    const pending = agent.runAgentTurn({
      pack,
      settings: { deepseekEnabled: true, deepseekApiKey: "sk-test", memoryEnabled: true, visionEnabled: false },
      userText: "旧问题", userData: dir,
      applyPlay: (...args) => actions.push(args),
    });
    assert.ok(resolveReply);
    agent.clearSession(pack.id);
    resolveReply({ content: "迟到回答" });
    assert.deepEqual(await pending, { text: "", stale: true });
    assert.deepEqual(actions, []);
    assert.deepEqual(agent.getHistory(pack.id), []);
    assert.equal(fs.existsSync(path.join(dir, "memory", "first.json")), false);
  } finally {
    if (originalDeepseek) require.cache[deepseekEntry] = originalDeepseek;
    else delete require.cache[deepseekEntry];
    if (originalAgent) require.cache[agentEntry] = originalAgent;
    else delete require.cache[agentEntry];
  }
});
