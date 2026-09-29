const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const chatLog = require("../app/lib/chat-log");
const memory = require("../app/lib/memory");
const agent = require("../app/lib/agent");

test("clear-memory rejects a switched pack and reports partial disk failure", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-clear-ipc-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const electronEntry = require.resolve("electron", { paths: [path.join(__dirname, "..", "app")] });
  const stateEntry = require.resolve("../app/main/state");
  const ipcEntry = require.resolve("../app/main/ipc");
  const oldElectron = require.cache[electronEntry];
  const oldState = require.cache[stateEntry];
  const oldIpc = require.cache[ipcEntry];
  const oldClearChat = chatLog.clearChat;
  const oldClearMemory = memory.clearMemory;
  const handlers = new Map();
  let selected = { id: "first", name: "小鲸" };
  require.cache[electronEntry] = {
    id: electronEntry, filename: electronEntry, loaded: true,
    exports: { BrowserWindow: function BrowserWindow() {},
      ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} } },
  };
  require.cache[stateEntry] = {
    id: stateEntry, filename: stateEntry, loaded: true,
    exports: { state: { chatWindow: null }, currentPack: () => selected, userData: () => dir },
  };
  delete require.cache[ipcEntry];
  try {
    require("../app/main/ipc").registerIpc();
    memory.saveMemory(dir, "first", { facts: ["当前记忆"], summary: "" });
    chatLog.appendChat(dir, "first", "user", "当前聊天");
    selected = { id: "second", name: "小猫" };
    const beforeSwitch = agent.sessionVersion("second");
    assert.deepEqual(handlers.get("get-current-pack")(), { id: "second", name: "小猫" });
    assert.deepEqual(
      handlers.get("clear-memory")({}, { packId: "first", phrase: "goodbye" }),
      { ok: false, error: "角色已切换，请重新打开清空确认框。" }
    );
    assert.equal(agent.sessionVersion("second"), beforeSwitch);
    assert.equal(memory.loadMemory(dir, "first").facts[0], "当前记忆");
    assert.equal(chatLog.loadChat(dir, "first")[0].text, "当前聊天");

    selected = { id: "first", name: "小鲸" };
    const beforeFailure = agent.sessionVersion("first");
    memory.clearMemory = (...args) => {
      assert.equal(agent.sessionVersion("first"), beforeFailure + 1);
      return oldClearMemory(...args);
    };
    chatLog.clearChat = () => { throw new Error("simulated file lock"); };
    const partial = handlers.get("clear-memory")({}, { packId: "first", phrase: "goodbye" });
    assert.equal(partial.ok, false);
    assert.equal(partial.partial, true);
    assert.equal(partial.memoryCleared, true);
    assert.equal(partial.chatCleared, false);
    assert.match(partial.error, /记忆已清空，但聊天记录未清空/);
    assert.equal(agent.sessionVersion("first"), beforeFailure + 1);
    assert.deepEqual(memory.loadMemory(dir, "first").facts, []);
    assert.equal(chatLog.loadChat(dir, "first")[0].text, "当前聊天");

    chatLog.clearChat = oldClearChat;
    memory.clearMemory = oldClearMemory;
    const memoryFile = path.join(dir, "memory", "first.json");
    fs.writeFileSync(memoryFile, "{broken json");
    const noMemory = handlers.get("clear-memory")({}, { packId: "first", phrase: "goodbye" });
    assert.equal(noMemory.memoryCleared, null);
    assert.equal(noMemory.chatCleared, false);
    assert.equal(chatLog.loadChat(dir, "first")[0].text, "当前聊天");
  } finally {
    chatLog.clearChat = oldClearChat;
    memory.clearMemory = oldClearMemory;
    if (oldElectron) require.cache[electronEntry] = oldElectron;
    else delete require.cache[electronEntry];
    if (oldState) require.cache[stateEntry] = oldState;
    else delete require.cache[stateEntry];
    if (oldIpc) require.cache[ipcEntry] = oldIpc;
    else delete require.cache[ipcEntry];
  }
});
