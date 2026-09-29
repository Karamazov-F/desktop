const dialogue = require("./dialogue");
const { userFacingError, annotateReply } = require("./user-errors");
const memory = require("./memory");
const { chatCompletionsRetry } = require("./deepseek");
const { describeScreenshot } = require("./vision");
const {
  availableActions,
  toolDefs,
  parseToolArgs,
  normalizeToolName,
  allowedToolNames,
  validatePlayAction,
  validateMove,
} = require("./tools");

const sessions = new Map();
const sessionVersions = new Map();
const MAX_ROUNDS = 5;
const MAX_TURN_MS = 60000;

function sessionKey(packId) {
  return String(packId || "default");
}

function getHistory(packId) {
  const k = sessionKey(packId);
  if (!sessions.has(k)) sessions.set(k, []);
  return sessions.get(k);
}

function pushHistory(packId, role, content) {
  const h = getHistory(packId);
  h.push({ role, content: String(content || "").slice(0, 2000) });
  while (h.length > 16) h.shift();
}

function buildSystemPrompt(pack, settings, mem) {
  const name = pack.persona?.displayName || pack.name || "桌宠";
  const actions = availableActions(pack)
    .map((k) => {
      const label = pack.states[k]?.label || k;
      return `${k}（${label}）`;
    })
    .join("、");
  const parts = [
    pack.persona?.systemPrompt ||
      `你是桌宠「${name}」，住在用户电脑桌面。用简体中文，每次回复尽量不超过 40 字。不要输出舞台说明。不要扮演其他知名 IP。`,
    `当前可用动画：${actions}。情绪变化时调用 play_action。用户说左走、右走、走开、过来时必须调用 move_pet（边播行走动画边平移窗口），不要只 play_action walk。`,
    "不要声称自己能执行未提供的工具。不要输出 JSON 给用户看。",
  ];
  if (settings.memoryEnabled) {
    parts.push("长期记忆已开启：重要、稳定的用户事实用 remember；用户要求忘掉时用 forget。");
    const block = memory.memoryPromptBlock(mem);
    if (block) parts.push(block);
  } else {
    parts.push("长期记忆关闭，不要调用 remember/forget。");
  }
  if (settings.visionEnabled) {
    parts.push(
      "允许查看屏幕已开启：用户问屏幕上是什么、在忙什么时，先 glance_screen 再回答。描述保持笼统。"
    );
  } else {
    parts.push("查看屏幕已关闭。若用户要你看屏幕，说明需要先在设置里打开「允许查看屏幕」。");
  }
  return parts.join("\n");
}

function localFallback(pack, userText) {
  return dialogue.reply(pack, userText);
}

function clearSessions() {
  sessions.clear();
}

function clearSession(packId) {
  const key = sessionKey(packId);
  sessions.delete(key);
  sessionVersions.set(key, sessionVersion(packId) + 1);
}

function sessionVersion(packId) {
  return sessionVersions.get(sessionKey(packId)) || 0;
}

function isSessionCurrent(packId, version) {
  return sessionVersion(packId) === version;
}

function visionIsOn(settings, allowVision = true) {
  return Boolean(settings?.visionEnabled && allowVision);
}

