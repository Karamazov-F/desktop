const DEFAULT_BASE = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";
const MAX_RESPONSE_BYTES = 1024 * 1024;

function bodyTooLarge() {
  const err = new Error("response body exceeded limit");
  err.code = "EMAXBODY";
  return err;
}

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
  signal,
}) {
  if (!apiKey) throw new Error("missing api key");
  if (signal?.aborted) {
    const err = new Error("思考时间过长");
    err.name = "AbortError";
    throw err;
  }
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
  const onAbort = () => ac.abort();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", onAbort);
  }
  let res;
  let text;
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
    text = await readAbortableText(res, ac.signal);
  } finally {
    clearTimeout(t);
    if (signal) signal.removeEventListener("abort", onAbort);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const e = new Error(`DeepSeek 非 JSON 响应 (${res.status})`);
    e.status = res.status;
    throw e;
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

function abortError() {
  const err = new Error("思考时间过长");
  err.name = "AbortError";
  return err;
}

async function readAbortableText(res, signal) {
  if (signal?.aborted) throw abortError();
  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    if (signal?.aborted) throw abortError();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw bodyTooLarge();
    return text;
  }
  const reader = res.body.getReader();
  const onAbort = () => {
    reader.cancel(abortError()).catch(() => {});
  };
  if (signal) signal.addEventListener("abort", onAbort);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortError();
      if (done) break;
      const buf = Buffer.from(value);
      total += buf.length;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw bodyTooLarge();
      }
      chunks.push(buf);
    }
  } catch (err) {
    if (err && err.code === "EMAXBODY") throw err;
    if (signal?.aborted || err?.name === "AbortError") throw abortError();
    throw err;
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function chatCompletionsRetry(opts) {
  try {
    return await chatCompletions(opts);
  } catch (err) {
    if (opts?.signal?.aborted || err?.name === "AbortError") throw err;
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
  readAbortableText,
  MAX_RESPONSE_BYTES,
};
