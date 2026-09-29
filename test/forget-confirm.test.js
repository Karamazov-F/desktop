const assert = require("assert");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const vm = require("vm");

function element() {
  const listeners = new Map();
  return {
    value: "", disabled: false, hidden: true, dataset: {}, textContent: "",
    classList: { contains: () => false, add() {}, remove() {} },
    focus() {}, blur() {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) {
      const listener = listeners.get(type);
      assert.ok(listener, `missing ${type} listener`);
      return listener({ preventDefault() {}, stopPropagation() {} });
    },
  };
}

test("forget dialog requires goodbye, clears once, and cancel leaves data alone", async () => {
  const root = path.join(__dirname, "..", "app", "renderer");
  const html = fs.readFileSync(path.join(root, "settings.html"), "utf8");
  assert.match(html, /id="forget-confirm" disabled/);
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const calls = [];
  let currentPack = { id: "first", name: "小鲸" };
  let deletions = 0;
  let nextResult = null;
  const window = {
    PetHotkeys: { normalize: (value) => value || "", formatDisplay: (value) => value },
    PetUserErrors: { keyHintText: () => "", displaySaveError: String },
    petApi: {
      getSettings: async () => ({}),
      getCurrentPack: async () => currentPack,
      onSettingsChanged() {},
      clearMemory: async (packId, phrase) => {
        calls.push([packId, phrase]);
        if (packId !== currentPack.id) return { ok: false, error: "角色已切换，请重新打开清空确认框。" };
        if (nextResult) return nextResult;
        deletions += 1;
        return { ok: true };
      },
    },
  };
  const document = { getElementById: get, activeElement: null };
  vm.runInNewContext(fs.readFileSync(path.join(root, "settings.js"), "utf8"), { window, document });
  await Promise.resolve();

  await get("clearMem").dispatch("click");
  assert.equal(get("forget-modal").hidden, false);
  assert.match(get("forget-pack").textContent, /小鲸.*first/);
  assert.equal(get("forget-confirm").disabled, true);
  get("forget-phrase").value = "bye";
  get("forget-phrase").dispatch("input");
  assert.equal(get("forget-confirm").disabled, true);
  await get("forget-card").dispatch("submit");
  assert.deepEqual(calls, []);

  get("forget-phrase").value = "goodbye";
  get("forget-phrase").dispatch("input");
  assert.equal(get("forget-confirm").disabled, false);
  const first = get("forget-card").dispatch("submit");
  const duplicate = get("forget-card").dispatch("submit");
  await Promise.all([first, duplicate]);
  assert.deepEqual(calls, [["first", "goodbye"]]);
  assert.equal(deletions, 1);
  assert.equal(get("forget-modal").hidden, true);

  await get("clearMem").dispatch("click");
  get("forget-phrase").value = "goodbye";
  get("forget-phrase").dispatch("input");
  get("forget-cancel").dispatch("click");
  assert.equal(get("forget-modal").hidden, true);
  assert.equal(get("forget-confirm").disabled, true);
  await get("forget-card").dispatch("submit");
  assert.deepEqual(calls, [["first", "goodbye"]]);
  assert.equal(deletions, 1);

  await get("clearMem").dispatch("click");
  currentPack = { id: "second", name: "小猫" };
  get("forget-phrase").value = "goodbye";
  get("forget-phrase").dispatch("input");
  await get("forget-card").dispatch("submit");
  assert.deepEqual(calls.at(-1), ["first", "goodbye"]);
  assert.equal(deletions, 1);
  assert.match(get("status").textContent, /角色已切换/);
  assert.match(get("forget-status").textContent, /角色已切换/);
  assert.equal(get("forget-modal").hidden, false);

  get("forget-cancel").dispatch("click");
  await get("clearMem").dispatch("click");
  assert.match(get("forget-pack").textContent, /小猫.*second/);
  nextResult = { ok: false, partial: true, memoryCleared: true, chatCleared: false,
    error: "当前角色的记忆已清空，但聊天记录未清空。" };
  get("forget-phrase").value = "goodbye";
  get("forget-phrase").dispatch("input");
  await get("forget-card").dispatch("submit");
  assert.equal(deletions, 1);
  assert.match(get("status").textContent, /聊天记录未清空/);
  assert.match(get("forget-status").textContent, /聊天记录未清空/);
  assert.equal(get("forget-modal").hidden, false);
});
