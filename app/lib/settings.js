const fs = require("fs");
const path = require("path");
const { ensureDir } = require("./paths");
const hotkeys = require("./hotkeys");
const { isSafePackId } = require("./safe-path");

const DEFAULT_BASE = "https://api.deepseek.com";
const ALLOWED_API_HOSTS = new Set(["api.deepseek.com"]);
const MODEL_RE = /^[A-Za-z0-9._-]{1,64}$/;

const defaultSettings = {
  packId: "xiao-jing",
  alwaysOnTop: true,
  memoryEnabled: false,
  visionEnabled: false,
  deepseekEnabled: false,
  deepseekApiKey: "",
  deepseekBaseUrl: DEFAULT_BASE,
  deepseekModel: "deepseek-flash",
  visionModel: "deepseek-flash",
  hidden: false,
  lifeStream: false,
  hideOnFullscreen: true,
  clickThrough: true,
  onboarded: false,
  privacyAccepted: false,
  voiceHotkey: hotkeys.DEFAULTS.voiceHotkey,
  hideHotkey: hotkeys.DEFAULTS.hideHotkey,
};

const BOOL_KEYS = [
  "alwaysOnTop",
  "memoryEnabled",
  "visionEnabled",
  "deepseekEnabled",
  "hidden",
  "lifeStream",
  "hideOnFullscreen",
  "clickThrough",
  "onboarded",
  "privacyAccepted",
];

function settingsPath(userData) {
  return path.join(userData, "settings.json");
}

function canonicalizeDeepseekUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return DEFAULT_BASE;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("接口地址无效");
  }
  if (url.protocol !== "https:") throw new Error("接口必须使用 https");
  if (url.username || url.password || url.port) throw new Error("接口地址无效");
  if (!ALLOWED_API_HOSTS.has(url.hostname)) {
    throw new Error("接口只允许 https://api.deepseek.com");
  }
  return DEFAULT_BASE;
}

function cleanModel(raw, fallback) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return fallback;
  if (!MODEL_RE.test(text)) throw new Error("模型名称无效");
  return text;
}

function sanitizePartial(partial) {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    throw new Error("设置无效");
  }
  const out = {};
  for (const key of BOOL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(partial, key)) out[key] = Boolean(partial[key]);
  }
  if (Object.prototype.hasOwnProperty.call(partial, "packId")) {
    const id = String(partial.packId || "");
    if (!isSafePackId(id)) throw new Error("角色包 id 不合法");
    out.packId = id;
  }
  if (Object.prototype.hasOwnProperty.call(partial, "deepseekBaseUrl")) {
    out.deepseekBaseUrl = canonicalizeDeepseekUrl(partial.deepseekBaseUrl);
  }
  if (Object.prototype.hasOwnProperty.call(partial, "deepseekModel")) {
    out.deepseekModel = cleanModel(partial.deepseekModel, defaultSettings.deepseekModel);
  }
  if (Object.prototype.hasOwnProperty.call(partial, "visionModel")) {
    out.visionModel = cleanModel(partial.visionModel, defaultSettings.visionModel);
  }
  if (Object.prototype.hasOwnProperty.call(partial, "voiceHotkey")) {
    out.voiceHotkey = hotkeys.normalize(partial.voiceHotkey);
  }
  if (Object.prototype.hasOwnProperty.call(partial, "hideHotkey")) {
    out.hideHotkey = hotkeys.normalize(partial.hideHotkey);
  }
  if (Object.prototype.hasOwnProperty.call(partial, "deepseekApiKey")) {
    const key = String(partial.deepseekApiKey || "");
    if (key.length > 512 || /[\r\n\0]/.test(key)) throw new Error("API Key 无效");
    if (key) out.deepseekApiKey = key;
  }
  return out;
}

function readStored(userData) {
  try {
    const file = settingsPath(userData);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) || {};
  } catch (_) {}
  return {};
}

