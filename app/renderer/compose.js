const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const hintEl = document.getElementById("hint");
const cardEl = document.getElementById("card");
const openComposeBtn = document.getElementById("open-compose");
const quickMicBtn = document.getElementById("quick-mic");
const fieldMicBtn = document.getElementById("field-mic");

function setMicHot(on) {
  quickMicBtn.classList.toggle("hot", on);
  fieldMicBtn?.classList.toggle("hot", on);
}

function bindMic(btn) {
  let voiceStartPromise = null;
  window.PetHoldTalk.bind(btn, {
    onDown() {
      window.petApi.setComposeHold?.(true);
    },
    onListen() {
      voiceStartPromise = window.petApi.voiceStart("hold");
      Promise.resolve(voiceStartPromise).catch(console.error);
    },
    onSend() {
      const pending = voiceStartPromise;
      voiceStartPromise = null;
      Promise.resolve(pending)
        .then((res) => {
          if (res && res.ok && res.sessionId !== undefined && res.sessionId !== null && res.sessionId !== "") {
            return window.petApi.voiceStop(res.sessionId);
          }
        })
        .catch(console.error);
    },
    onTooShort() {
      const pending = voiceStartPromise;
      voiceStartPromise = null;
      Promise.resolve(pending)
        .then((res) => {
          if (res && res.ok && res.sessionId !== undefined && res.sessionId !== null && res.sessionId !== "") {
            return window.petApi.voiceCancel(res.sessionId);
          }
        })
        .catch(console.error);
      window.petApi.floatText(window.PetHoldTalk.TOO_SHORT);
    },
  });
}

let hintSource = "other";
function setHint(text, source = "other") {
  const value = String(text || "");
  hintSource = source;
  hintEl.textContent = value;
  window.petApi.setComposeHintText?.(value, source);
}

function expand() {
  document.body.classList.add("expanded");
  window.petApi.setComposeExpanded?.(true);
}

function syncSendReady() {
  sendBtn.classList.toggle("ready", inputEl.value.trim().length > 0);
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  syncSendReady();
  sendBtn.disabled = true;
  try {
    const res = await window.petApi.chat(text);
    if (res?.stale) return;
    if (res && res.fallbackNote) setHint(res.fallbackNote);
    else if (res) setHint("");
  } catch (err) {
    console.error(err);
    setHint(window.PetUserErrors?.NO_REPLY || "这次没能回复，请再试一次");
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

cardEl.addEventListener("mouseenter", () => window.petApi.setComposeHover?.(true));
cardEl.addEventListener("mouseleave", () => window.petApi.setComposeHover?.(false));
window.petApi.onComposeLayout?.(({ dockX }) => {
  if (Number.isFinite(dockX)) cardEl.style.setProperty("--dock-x", `${dockX}px`);
});
// Explicit opens (tray / double-click / menu) skip the pill and open the
// input directly.
window.petApi.onComposeExpand?.(() => {
  expand();
  setTimeout(() => inputEl.focus(), 0);
});
openComposeBtn.addEventListener("click", () => {
  expand();
  setTimeout(() => inputEl.focus(), 0);
});
sendBtn.addEventListener("click", () => send().catch(console.error));
inputEl.addEventListener("focus", () => window.petApi.setComposeExpanded?.(true));
inputEl.addEventListener("input", () => {
  syncSendReady();
  window.petApi.setComposeExpanded?.(true);
});
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") send().catch(console.error);
  if (e.key === "Escape") window.petApi.windowClose?.();
});

bindMic(quickMicBtn);
bindMic(fieldMicBtn);

// Color only while actually listening. Transcribing must not leave the
// button hot — release already returned it to the idle look.
window.petApi.onVoiceState?.((s) => {
  window.PetVoicePresent.presentVoiceState(s, { setMicHot, setHint });
});

window.petApi.onComposeHint?.((text) => setHint(text));
window.petApi.onComposeNote?.((payload) => {
  document.body.classList.add("expanded");
  if (payload?.text) setHint(payload.text, "note");
  else if (hintSource === "note" && hintEl.textContent === payload?.expiredNote) setHint("");
});

