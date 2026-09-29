/* Node 18 does not expand test globs itself. List the files and hand them
   to the runner so `npm test` matches engines: >=18. */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => path.join(dir, name));

if (!files.length) {
  console.error("no test files");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status == null ? 1 : result.status);