function applyStored(stored) {
  const next = { ...defaultSettings };
  for (const key of BOOL_KEYS) {
    if (stored[key] !== undefined) next[key] = Boolean(stored[key]);
  }
  if (isSafePackId(stored.packId)) next.packId = stored.packId;
  try {
    next.deepseekBaseUrl = canonicalizeDeepseekUrl(stored.deepseekBaseUrl || DEFAULT_BASE);
  } catch {
    next.deepseekBaseUrl = DEFAULT_BASE;
  }
  try {
    next.deepseekModel = cleanModel(stored.deepseekModel, defaultSettings.deepseekModel);
  } catch {
    next.deepseekModel = defaultSettings.deepseekModel;
  }
  try {
    next.visionModel = cleanModel(stored.visionModel, defaultSettings.visionModel);
  } catch {
    next.visionModel = defaultSettings.visionModel;
  }
  next.voiceHotkey = hotkeys.normalize(
    stored.voiceHotkey == null ? defaultSettings.voiceHotkey : stored.voiceHotkey
  );
  next.hideHotkey = hotkeys.normalize(
    stored.hideHotkey == null ? defaultSettings.hideHotkey : stored.hideHotkey
  );
  return next;
}

function writeDisk(userData, settings, { sealKey } = {}) {
  const disk = applyStored(settings);
  delete disk.deepseekApiKey;
  if (settings.deepseekApiKey) {
    if (typeof sealKey !== "function") throw new Error("系统加密不可用，无法保存 API Key");
    disk.deepseekApiKeyEnc = sealKey(settings.deepseekApiKey);
  } else if (settings.deepseekApiKeyEnc) {
    disk.deepseekApiKeyEnc = settings.deepseekApiKeyEnc;
  }
  ensureDir(userData);
  fs.writeFileSync(settingsPath(userData), JSON.stringify(disk, null, 2), "utf8");
}

function loadSettings(userData, opts = {}) {
  ensureDir(userData);
  const stored = readStored(userData);
  const next = applyStored(stored);
  const plain = typeof stored.deepseekApiKey === "string" ? stored.deepseekApiKey : "";
  let enc = typeof stored.deepseekApiKeyEnc === "string" ? stored.deepseekApiKeyEnc : "";
  if (plain) {
    next.deepseekApiKey = plain;
    if (typeof opts.sealKey === "function") {
      try {
        if (!enc) enc = opts.sealKey(plain);
        next.deepseekApiKeyEnc = enc;
        writeDisk(userData, next, opts);
        delete next.deepseekApiKeyEnc;
      } catch (_) {
        delete next.deepseekApiKeyEnc;
      }
    }
    return next;
  }
  if (enc && typeof opts.openKey === "function") {
    try {
      next.deepseekApiKey = opts.openKey(enc);
    } catch {
      next.deepseekApiKey = "";
    }
  } else {
    next.deepseekApiKey = "";
  }
  return next;
}

function saveSettings(userData, partial, opts = {}) {
  const patch = sanitizePartial(partial || {});
  const current = loadSettings(userData, opts);
  const next = { ...current, ...patch };
  if (next.voiceHotkey && next.hideHotkey && next.voiceHotkey === next.hideHotkey) {
    throw new Error("隐藏和语音不能用同一组快捷键");
  }
  writeDisk(userData, next, opts);
  return loadSettings(userData, opts);
}

function publicSettings(settings) {
  const s = { ...settings };
  const key = s.deepseekApiKey || "";
  s.hasDeepseekKey = Boolean(key);
  s.deepseekApiKeyMasked = key ? `${key.slice(0, 5)}…${key.slice(-4)}` : "";
  delete s.deepseekApiKey;
  delete s.deepseekApiKeyEnc;
  return s;
}

module.exports = {
  defaultSettings,
  loadSettings,
  saveSettings,
  publicSettings,
  sanitizePartial,
  canonicalizeDeepseekUrl,
};
