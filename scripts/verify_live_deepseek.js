#!/usr/bin/env node
/**
 * Live DeepSeek text + (optional) image. Uses secrets.local.json / env.
 */
const fs = require("fs");
const path = require("path");
const { loadLocalSecrets } = require("../app/lib/secrets");
const { chatCompletionsRetry } = require("../app/lib/deepseek");
const { readPack } = require("../app/lib/packs");

async function main() {
  const secrets = loadLocalSecrets();
  const apiKey = secrets.deepseekApiKey;
  if (!apiKey) {
    console.error("NO_KEY");
    process.exit(2);
  }
  const text = await chatCompletionsRetry({
    apiKey,
    baseUrl: secrets.deepseekBaseUrl,
    model: secrets.deepseekModel || "deepseek-flash",
    thinking: "disabled",
    maxTokens: 80,
    messages: [
      {
        role: "system",
        content: "你是桌宠小杏。用不超过 20 字中文回答。",
      },
      { role: "user", content: "你好，我有点开心。" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "play_action",
          description: "播放动画",
          parameters: {
            type: "object",
            properties: { action: { type: "string", enum: ["happy", "meow"] } },
            required: ["action"],
          },
        },
      },
    ],
  });

  const pack = readPack(path.join(__dirname, "..", "packs"), "blob");
  const idleRel = pack.states.idle.frames[0].replace(/^file:\/\//, "");
  const idlePath = idleRel.replace(/^\/([A-Za-z]:)/, "$1");
  let vision = null;
  let visionError = null;
  try {
    const png = fs.readFileSync(idlePath);
    // PNG as JPEG data-url may fail; send PNG base64 via jpegDataUrl is wrong.
    // Use PNG data URL through describeScreenshot after converting? API accepts png.
    const { chatCompletionsRetry: cc } = require("../app/lib/deepseek");
    const b64 = png.toString("base64");
    const v = await cc({
      apiKey,
      baseUrl: secrets.deepseekBaseUrl,
      model: secrets.visionModel || "deepseek-flash",
      thinking: "disabled",
      maxTokens: 80,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "用10字描述这个透明背景小图标里的角色。" },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${b64}` },
            },
          ],
        },
      ],
    });
    vision = v.content;
  } catch (err) {
    visionError = String(err.message || err).slice(0, 300);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        text: text.content,
        tool_calls: (text.tool_calls || []).map((c) => c.function?.name || c.name),
        vision,
        visionError,
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
