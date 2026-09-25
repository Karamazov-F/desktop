#!/usr/bin/env node
const path = require("path");
const assert = require("assert");
const os = require("os");
const fs = require("fs");
const { encryptDir, decryptToDir, parseArchive } = require("../app/lib/dpet");
const { readPack } = require("../app/lib/packs");

const src = path.join(__dirname, "..", "packs", "blob");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dpet-"));
const dpet = path.join(tmp, "blob.dpet");
const out = path.join(tmp, "out");

encryptDir(src, dpet);
assert.ok(fs.statSync(dpet).size > 32, "dpet size");
const parsed = parseArchive(fs.readFileSync(dpet));
assert.strictEqual(parsed.header.id, "blob");
assert.ok(parsed.files.some((f) => f.rel === "pack.json"));
decryptToDir(dpet, out);
const pack = readPack(path.dirname(out), path.basename(out));
assert.ok(pack, "decrypted pack readable");
assert.ok(pack.states.idle, "idle");
console.log(
  JSON.stringify(
    {
      ok: true,
      bytes: fs.statSync(dpet).size,
      files: parsed.files.length,
      states: Object.keys(pack.states),
    },
    null,
    2
  )
);
