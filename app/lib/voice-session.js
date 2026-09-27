function createVoiceGate() {
  let session = 0;
  let busy = false;

  function matches(sessionId) {
    if (sessionId == null || sessionId === "") return true;
    return Number(sessionId) === session;
  }

  function begin() {
    if (busy) return { ok: false, error: "busy", sessionId: session };
    busy = true;
    session += 1;
    return { ok: true, sessionId: session };
  }

  function cancel(sessionId) {
    if (!matches(sessionId)) return { ok: false, ignored: true, sessionId: session };
    busy = false;
    return { ok: true, cancelled: true, sessionId: session };
  }

  function finish(sessionId) {
    if (!matches(sessionId)) return { ok: false, ignored: true, sessionId: session };
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
  };
}

module.exports = { createVoiceGate };
