#!/usr/bin/env node
const os = require("os");
const fs = require("fs");
const path = require("path");
const { readPack } = require("../app/lib/packs");
const { loadLocalSecrets } = require("../app/lib/secrets");
const agent = require("../app/lib/agent");

async function main() {
  const secrets = loadLocalSecrets();
  if (!secrets.deepseekApiKey) {
    console.error("NO_KEY");
    process.exit(2);
  }
  const pack = readPack(path.join(__dirname, "..", "packs"), "sample-human");
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pet-agent-"));
  const plays = [];
  const moves = [];
  const res = await agent.runAgentTurn({
    pack,
    settings: {
      deepseekEnabled: true,
      deepseekApiKey: secrets.deepseekApiKey,
      deepseekBaseUrl: secrets.deepseekBaseUrl || "https://api.deepseek.com",
      deepseekModel: secrets.deepseekModel || "deepseek-flash",
      memoryEnabled: true,
      visionEnabled: false,
    },
    userText: "我今天特别开心！请播放开心动画，并记住：我喜欢被鼓励。",
    userData,
    applyPlay: (action, line) => plays.push({ action, line }),
    applyMove: (direction, distance) => moves.push({ direction, distance }),
  });
  const mem = require("../app/lib/memory").loadMemory(userData, pack.id);
  console.log(
    JSON.stringify(
      {
        ok: Boolean(res.text),
        text: res.text,
        action: res.action,
        source: res.source,
        error: res.error || null,
        plays,
        memFacts: mem.facts,
      },
      null,
      2
    )
  );
  if (res.source === "local-fallback") process.exit(1);
  if (!res.text) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