async function runAgentTurn({
  pack,
  settings,
  userText,
  userData,
  captureScreen,
  applyPlay,
  applyMove,
  allowVision = true,
  notifyCapture,
  signal,
}) {
  const version = sessionVersion(pack.id);
  const displayName = pack.persona?.displayName || pack.name || "桌宠";
  const local = localFallback(pack, userText);

  if (!settings.deepseekEnabled || !settings.deepseekApiKey) {
    if (local.action || local.move) applyPlay?.(local.action, local.text, local.move || null);
    else if (local.text) applyPlay?.(null, local.text);
    const reply = {
      text: local.text,
      action: local.action,
      matched: local.matched,
      move: local.move || null,
      source: "local",
      displayName,
    };
    if (settings.deepseekEnabled && !settings.deepseekApiKey) {
      reply.reason = settings.deepseekApiKeyEnc ? "unreadable-key" : "missing-key";
    }
    return annotateReply(reply);
  }

  const visionOn = visionIsOn(settings, allowVision);
  const effective = { ...settings, visionEnabled: visionOn };
  const mem = settings.memoryEnabled
    ? memory.loadMemory(userData, pack.id)
    : memory.emptyMemory();
  const actions = availableActions(pack);
  const tools = toolDefs({
    memoryEnabled: settings.memoryEnabled,
    visionEnabled: visionOn,
    actions,
  });
  const allowed = allowedToolNames(effective);
  const turn = new AbortController();
  const ensureActive = () => {
    if (turn.signal.aborted || !isSessionCurrent(pack.id, version)) {
      const err = new Error("agent turn cancelled");
      err.name = "AbortError";
      throw err;
    }
  };
  const onParentAbort = () => turn.abort();
  if (signal) {
    if (signal.aborted) turn.abort();
    else signal.addEventListener("abort", onParentAbort);
  }
  const kill = setTimeout(() => turn.abort(), MAX_TURN_MS);
  const started = Date.now();
  const messages = [
    { role: "system", content: buildSystemPrompt(pack, effective, mem) },
    ...getHistory(pack.id),
    { role: "user", content: String(userText || "").slice(0, 2000) },
  ];

  let lastAction = null;
  let lastText = "";
  let usedVision = false;
  let source = "deepseek";
  let didMove = false;
  let pendingMove = null;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      ensureActive();
      if (Date.now() - started > MAX_TURN_MS) {
        throw new Error("思考时间过长");
      }
      const result = await chatCompletionsRetry({
        apiKey: settings.deepseekApiKey,
        baseUrl: settings.deepseekBaseUrl,
        model: settings.deepseekModel || "deepseek-flash",
        messages,
        tools,
        temperature: 0.8,
        maxTokens: 400,
        thinking: "disabled",
        signal: turn.signal,
      });
      ensureActive();

      if (result.tool_calls && result.tool_calls.length) {
        messages.push({
          role: "assistant",
          content: result.content || "",
          tool_calls: result.tool_calls,
        });
        for (const call of result.tool_calls) {
          ensureActive();
          const name = normalizeToolName(call.function?.name || call.name);
          const args = parseToolArgs(call.function?.arguments || call.arguments);
          const id = call.id || `call_${round}_${name}`;
          let toolResult = "ok";
          if (!allowed.has(name)) {
            toolResult = `tool not allowed: ${name}`;
          } else if (name === "play_action") {
            const v = validatePlayAction(pack, args.action);
            if (v.ok) {
              lastAction = v.action;
              toolResult = `played ${v.action}`;
            } else toolResult = v.error;
          } else if (name === "move_pet") {
            const v = validateMove(args);
            if (v.ok) {
              applyMove?.(v.direction, v.distance);
              didMove = true;
              pendingMove = { direction: v.direction, distance: v.distance };
              if (lastAction === "walk" || lastAction === "run") lastAction = null;
              toolResult = `moved ${v.direction} ${v.distance}`;
            } else toolResult = v.error;
          } else if (name === "remember") {
            memory.rememberFact(userData, pack.id, args.fact);
            toolResult = "remembered";
          } else if (name === "forget") {
            memory.forgetFacts(userData, pack.id, args.query);
            toolResult = "forgotten";
          } else if (name === "glance_screen") {
            if (!visionOn || typeof captureScreen !== "function") {
              toolResult = "查看屏幕未开启";
            } else {
              if (notifyCapture) await notifyCapture(true);
              try {
                ensureActive();
                const jpeg = await captureScreen();
                ensureActive();
                const desc = await describeScreenshot({
                  apiKey: settings.deepseekApiKey,
                  baseUrl: settings.deepseekBaseUrl,
                  model: settings.visionModel || settings.deepseekModel || "deepseek-flash",
                  jpegBuffer: jpeg,
                  extraHint: userText,
                  signal: turn.signal,
                });
                ensureActive();
                usedVision = true;
                toolResult = desc || "看不太清";
              } finally {
                if (notifyCapture) await notifyCapture(false);
              }
            }
          }
          messages.push({
            role: "tool",
            tool_call_id: id,
            content: String(toolResult).slice(0, 1500),
          });
        }
        continue;
      }

      lastText = String(result.content || "").trim();
      break;
    }
    ensureActive();
  } catch (err) {
    if (!isSessionCurrent(pack.id, version)) return { text: "", stale: true };
    console.warn("agent turn failed", err && err.stack ? err.stack : err);
    source = "local-fallback";
    lastText = local.text;
    lastAction = local.action;
    if (local.action || local.move) applyPlay?.(local.action, local.text, local.move || null);
    else applyPlay?.(null, local.text);
    return annotateReply({
      text: lastText,
      action: lastAction,
      matched: local.matched,
      move: local.move || null,
      source,
      error: userFacingError(err),
      displayName,
    });
  } finally {
    clearTimeout(kill);
    if (signal) signal.removeEventListener("abort", onParentAbort);
  }

  if (!isSessionCurrent(pack.id, version)) return { text: "", stale: true };
  if (!lastText) lastText = local.text || "嗯。";
  if (didMove) {
    applyPlay?.(null, lastText);
  } else if (local.move) {
    applyPlay?.(local.action || lastAction || "walk", lastText, local.move);
  } else if (!lastAction && local.matched && local.action && /你好|嗨|困|累|开心/.test(userText)) {
    lastAction = local.action;
    applyPlay?.(lastAction, lastText);
  } else {
    applyPlay?.(lastAction, lastText);
  }

  pushHistory(pack.id, "user", userText);
  pushHistory(pack.id, "assistant", lastText);

  if (settings.memoryEnabled) {
    const m = memory.loadMemory(userData, pack.id);
    const snippet = `用户：${String(userText).slice(0, 80)} / 宠：${lastText.slice(0, 80)}`;
    m.summary = `${m.summary ? m.summary + "；" : ""}${snippet}`.slice(-800);
    memory.saveMemory(userData, pack.id, m);
  }

  return annotateReply({
    text: lastText,
    action: lastAction || (didMove || local.move ? local.action || "walk" : null),
    matched: true,
    move: pendingMove || local.move || null,
    source,
    usedVision,
    displayName,
  });
}

module.exports = {
  runAgentTurn,
  getHistory,
  pushHistory,
  clearSessions,
  clearSession,
  sessionVersion,
  isSessionCurrent,
  buildSystemPrompt,
  MAX_ROUNDS,
  MAX_TURN_MS,
  visionIsOn,
};
