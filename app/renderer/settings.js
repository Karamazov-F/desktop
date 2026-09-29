const $ = (id) => document.getElementById(id);
const HK = window.PetHotkeys;
if (!HK) throw new Error("PetHotkeys missing — check hotkeys.js script tag");

function accelOf(el) {
  return el.dataset.accel || "";
}

function showHotkey(el, raw) {
  const n = HK.normalize(raw);
  el.dataset.accel = n;
  el.value = n ? HK.formatDisplay(n) : "";
  el.placeholder = n ? HK.formatDisplay(n) : "点击后按下组合键（可清除）";
}

function fill(s) {
  $("deepseekEnabled").checked = Boolean(s.deepseekEnabled);
  $("memoryEnabled").checked = Boolean(s.memoryEnabled);
  $("visionEnabled").checked = Boolean(s.visionEnabled);
  $("alwaysOnTop").checked = Boolean(s.alwaysOnTop);
  $("lifeStream").checked = s.lifeStream === true;
  $("hideOnFullscreen").checked = s.hideOnFullscreen !== false;
  $("deepseekModel").value = s.deepseekModel || "deepseek-flash";
  $("visionModel").value = s.visionModel || "deepseek-flash";
  if (!document.activeElement || !document.activeElement.classList.contains("hotkey")) {
    showHotkey($("hideHotkey"), s.hideHotkey);
    showHotkey($("voiceHotkey"), s.voiceHotkey);
  }
  $("keyHint").textContent = window.PetUserErrors.keyHintText(s);
}

function bindCapture(el) {
  el.addEventListener("focus", () => {
    el.classList.add("recording");
    el.placeholder = "按下组合键… Esc 取消";
  });
  el.addEventListener("blur", () => {
    el.classList.remove("recording");
    el.placeholder = accelOf(el) ? HK.formatDisplay(accelOf(el)) : "点击后按下组合键（可清除）";
  });
  el.addEventListener("keydown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      el.blur();
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      showHotkey(el, "");
      return;
    }
    const accel = HK.fromKeyboardEvent({
      code: e.code,
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
    });
    if (!accel) return;
    showHotkey(el, accel);
    el.blur();
  });
}

async function init() {
  fill(await window.petApi.getSettings());
  window.petApi.onSettingsChanged?.((s) => fill(s));
}

bindCapture($("hideHotkey"));
bindCapture($("voiceHotkey"));
$("clearHideHotkey").addEventListener("click", () => showHotkey($("hideHotkey"), ""));
$("clearVoiceHotkey").addEventListener("click", () => showHotkey($("voiceHotkey"), ""));

$("save").addEventListener("click", async () => {
  const hideHotkey = accelOf($("hideHotkey"));
  const voiceHotkey = accelOf($("voiceHotkey"));
  if (hideHotkey && voiceHotkey && hideHotkey === voiceHotkey) {
    $("status").textContent = "隐藏和语音不能用同一组快捷键。";
    return;
  }
  const partial = {
    deepseekEnabled: $("deepseekEnabled").checked,
    memoryEnabled: $("memoryEnabled").checked,
    visionEnabled: $("visionEnabled").checked,
    alwaysOnTop: $("alwaysOnTop").checked,
    lifeStream: $("lifeStream").checked,
    hideOnFullscreen: $("hideOnFullscreen").checked,
    deepseekModel: $("deepseekModel").value.trim(),
    visionModel: $("visionModel").value.trim(),
    hideHotkey,
    voiceHotkey,
  };
  const key = $("deepseekApiKey").value.trim();
  if (key) partial.deepseekApiKey = key;
  let next;
  try {
    next = await window.petApi.saveSettings(partial);
  } catch (err) {
    $("status").textContent = window.PetUserErrors.displaySaveError(err);
    return;
  }
  $("deepseekApiKey").value = "";
  fill(next);
  const bind = next.hotkeyBind || {};
  const failed = [];
  if (voiceHotkey && bind.voice === false) failed.push("语音");
  if (hideHotkey && bind.hide === false) failed.push("隐藏/显示");
  $("status").textContent = failed.length
    ? `已保存，但${failed.join("、")}快捷键注册失败（可能被系统或其他软件占用）。`
    : "已保存。快捷键立即生效。";
});

$("clearApiKey").addEventListener("click", async () => {
  if (!window.confirm("清除已保存的 API Key？")) return;
  let next;
  try {
    next = await window.petApi.saveSettings({ deepseekApiKey: null });
  } catch (err) {
    $("status").textContent = window.PetUserErrors.displaySaveError(err);
    return;
  }
  $("deepseekApiKey").value = "";
  fill(next);
  $("status").textContent = "已清除 API Key。";
});

const forgetModal = $("forget-modal");
const forgetPhrase = $("forget-phrase");
const forgetConfirm = $("forget-confirm");
let forgetPending = false;
let forgetPackId = null;
let forgetOpenId = 0;

function closeForget() {
  forgetOpenId += 1;
  forgetPackId = null;
  forgetModal.hidden = true;
  forgetPhrase.value = "";
  forgetConfirm.disabled = true;
  $("forget-status").textContent = "";
}

$("clearMem").addEventListener("click", async () => {
  const openId = ++forgetOpenId;
  try {
    const pack = await window.petApi.getCurrentPack();
    if (openId !== forgetOpenId) return;
    if (!pack?.id) throw new Error("当前没有可清空的角色。");
    forgetPackId = pack.id;
    $("forget-pack").textContent = `当前角色：${pack.name || pack.id}（ID：${pack.id}）`;
    $("forget-status").textContent = "";
    forgetPhrase.value = "";
    forgetConfirm.disabled = true;
    forgetModal.hidden = false;
    forgetPhrase.focus();
  } catch (err) {
    $("status").textContent = String(err?.message || err);
  }
});
$("forget-cancel").addEventListener("click", closeForget);
forgetPhrase.addEventListener("input", () => {
  forgetConfirm.disabled = forgetPhrase.value !== "goodbye";
});
$("forget-card").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (forgetPending || !forgetPackId || forgetPhrase.value !== "goodbye") return;
  forgetPending = true;
  forgetConfirm.disabled = true;
  try {
    const result = await window.petApi.clearMemory(forgetPackId, forgetPhrase.value);
    if (!result?.ok) throw new Error(result?.error || "清空失败。");
    closeForget();
    $("status").textContent = "当前角色的记忆和聊天记录已清空。";
  } catch (err) {
    const message = String(err?.message || err);
    $("status").textContent = message;
    $("forget-status").textContent = message;
    forgetConfirm.disabled = false;
  } finally {
    forgetPending = false;
  }
});

$("importDpet").addEventListener("click", () => window.petApi.importPack());
$("importFolder").addEventListener("click", () => window.petApi.importPackFolder());

init().catch((err) => {
  $("status").textContent = window.PetUserErrors.displaySaveError(err);
});
