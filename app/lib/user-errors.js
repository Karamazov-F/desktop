/**
 * User-facing copy. Technical detail stays in logs.
 * Loaded from Node (module.exports) and from renderer pages (PetUserErrors).
 */
const TOO_EARLY = "没听清，按住稍久一点再说";
const VOICE_PROCESS_FAILED = "语音处理出错，请再试一次";
const GAVE_UP = "这次没能回复，请再试一次";
const TIMEOUT_REPLY = "这次回复超时了，已改用本地回复";
const NETWORK_REPLY = "连不上 DeepSeek，请检查网络，已改用本地回复";
const BALANCE_REPLY = "DeepSeek 账户余额不足，请到 DeepSeek 开放平台充值；这次先用本地回复";
const KEY_INVALID = "API Key 无效，请到设置里重新填写";

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
  return FIELD_LABELS[key] || "其他设置";
}

function userFacingError(err) {
  const raw = String((err && err.message) || err || "");
  const status = Number(err && err.status) || 0;
  const name = (err && err.name) || "";
  if (err && err.code === "EMAXBODY") return GAVE_UP;
  if (
    status === 401 ||
    status === 403 ||
    /missing api key|invalid api key|unauthorized|authentication fails|invalid_api_key/i.test(raw)
  ) {
    return KEY_INVALID;
  }
  if (status === 402 || /insufficient[_\s-]?balance|insufficient[_\s-]?quota|exceeded your current quota|billing/i.test(raw)) {
    return BALANCE_REPLY;
  }
  if (status === 429 || /rate limit|too many requests/i.test(raw)) {
    return "请求太频繁，稍等一下再试";
  }
  if (name === "AbortError" || status === 408 || /aborterror|\btimeout\b|timed out|etimedout|思考时间过长/i.test(raw)) {
    return TIMEOUT_REPLY;
  }
  if (
    /enotfound|econnrefused|econnreset|eai_again|fetch failed|getaddrinfo|network unreachable|socket hang up|ehostunreach|enetunreach/i.test(
      raw
    )
  ) {
    return NETWORK_REPLY;
  }
  if (raw && /^[\u4e00-\u9fff0-9，。！？、：；「」（）()\s]+$/.test(raw)) return raw;
  return GAVE_UP;
}

function micFailureMessage(err) {
  const name = String((err && err.name) || "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "麦克风权限被拒绝，请打开 设置 → 隐私和安全性 → 麦克风，开启“麦克风访问”和“允许桌面应用访问麦克风”";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "没有检测到麦克风，请插上耳机或麦克风后再试";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "麦克风正被其他程序占用（如会议软件），关闭后再试";
  }
  return null;
}

function sttFailureMessage(err) {
  const raw = String((err && err.message) || err || "");
  if (/未随安装包提供|语音组件|MODULE_NOT_FOUND|cannot find module|\bENOENT\b/i.test(raw)) {
    return "语音组件损坏，请重新安装桌宠";
  }
  if (/超时|timed out|etimedout|\btimeout\b/i.test(raw)) {
    return "识别超时，请再说一次";
  }
  return "语音识别出错，请再试一次";
}

function keyHintText(settings) {
  const s = settings || {};
  const masked = s.deepseekApiKeyMasked || "";
  if (s.keyStorage === "unreadable" || s.keyUnreadable) {
    return "已保存的 Key 暂时无法读取。可以清除后重新填写。";
  }
  if (s.keyStorage === "plaintext") {
    return `已保存 Key：${masked}。系统加密不可用，这枚 Key 仍以明文留在本机。不放心可以点“清除 API Key”`;
  }
  if (s.keyStorage === "encrypted" || (s.hasDeepseekKey && !s.keyStorage)) {
    return `已保存 Key：${masked}（系统加密，不明文存放）`;
  }
  if (s.encryptionAvailable === false) {
    return "尚未保存 Key。当前系统加密不可用，暂时不能保存 API Key。";
  }
  return "尚未保存 Key。Key 会用系统加密保存在本机。";
}

function formatKeySaveError(savedKeys) {
  const labels = [];
  for (const key of savedKeys || []) {
    if (key === "deepseekApiKey") continue;
    const label = FIELD_LABELS[key] || "其他设置";
    if (!labels.includes(label)) labels.push(label);
  }
  const savedText = labels.length ? labels.join("、") : "没有其他改动";
  return `系统加密不可用，无法保存 API Key。已保存：${savedText}。未保存：API Key。`;
}

function displaySaveError(err) {
  let text = String((err && err.message) || err || "");
  text = text.replace(/^Error invoking remote method '[^']*':\s*/i, "");
  text = text.replace(/^Error:\s*/i, "");
  return text.trim() || "保存失败，请再试一次";
}

const api = {
  TOO_EARLY,
  VOICE_PROCESS_FAILED,
  GAVE_UP,
  TIMEOUT_REPLY,
  fieldLabel,
  userFacingError,
  micFailureMessage,
  sttFailureMessage,
  keyHintText,
  formatKeySaveError,
  displaySaveError,
};

if (typeof module === "object" && module.exports) {
  module.exports = api;
} else {
  globalThis.PetUserErrors = api;
}
