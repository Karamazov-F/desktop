const fs = require("fs");
const path = require("path");

const packsDir = path.join(__dirname, "..", "packs");
let failed = 0;

function frameList(value) {
  if (typeof value === "string") return [value];
  if (value && Array.isArray(value.frames)) return value.frames;
  if (value && value.file) return [value.file];
  return [];
}

for (const name of fs.readdirSync(packsDir)) {
  const dir = path.join(packsDir, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const man = path.join(dir, "pack.json");
  if (!fs.existsSync(man)) {
    console.error("MISSING pack.json:", name);
    failed++;
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(man, "utf8"));
  if (!raw.states?.idle) {
    console.error("MISSING states.idle:", name);
    failed++;
    continue;
  }
  for (const [k, val] of Object.entries(raw.states)) {
    const frames = frameList(val);
    if (!frames.length) {
      console.error("EMPTY frames:", name, k);
      failed++;
      continue;
    }
    for (const rel of frames) {
      const p = path.join(dir, rel);
      if (!fs.existsSync(p)) {
        console.error("MISSING file:", name, k, rel);
        failed++;
      }
    }
  }
  console.log("OK", raw.id || name, raw.name, "states=", Object.keys(raw.states).join(","));
}

if (failed) {
  console.error("FAILED", failed);
  process.exit(1);
}
console.log("all packs ok");
