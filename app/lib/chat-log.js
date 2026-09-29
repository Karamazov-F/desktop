const fs = require("fs");
const path = require("path");
const { ensureDir } = require("./paths");

function chatLogPath(userData, packId) {
  return path.join(userData, "chats", `${packId}.json`);
}

function loadChat(userData, packId) {
  const p = chatLogPath(userData, packId);
  if (!fs.existsSync(p)) return [];
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!raw || !Array.isArray(raw.messages)) throw new Error("聊天记录格式无效");
  return raw.messages;
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
    text: toText(text).slice(0, 4000),
    at: new Date().toISOString(),
  });
  ensureDir(path.dirname(chatLogPath(userData, packId)));
  fs.writeFileSync(
    chatLogPath(userData, packId),
    JSON.stringify({ messages }, null, 2),
    "utf8"
  );
  return messages;
}

function clearChat(userData, packId) {
  fs.rmSync(chatLogPath(userData, packId), { force: true });
}

module.exports = { loadChat, appendChat, clearChat };
