const fs = require("fs");
const path = require("path");
const { ensureDir } = require("./paths");
const { loadLocalSecrets } = require("./secrets");
const hotkeys = require("./hotkeys");

const defaultSettings = {
  packId: "sample-human",
  alwaysOnTop: true,
  memoryEnabled: false,
  visionEnabled: false,
  deepseekEnabled: false,
  deepseekApiKey: "",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-flash",
  visionModel: "deepseek-flash",
  hidden: false,
  lifeStream: false,
  hideOnFullscreen: true,
  clickThrough: true,
  onboarded: false,
  voiceHotkey: hotkeys.DEFAULTS.voiceHotkey,
  hideHotkey: hotkeys.DEFAULTS.hideHotkey,
};

function settingsPath(userData) {
  return path.join(userData, "settings.json");
}

function loadSettings(userData, { applySecrets = true } = {}) {
  ensureDir(userData);
  let stored = {};
  try {
    const p = settingsPath(userData);
    if (fs.existsSync(p)) stored = JSON.parse(fs.readFileSync(p, "utf8")) || {};
  } catch (_) {}
  const next = { ...defaultSettings, ...stored };
  next.voiceHotkey = hotkeys.normalize(
    next.voiceHotkey == null ? defaultSettings.voiceHotkey : next.voiceHotkey
  );
  next.hideHotkey = hotkeys.normalize(
    next.hideHotkey == null ? defaultSettings.hideHotkey : next.hideHotkey
  );
  if (applySecrets) {
    const secrets = loadLocalSecrets();
    if (!next.deepseekApiKey && secrets.deepseekApiKey) {
      next.deepseekApiKey = secrets.deepseekApiKey;
    }
    if (secrets.deepseekBaseUrl) next.deepseekBaseUrl = secrets.deepseekBaseUrl;
    if (secrets.deepseekModel) next.deepseekModel = secrets.deepseekModel;
    if (secrets.visionModel) next.visionModel = secrets.visionModel;
  }
  return next;
}

function saveSettings(userData, partial) {
  const next = { ...loadSettings(userData, { applySecrets: false }), ...partial };
  next.voiceHotkey = hotkeys.normalize(next.voiceHotkey);
  next.hideHotkey = hotkeys.normalize(next.hideHotkey);
  ensureDir(userData);
  const disk = { ...next };
  // Keep key in userData only; do not write secrets.local.json from here.
  fs.writeFileSync(settingsPath(userData), JSON.stringify(disk, null, 2), "utf8");
  return loadSettings(userData);
}

function publicSettings(settings) {
  const s = { ...settings };
  const key = s.deepseekApiKey || "";
  s.hasDeepseekKey = Boolean(key);
  s.deepseekApiKeyMasked = key
    ? `${key.slice(0, 5)}…${key.slice(-4)}`
    : "";
  delete s.deepseekApiKey;
  return s;
}

module.exports = {
  defaultSettings,
  loadSettings,
  saveSettings,
  publicSettings,
};
