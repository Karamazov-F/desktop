/* Hold-to-talk. Listening starts on press. A release shorter than MIN_MS
   cancels; it does not run transcription or send. */
(function () {
  const MIN_MS = 500;
  const TOO_SHORT = "没听清，按住稍久一点再说";

  function bind(button, hooks) {
    if (!button) return { cancel() {} };
    let gesture = null;

    function clearGesture() {
      if (!gesture) return;
      gesture = null;
    }

    function onDown(e) {
      if (e.button !== 0 || gesture) return;
      e.preventDefault();
      gesture = { t: performance.now(), pointerId: e.pointerId };
      hooks.onDown?.();
      hooks.onListen?.();
      try {
        button.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    function onUp(e) {
      if (!gesture) return;
      if (e && e.pointerId != null && e.pointerId !== gesture.pointerId) return;
      const elapsed = performance.now() - gesture.t;
      clearGesture();
      if (elapsed < MIN_MS) {
        hooks.onTooShort?.();
        return;
      }
      hooks.onSend?.();
    }

    button.addEventListener("pointerdown", onDown);
    button.addEventListener("pointerup", onUp);
    button.addEventListener("pointercancel", onUp);
    return { cancel: clearGesture };
  }

  window.PetHoldTalk = { bind, MIN_MS, TOO_SHORT };
})();
