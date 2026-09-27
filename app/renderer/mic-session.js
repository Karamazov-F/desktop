/* Tracks hold-to-talk so a stop that arrives before getUserMedia resolves
   cannot leave the microphone running. A stop for an older session does not
   invalidate a newer one. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PetMicSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function create() {
    let token = 0;
    let currentSession = null;
    let active = null;

    function begin(sessionId) {
      const mine = ++token;
      currentSession = sessionId == null ? mine : sessionId;
      return mine;
    }

    function stopCurrent(sessionId) {
      if (arguments.length > 0 && sessionId !== currentSession) return null;
      const rec = active;
      active = null;
      token += 1;
      return rec;
    }

    function accept(mine, rec) {
      if (mine !== token) return false;
      active = rec;
      return true;
    }

    return { begin, markStop: stopCurrent, markCancel: stopCurrent, accept };
  }

  return { create };
});
