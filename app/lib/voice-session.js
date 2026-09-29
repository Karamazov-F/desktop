function createVoiceGate() {
  let session = 0;
  let busy = false;

  function matches(sessionId) {
    if (sessionId === undefined || sessionId === null || sessionId === "") return false;
    const id = Number(sessionId);
    if (!Number.isInteger(id)) return false;
    return id === session;
  }

  function begin() {
    if (busy) return { ok: false, error: "busy", sessionId: session };
    busy = true;
    session += 1;
    return { ok: true, sessionId: session };
  }

  function cancel(sessionId) {
    if (!busy || !matches(sessionId)) return { ok: false, ignored: true, sessionId: session };
    busy = false;
    return { ok: true, cancelled: true, sessionId: session };
  }

  function finish(sessionId) {
    if (!busy || !matches(sessionId)) return { ok: false, ignored: true, sessionId: session };
    busy = false;
    return { ok: true, sessionId: session };
  }

  return {
    begin,
    cancel,
    finish,
    current() {
      return session;
    },
    isBusy() {
      return busy;
    },
    isActive(sessionId) {
      return busy && matches(sessionId);
    },
  };
}

const MIN_VOICE_MS = 500;

function voiceReleaseTooSoon(source, startedAt, now = Date.now()) {
  if (source !== "hotkey" || !startedAt) return false;
  return now - startedAt < MIN_VOICE_MS;
}

module.exports = { createVoiceGate, voiceReleaseTooSoon, MIN_VOICE_MS };
