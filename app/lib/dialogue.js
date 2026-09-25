/**
 * Local dialogue engine for character packs (no network).
 * pack.dialogue: { onAction, rules, fallback, fallbackAction }
 */

function pick(list) {
  if (!Array.isArray(list) || !list.length) return "";
  return list[Math.floor(Math.random() * list.length)];
}

function lineForAction(pack, actionKey) {
  const lines = pack?.dialogue?.onAction?.[actionKey];
  return pick(lines) || "";
}

function greeting(pack) {
  return pack?.persona?.greeting || lineForAction(pack, "meow") || "嗨。";
}

function inferWalkMove(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  const walkish =
    /走|走路|散步|溜达|挪一?下|移一?下|过来|过去|走开/.test(raw) ||
    /\b(walk|come here|go away)\b/i.test(lower);
  if (!walkish) return null;
  const left = /左|←|\bleft\b/.test(lower);
  const right = /右|→|\bright\b/.test(lower);
  const up = /向上|往上|上边|\bup\b/.test(lower);
  const down = /向下|往下|下边|\bdown\b/.test(lower);
  if (left && !right) return { direction: "left", distance: 220 };
  if (right && !left) return { direction: "right", distance: 220 };
  if (up && !down) return { direction: "up", distance: 160 };
  if (down && !up) return { direction: "down", distance: 160 };
  return { direction: "current", distance: 220 };
}

function walkAction(pack) {
  if (pack?.states?.walk) return "walk";
  if (pack?.states?.run) return "run";
  return null;
}

/**
 * @returns {{ text: string, action: string|null, matched: boolean, move?: {direction: string, distance: number}|null }}
 */
function reply(pack, userText) {
  const text = String(userText || "").trim();
  const d = pack?.dialogue || {};
  if (!text) {
    return { text: greeting(pack), action: "meow", matched: true, move: null };
  }
  const move = inferWalkMove(text);
  const lower = text.toLowerCase();
  for (const rule of d.rules || []) {
    const kws = Array.isArray(rule.keywords) ? rule.keywords : [];
    const hit = kws.some((k) => {
      const key = String(k);
      return key === key.toLowerCase()
        ? lower.includes(key)
        : text.includes(key);
    });
    if (hit) {
      const action = move ? walkAction(pack) || rule.action || null : rule.action || null;
      return {
        text: pick(rule.lines) || greeting(pack),
        action,
        matched: true,
        move: move || null,
      };
    }
  }
  if (move) {
    const action = walkAction(pack);
    return {
      text: pick(d.onAction?.[action]) || pick(d.fallback) || "好。",
      action,
      matched: true,
      move,
    };
  }
  return {
    text: pick(d.fallback) || "嗯…",
    action: d.fallbackAction || null,
    matched: false,
    move: null,
  };
}

function chatterLine(pack) {
  const pool = [];
  const onAction = pack?.dialogue?.onAction || {};
  for (const lines of Object.values(onAction)) {
    if (Array.isArray(lines)) pool.push(...lines);
  }
  if (Array.isArray(pack?.dialogue?.fallback)) pool.push(...pack.dialogue.fallback);
  if (pack?.persona?.greeting) pool.push(pack.persona.greeting);
  return pick(pool) || "嗯。";
}

module.exports = { pick, lineForAction, greeting, reply, inferWalkMove, chatterLine };
