/**
 * What the compose bar and the pet do with a voice-state event.
 * Loaded from Node (module.exports) and from renderer pages (PetVoicePresent).
 */
function presentVoiceState(s, ui) {
  const view = ui || {};
  if (view.setMicHot) view.setMicHot(s?.state === "listening");
  if (view.setListenDot) {
    if (s?.state === "listening") view.setListenDot(true);
    if (s?.state === "idle") view.setListenDot(false);
  }
  if (s?.state !== "listening" && view.setHint) {
    view.setHint(s?.note ? s.note : "");
  }
  if (s?.state === "idle" && s?.note && view.floatText) view.floatText(s.note);
}

if (typeof module === "object" && module.exports) {
  module.exports = { presentVoiceState };
} else {
  globalThis.PetVoicePresent = { presentVoiceState };
}
