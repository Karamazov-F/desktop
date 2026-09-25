#!/usr/bin/env node
const path = require("path");
const os = require("os");
const fs = require("fs");
const assert = require("assert");
const memory = require("../app/lib/memory");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pet-mem-"));
memory.rememberFact(dir, "sample-human", "用户喜欢咖啡");
memory.rememberFact(dir, "sample-human", "用户喜欢咖啡");
let mem = memory.loadMemory(dir, "sample-human");
assert.strictEqual(mem.facts.length, 1);
memory.rememberFact(dir, "sample-human", "名字叫小陈");
mem = memory.forgetFacts(dir, "sample-human", "咖啡");
assert.ok(!mem.facts.some((f) => f.includes("咖啡")));
assert.ok(mem.facts.some((f) => f.includes("小陈")));
memory.clearMemory(dir, "sample-human");
mem = memory.loadMemory(dir, "sample-human");
assert.strictEqual(mem.facts.length, 0);
console.log(JSON.stringify({ ok: true, dir }, null, 2));
