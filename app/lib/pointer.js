/**
 * Win32-style pointer classification (DragDetect / SM_CXDRAG / GetDoubleClickTime).
 * Renderer loads this as a script; Node tests require() it.
 *
 * Drag starts only after the cursor leaves the slop rectangle around mouse-down.
 * Equal to SM_CXDRAG (default 4px) does not start a drag (Raymond Chen / Old New Thing).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PetPointer = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SM_CXDRAG = 4;
  const SM_CYDRAG = 4;
  const DOUBLECLICK_MS = 500;
  const SM_CXDOUBLECLK = 4;
  const SM_CYDOUBLECLK = 4;

  function shouldStartDrag(start, cur, cx = SM_CXDRAG, cy = SM_CYDRAG) {
    if (!start || !cur) return false;
    return Math.abs(cur.x - start.x) > cx || Math.abs(cur.y - start.y) > cy;
  }

  function isDoubleClick(prev, cur, ms = DOUBLECLICK_MS, sx = SM_CXDOUBLECLK, sy = SM_CYDOUBLECLK) {
    if (!prev || !cur) return false;
    return (
      cur.t - prev.t <= ms &&
      Math.abs(cur.x - prev.x) <= sx &&
      Math.abs(cur.y - prev.y) <= sy
    );
  }

  return {
    SM_CXDRAG,
    SM_CYDRAG,
    DOUBLECLICK_MS,
    SM_CXDOUBLECLK,
    SM_CYDOUBLECLK,
    shouldStartDrag,
    isDoubleClick,
  };
});
