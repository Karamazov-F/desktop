const { chatCompletionsRetry } = require("./deepseek");

const VISION_PROMPT =
  "用不超过 80 字的中文描述这张桌面截图：用户大概在看什么、窗口/内容类型、是否忙碌。不要猜隐私细节（密码、聊天全文）。找不到就说看不清。";

function sniffMime(buf) {
  if (buf && buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  return "image/jpeg";
}

function imageDataUrl(buf) {
  const mime = sniffMime(buf);
  return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
}

async function describeScreenshot({
  apiKey,
  baseUrl,
  model,
  jpegBuffer,
  extraHint = "",
}) {
  if (!jpegBuffer || !jpegBuffer.length) {
    throw new Error("empty screenshot");
  }
  const userText = extraHint ? `${VISION_PROMPT}\n用户刚说：${extraHint}` : VISION_PROMPT;
  const result = await chatCompletionsRetry({
    apiKey,
    baseUrl,
    model,
    thinking: "disabled",
    maxTokens: 240,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: imageDataUrl(jpegBuffer) } },
        ],
      },
    ],
  });
  return String(result.content || "").trim();
}

module.exports = { describeScreenshot, imageDataUrl, jpegDataUrl: imageDataUrl, VISION_PROMPT };
