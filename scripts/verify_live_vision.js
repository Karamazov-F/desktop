#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readPack } = require("../app/lib/packs");
const { loadLocalSecrets } = require("../app/lib/secrets");
const agent = require("../app/lib/agent");

async function main() {
  const secrets = loadLocalSecrets();
  const pack = readPack(path.join(__dirname, "..", "packs"), "sample-human");
  const png = fs.readFileSync(
    path.join(__dirname, "..", "packs", "blob", "sprites", "idle.png")
  );
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pet-vision-"));
  const res = await agent.runAgentTurn({
    pack,
    settings: {
      deepseekEnabled: true,
      deepseekApiKey: secrets.deepseekApiKey,
      deepseekBaseUrl: secrets.deepseekBaseUrl || "https://api.deepseek.com",
      deepseekModel: "deepseek-flash",
      visionModel: "deepseek-flash",
      memoryEnabled: false,
      visionEnabled: true,
    },
    userText: "看一眼屏幕，用一句话告诉我上面有什么。",
    userData,
    captureScreen: async () => png,
    applyPlay: () => {},
    applyMove: () => {},
  });
  console.log(
    JSON.stringify(
      {
        ok: Boolean(res.text && res.usedVision),
        text: res.text,
        usedVision: res.usedVision,
        source: res.source,
        error: res.error || null,
      },
      null,
      2
    )
  );
  if (!res.usedVision) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
