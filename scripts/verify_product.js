#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const scripts = [
  "check-packs.js",
  "verify_dialogue.js",
  "verify_dpet.js",
  "verify_memory.js",
  "verify_tools.js",
  "verify_behavior.js",
  "verify_pointer.js",
  "verify_packer_roundtrip.js",
];

let failed = 0;
for (const s of scripts) {
  console.log("\n===", s, "===");
  const r = spawnSync(process.execPath, [path.join(root, "scripts", s)], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) {
    failed += 1;
    console.error("FAIL", s, r.status);
  }
}

console.log("\n=== verify_live_deepseek.js ===");
const live = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "verify_live_deepseek.js")],
  { cwd: root, encoding: "utf8", stdio: "inherit" }
);
if (live.status !== 0) {
  failed += 1;
  console.error("FAIL live", live.status);
}

for (const extra of ["verify_live_agent.js", "verify_live_vision.js"]) {
  console.log("\n===", extra, "===");
  const r = spawnSync(process.execPath, [path.join(root, "scripts", extra)], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (r.status !== 0) {
    failed += 1;
    console.error("FAIL", extra, r.status);
  }
}

if (failed) {
  console.error("FAILED suites", failed);
  process.exit(1);
}
console.log("all product checks ok");
