const logEl = document.getElementById("log");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");
const whoEl = document.getElementById("who");
const hintEl = document.getElementById("hint");

let voiceHotkey = "Ctrl+Shift+Space";

function asText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if (typeof v.text === "string") return v.text;
    if (typeof v.message === "string") return v.message;
  }
  return String(v);
}

function addRow(cls, text) {
  const p = document.createElement("p");
  p.className = `row ${cls}`;
  p.textContent = asText(text);
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

function applyHint(settings) {
  const bits = [];
  if (settings?.deepseekEnabled && settings?.hasDeepseekKey) bits.push("DeepSeek 对话开");
  else bits.push("本地规则（DeepSeek 关）");
  bits.push(settings?.memoryEnabled ? "记忆开" : "记忆关");
  bits.push(settings?.visionEnabled ? "允许查看屏幕" : "不查看屏幕");
  if (settings?.voiceHotkey) voiceHotkey = settings.voiceHotkey;
  const voiceLabel = String(voiceHotkey || "")
    .replace("CommandOrControl", "Ctrl")
    .replace("Space", "空格")
    .replace(/\+/g, "+");
  hintEl.textContent =
    bits.join(" · ") +
    `。打字回车发送；按住说话超过半秒，或 ${voiceLabel} 语音（关对话窗也能说）。`;
  if (inputEl) {
    inputEl.placeholder = voiceLabel
      ? `打字，或按 ${voiceLabel} 说话`
      : "打字发送；快捷键可在设置里配置";
  }
}

async function init() {
  const data = await window.petApi.getBootstrap();
  if (data.voiceHotkey) voiceHotkey = data.voiceHotkey;
  const name = data.pack?.persona?.displayName || data.pack?.name || "桌宠";
  whoEl.textContent = `和${name}对话`;
  applyHint(data.settings);
  const g = data.pack?.persona?.greeting;
  if (g && !(data.chatLog || []).length) addRow("bot", `${name}：${g}`);
  for (const m of data.chatLog || []) {
    addRow(
      m.role === "user" ? "user" : m.role === "meta" ? "meta" : "bot",
      m.role === "user"
        ? `我：${asText(m.text)}`
        : m.role === "bot"
          ? `${name}：${asText(m.text)}`
          : asText(m.text)
    );
  }
  window.petApi.onSettingsChanged?.((s) => applyHint(s));
  window.petApi.onThinking?.((on) => {
    const old = logEl.querySelector(".row.think");
    if (old) old.remove();
    if (on) {
      const p = addThink();
      p.classList.add("think");
    }
  });
  window.petApi.onChatCleared?.(() => {
    logEl.replaceChildren();
  });
  window.petApi.onChatTurn?.((payload) => {
    const said = asText(payload?.user);
    if (said) addRow("user", `我：${said}`);
    const reply = payload?.reply;
    if (reply?.text) {
      addRow("bot", `${reply.displayName || "桌宠"}：${asText(reply.text)}`);
    }
  });
  window.petApi.onVoiceState?.((s) => {
    if (!micBtn) return;
    micBtn.classList.toggle("hot", s?.state === "listening");
    micBtn.textContent = "按住说话";
  });
  window.petApi.onVoiceTranscript?.((payload) => {
    const said = asText(payload?.text);
    if (said) addRow("user", `我：${said}`);
    const reply = payload?.reply;
    if (reply?.text) {
      const name = reply.displayName || "桌宠";
      addRow("bot", `${name}：${asText(reply.text)}`);
    }
  });
}

async function send(textOverride) {
  const text = (textOverride != null ? textOverride : inputEl.value).trim();
  if (!text) return;
  if (textOverride == null) inputEl.value = "";
  addRow("user", `我：${text}`);
  sendBtn.disabled = true;
  const think = addThink();
  try {
    const res = await window.petApi.chat(text);
    think.remove();
    const name = res?.displayName || "桌宠";
    addRow("bot", `${name}：${res?.text || "…"}`);
    if (res?.source && res.source !== "deepseek") {
      const note =
        res.error || (res.source === "local" ? "来源：本地回复" : "已改用本地回复");
      addRow("meta", note);
    }
    if (res?.usedVision) addRow("meta", "已查看屏幕，画面已发送");
  } catch (err) {
    console.error(err);
    think.remove();
    addRow("meta", "这次没能回复，请再试一次");
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

function addThink() {
  const p = document.createElement("p");
  p.className = "row meta";
  p.textContent = "正在想…";
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
  return p;
}

sendBtn.addEventListener("click", () => send().catch(console.error));
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") send().catch(console.error);
});

window.PetHoldTalk.bind(micBtn, {
  onDown() {
    window.petApi.setComposeHold?.(true);
  },
  onListen() {
    window.petApi.voiceStart("hold").catch(console.error);
  },
  onSend() {
    window.petApi.voiceStop().catch(console.error);
  },
  onTooShort() {
    window.petApi.voiceCancel?.().catch(console.error);
    window.petApi.floatText(window.PetHoldTalk.TOO_SHORT);
  },
});

init().catch(console.error);
