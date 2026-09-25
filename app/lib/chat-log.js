const fs = require("fs");
const path = require("path");
const { ensureDir } = require("./paths");

function chatLogPath(userData, packId) {
  return path.join(userData, "chats", `${packId}.json`);
}

function loadChat(userData, packId) {
  try {
    const p = chatLogPath(userData, packId);
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      const messages = Array.isArray(raw.messages) ? raw.messages : [];
      return messages.slice(-20);
    }
  } catch (_) {}
  return [];
}

function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (typeof v.text === "string") return v.text;
    if (typeof v.message === "string") return v.message;
  }
  return String(v);
}

function appendChat(userData, packId, role, text) {
  const messages = loadChat(userData, packId);
  messages.push({
    role,
    text: toText(text).slice(0, 2000),
    at: new Date().toISOString(),
  });
  const next = messages.slice(-20);
  ensureDir(path.dirname(chatLogPath(userData, packId)));
  fs.writeFileSync(
    chatLogPath(userData, packId),
    JSON.stringify({ messages: next }, null, 2),
    "utf8"
  );
  return next;
}

module.exports = { loadChat, appendChat };
