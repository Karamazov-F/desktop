/**
 * What the compose bar and the pet do with a voice-state event.
 * Loaded from Node (module.exports) and from renderer pages (PetVoicePresent).
 */
function spokenHint(s) {
  if (s?.note) return String(s.note);
  const err = s?.error;
  if (!err || err === "empty" || err === "too-short" || err === "busy") return "";
  return String(err);
}

function presentVoiceState(s, ui) {
  const view = ui || {};
  if (view.setMicHot) view.setMicHot(s?.state === "listening");
  if (view.setListenDot) {
    if (s?.state === "listening") view.setListenDot(true);
    if (s?.state === "idle") view.setListenDot(false);
  }
  const hint = spokenHint(s);
  if (s?.state !== "listening" && view.setHint) view.setHint(hint);
  if (s?.state === "idle" && hint && !s?.suppressPetFloat && view.floatText) view.floatText(hint);
}

if (typeof module === "object" && module.exports) {
  module.exports = { presentVoiceState };
} else {
  globalThis.PetVoicePresent = { presentVoiceState };
}
