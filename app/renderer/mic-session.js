/* Tracks hold-to-talk so a stop that arrives before getUserMedia resolves
   cannot leave the microphone running. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PetMicSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function create() {
    let token = 0;
    let stopRequested = false;
    let active = null;

    function begin() {
      const mine = ++token;
      stopRequested = false;
      return mine;
    }

    function take() {
      token += 1;
      stopRequested = true;
      const rec = active;
      active = null;
      return rec;
    }

    function accept(mine, rec) {
      if (mine !== token || stopRequested) return false;
      active = rec;
      return true;
    }

    return { begin, markStop: take, markCancel: take, accept };
  }

  return { create };
});
