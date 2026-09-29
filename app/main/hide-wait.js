/* One hide() wait at a time. show() resolves the pending wait instead of
   dropping it, so a later hide() cannot stay pending forever. */
function createHideWait() {
  let pending = null;

  function cancel() {
    if (!pending) return;
    clearTimeout(pending.timer);
    const resolve = pending.resolve;
    pending = null;
    resolve();
  }

  function wait(ms) {
    cancel();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (pending && pending.resolve === resolve) pending = null;
        resolve();
      }, ms);
      pending = { timer, resolve };
    });
  }

  return { cancel, wait };
}

module.exports = { createHideWait };
