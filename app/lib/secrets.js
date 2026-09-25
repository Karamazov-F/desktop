const fs = require("fs");
const path = require("path");
const { repoRoot } = require("./paths");

/**
 * Local-only secrets. Never commit secrets.local.json.
 * Overlay order: env > secrets.local.json
 */
function loadLocalSecrets(root) {
  const base = root || repoRoot();
  const out = {};
  const file = path.join(base, "secrets.local.json");
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw && typeof raw === "object") Object.assign(out, raw);
    }
  } catch (_) {}
  if (process.env.DEEPSEEK_API_KEY) out.deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  if (process.env.DEEPSEEK_BASE_URL) out.deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL;
  return out;
}

module.exports = { loadLocalSecrets };
