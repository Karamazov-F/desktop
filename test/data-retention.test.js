const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const chatLog = require("../app/lib/chat-log");
const memory = require("../app/lib/memory");

test("appending a chat keeps older rows and long text", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-chat-retain-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const chats = path.join(dir, "chats");
  fs.mkdirSync(chats);
  const old = Array.from({ length: 120 }, (_, i) => ({ role: "user", text: `old-${i}`, at: "old" }));
  old[0].text = "旧".repeat(4500);
  fs.writeFileSync(path.join(chats, "first.json"), JSON.stringify({ messages: old }));
  const longText = "长".repeat(4500);
  chatLog.appendChat(dir, "first", "bot", longText);
  const after = JSON.parse(fs.readFileSync(path.join(chats, "first.json"), "utf8")).messages;
  assert.equal(after.length, 121);
  assert.equal(after[0].text, old[0].text);
  assert.equal(after.at(-1).text, longText.slice(0, 4000));
  chatLog.appendChat(dir, "second", "bot", "别的角色");
  chatLog.clearChat(dir, "first");
  assert.equal(fs.existsSync(path.join(chats, "first.json")), false);
  assert.equal(chatLog.loadChat(dir, "second").length, 1);
});

test("memory writes keep older facts, rounds, summary, and unknown fields", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-memory-retain-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const folder = path.join(dir, "memory");
  fs.mkdirSync(folder);
  const prior = {
    facts: Array.from({ length: 95 }, (_, i) => `fact-${i}`),
    rounds: [{ user: "旧话", pet: "旧回复", at: "old" }],
    summary: "摘要".repeat(700),
    futureField: { keep: true },
  };
  fs.writeFileSync(path.join(folder, "first.json"), JSON.stringify(prior));
  memory.rememberFact(dir, "first", "new fact");
  const after = JSON.parse(fs.readFileSync(path.join(folder, "first.json"), "utf8"));
  assert.equal(after.facts.length, 96);
  assert.deepEqual(after.rounds, prior.rounds);
  assert.equal(after.summary, prior.summary);
  assert.deepEqual(after.futureField, prior.futureField);
  memory.saveMemory(dir, "second", { facts: ["other"], summary: "" });
  memory.clearMemory(dir, "first");
  assert.equal(memory.loadMemory(dir, "second").facts[0], "other");
});

test("malformed existing chat and memory files are never overwritten by ordinary writes", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-corrupt-retain-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "chats"));
  fs.mkdirSync(path.join(dir, "memory"));
  const bad = "{broken json";
  const chatFile = path.join(dir, "chats", "first.json");
  const memoryFile = path.join(dir, "memory", "first.json");
  fs.writeFileSync(chatFile, bad);
  fs.writeFileSync(memoryFile, bad);
  assert.throws(() => chatLog.appendChat(dir, "first", "user", "hello"), SyntaxError);
  assert.throws(() => memory.rememberFact(dir, "first", "hello"), SyntaxError);
  assert.throws(() => memory.clearMemory(dir, "first"), SyntaxError);
  assert.equal(fs.readFileSync(chatFile, "utf8"), bad);
  assert.equal(fs.readFileSync(memoryFile, "utf8"), bad);
  fs.writeFileSync(chatFile, JSON.stringify({ messages: "not an array" }));
  fs.writeFileSync(memoryFile, JSON.stringify({ facts: "not an array" }));
  assert.throws(() => chatLog.appendChat(dir, "first", "user", "hello"), /格式无效/);
  assert.throws(() => memory.rememberFact(dir, "first", "hello"), /格式无效/);
  assert.equal(JSON.parse(fs.readFileSync(chatFile, "utf8")).messages, "not an array");
  assert.equal(JSON.parse(fs.readFileSync(memoryFile, "utf8")).facts, "not an array");
});
