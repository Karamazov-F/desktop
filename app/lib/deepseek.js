const DEFAULT_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";

function normalizeBase(url) {
  return String(url || DEFAULT_BASE).replace(/\/+$/, "");
}

function extractMessage(data) {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return { content: "", tool_calls: [] };
  let content = msg.content;
  if (Array.isArray(content)) {
    content = content
      .map((p) => (typeof p === "string" ? p : p?.text || ""))
      .join("");
  }
  return {
    content: content || "",
    tool_calls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
    reasoning: msg.reasoning_content || "",
  };
}

/**
 * OpenAI-compatible Chat Completions against DeepSeek (or a compatible proxy).
 */
async function chatCompletions({
  apiKey,
  baseUrl = DEFAULT_BASE,
  model = DEFAULT_MODEL,
  messages,
  tools,
  temperature = 0.7,
  maxTokens = 512,
  thinking = "disabled",
  timeoutMs = 45000,
}) {
  if (!apiKey) throw new Error("missing api key");
  const url = `${normalizeBase(baseUrl)}/chat/completions`;
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  if (thinking) {
    body.thinking = { type: thinking };
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(t);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`DeepSeek 非 JSON 响应 (${res.status})`);
  }
  if (!res.ok) {
    const err = data?.error?.message || text.slice(0, 400);
    const e = new Error(`DeepSeek ${res.status}: ${err}`);
    e.status = res.status;
    e.body = data;
    throw e;
  }
  const parsed = extractMessage(data);
  return { ...parsed, raw: data };
}

async function chatCompletionsRetry(opts) {
  try {
    return await chatCompletions(opts);
  } catch (err) {
    const msg = String(err.message || err);
    if (/thinking/i.test(msg) || err.status === 400) {
      const { thinking, ...rest } = opts;
      if (thinking) return chatCompletions(rest);
    }
    throw err;
  }
}

module.exports = {
  DEFAULT_BASE,
  DEFAULT_MODEL,
  chatCompletions,
  chatCompletionsRetry,
  extractMessage,
};
