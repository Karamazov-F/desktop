#!/usr/bin/env node
const path = require("path");
const deps = require("../app/lib/deps");
const paths = require("../app/lib/paths");
const { loadSettings } = require("../app/lib/settings");

async function main() {
  const userData = process.env.PET_USER_DATA || paths.userDataDir();
  paths.ensureDir(userData);
  const ctx = {
    depsRoot: paths.ensureDir(paths.depsRoot(userData)),
    settings: loadSettings(userData),
    onProgress: (p) => {
      process.stdout.write(`\r${p.message || ""} ${p.pct != null ? p.pct + "%" : ""}    `);
    },
  };
  let rows = deps.scan(ctx);
  console.log("\n" + JSON.stringify(rows, null, 2));
  const missing = rows.filter((r) => r.required && !r.ok && r.canInstall).map((r) => r.id);
  if (!missing.length) {
    console.log("required deps ok");
    return;
  }
  console.log("installing", missing.join(", "));
  await deps.installIds(ctx, missing);
  rows = deps.scan(ctx);
  console.log(JSON.stringify(rows, null, 2));
  const still = deps.missingRequired(rows);
  if (still.length) {
    console.error("still missing", still.map((s) => s.id));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
