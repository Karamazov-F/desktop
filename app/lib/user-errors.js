/**
 * User-facing copy. Technical detail stays in logs.
 * Loaded from Node (module.exports) and from renderer pages (PetUserErrors).
 */
const TOO_EARLY = "没听清，按住稍久一点再说";

const FIELD_LABELS = {
  deepseekEnabled: "DeepSeek",
  memoryEnabled: "长期记忆",
  visionEnabled: "允许查看屏幕",
  alwaysOnTop: "窗口置顶",
  lifeStream: "生活流",
  hideOnFullscreen: "全屏时隐藏",
  clickThrough: "点击穿透",
  onboarded: "引导",
  privacyAccepted: "隐私确认",
  hidden: "隐藏",
  packId: "角色",
  deepseekModel: "对话模型",
  visionModel: "识图模型",
  hideHotkey: "隐藏快捷键",
  voiceHotkey: "语音快捷键",
  deepseekApiKey: "API Key",
  deepseekBaseUrl: "接口地址",
};

function fieldLabel(key) {
  return FIELD_LABELS[key] || key;
}

function statusFrom(raw) {
  const match = String(raw || "").match(/\b(401|402|403|408|429)\b/);
  return match ? Number(match[1]) : 0;
}

function userFacingError(err) {
  const raw = String((err && err.message) || err || "");
  const status = Number(err && err.status) || statusFrom(raw);
  const name = (err && err.name) || "";
  if (
    status === 401 ||
    status === 403 ||
    /missing api key|invalid api key|unauthorized|authentication fails|invalid_api_key/i.test(raw)
  ) {
    return "API Key 无效，请到设置里重新填写";
  }
  if (status === 402 || /insufficient[_\s-]?balance|insufficient[_\s-]?quota|exceeded your current quota|billing/i.test(raw)) {
    return "DeepSeek 账户余额不足";
  }
  if (status === 429 || /rate limit|too many requests/i.test(raw)) {
    return "请求太频繁，稍等一下再试";
  }
  if (name === "AbortError" || status === 408 || /aborterror|\btimeout\b|timed out|etimedout|思考时间过长/i.test(raw)) {
    return "网络较慢，已改用本地回复";
  }
  if (
    /enotfound|econnrefused|econnreset|eai_again|fetch failed|getaddrinfo|network unreachable|socket hang up|ehostunreach|enetunreach/i.test(
      raw
    )
  ) {
    return "连不上 DeepSeek，请检查网络";
  }
  if (raw && /^[\u4e00-\u9fff0-9，。！？、：；「」（）()\s]+$/.test(raw)) return raw;
  return "这次没能连上模型，已改用本地回复";
}

function micFailureMessage(err) {
  const name = String((err && err.name) || "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "麦克风权限被拒绝，请在 Windows 设置 → 隐私 → 麦克风中允许本应用";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "没有检测到麦克风";
  if (name === "NotReadableError" || name === "TrackStartError") return "麦克风正被其他程序占用";
  return null;
}

function keyHintText(settings) {
  const s = settings || {};
  const masked = s.deepseekApiKeyMasked || "";
  if (s.keyStorage === "unreadable" || s.keyUnreadable) {
    return "已保存的 Key 暂时无法读取。可以清除后重新填写。";
  }
  if (s.keyStorage === "plaintext") {
    return `已保存 Key：${masked}。系统加密不可用，这枚 Key 仍以明文留在本机。`;
  }
  if (s.keyStorage === "encrypted" || (s.hasDeepseekKey && !s.keyStorage)) {
    return `已保存 Key：${masked}（系统加密，不明文存放）`;
  }
  return "尚未保存 Key。Key 会用系统加密保存在本机。";
}

function formatKeySaveError(savedKeys) {
  const saved = (savedKeys || []).filter((key) => key !== "deepseekApiKey");
  const savedText = saved.length ? saved.map(fieldLabel).join("、") : "没有其他改动";
  return `系统加密不可用，无法保存 API Key。已保存：${savedText}。未保存：API Key。`;
}

const api = {
  TOO_EARLY,
  fieldLabel,
  userFacingError,
  micFailureMessage,
  keyHintText,
  formatKeySaveError,
};

if (typeof module === "object" && module.exports) {
  module.exports = api;
} else {
  globalThis.PetUserErrors = api;
}
