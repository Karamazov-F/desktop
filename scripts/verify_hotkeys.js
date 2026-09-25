#!/usr/bin/env node
const assert = require("assert");
const hk = require("../app/lib/hotkeys");

assert.strictEqual(hk.normalize("ctrl+shift+space"), "CommandOrControl+Shift+Space");
assert.strictEqual(hk.normalize("Ctrl + Shift + H"), "CommandOrControl+Shift+H");
assert.strictEqual(hk.normalize(""), "");
assert.strictEqual(hk.formatDisplay("CommandOrControl+Shift+Space"), "Ctrl + Shift + 空格");
assert.strictEqual(
  hk.fromKeyboardEvent({
    code: "Space",
    key: " ",
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
  }),
  "CommandOrControl+Shift+Space"
);
assert.strictEqual(
  hk.fromKeyboardEvent({
    code: "KeyH",
    key: "h",
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
  }),
  "CommandOrControl+Shift+H"
);
assert.strictEqual(
  hk.fromKeyboardEvent({ code: "KeyA", key: "a", ctrlKey: false, shiftKey: false }),
  ""
);
assert.strictEqual(hk.normalize("shift+~"), "Shift+~");
assert.strictEqual(hk.formatDisplay("Shift+~"), "Shift + ~");
assert.deepStrictEqual(hk.acceleratorsToTry("shift+~")[0], "Shift+~");
assert.ok(hk.acceleratorsToTry("Shift+~").includes("Shift+`"));
assert.strictEqual(
  hk.fromKeyboardEvent({
    code: "Backquote",
    key: "~",
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    metaKey: false,
  }),
  "Shift+~"
);
assert.strictEqual(
  hk.fromKeyboardEvent({
    code: "Backquote",
    key: "`",
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    metaKey: false,
  }),
  "Shift+~"
);
assert.strictEqual(
  hk.fromKeyboardEvent({
    code: "Digit1",
    key: "!",
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    metaKey: false,
  }),
  "Shift+!"
);
assert.strictEqual(
  hk.fromKeyboardEvent({
    code: "KeyQ",
    key: "q",
    ctrlKey: false,
    shiftKey: false,
    altKey: true,
    metaKey: false,
  }),
  "Alt+Q"
);
assert.strictEqual(
  hk.fromKeyboardEvent({ code: "F9", key: "F9", ctrlKey: false, shiftKey: false }),
  "F9"
);

const settings = require("../app/lib/settings");
assert.strictEqual(settings.defaultSettings.voiceHotkey, hk.DEFAULTS.voiceHotkey);
assert.strictEqual(settings.defaultSettings.hideHotkey, hk.DEFAULTS.hideHotkey);

console.log(
  JSON.stringify({
    ok: true,
    voice: hk.formatDisplay(hk.DEFAULTS.voiceHotkey),
    hide: hk.formatDisplay(hk.DEFAULTS.hideHotkey),
  })
);
