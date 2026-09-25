#!/usr/bin/env node
const path = require("path");
const assert = require("assert");
const { readPack } = require("../app/lib/packs");
const {
  validatePlayAction,
  validateMove,
  toolDefs,
  allowedToolNames,
} = require("../app/lib/tools");

const pack = readPack(path.join(__dirname, "..", "packs"), "sample-human");
assert.ok(validatePlayAction(pack, "happy").ok);
assert.ok(!validatePlayAction(pack, "explode").ok);
assert.ok(validateMove({ direction: "left", distance: 9999 }).distance === 900);
assert.ok(!validateMove({ direction: "forward" }).ok);

const tools = toolDefs({
  memoryEnabled: true,
  visionEnabled: true,
  actions: Object.keys(pack.states),
});
const names = tools.map((t) => t.function.name);
assert.ok(names.includes("play_action"));
assert.ok(names.includes("glance_screen"));
assert.ok(names.includes("remember"));
assert.ok(allowedToolNames({ memoryEnabled: false, visionEnabled: false }).size === 2);
console.log(JSON.stringify({ ok: true, tools: names }, null, 2));
