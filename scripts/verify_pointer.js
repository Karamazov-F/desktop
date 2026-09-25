const assert = require("assert");
const pointer = require("../app/lib/pointer");

const origin = { x: 100, y: 100 };

assert.strictEqual(pointer.shouldStartDrag(origin, { x: 104, y: 100 }), false, "exactly SM_CXDRAG is not a drag");
assert.strictEqual(pointer.shouldStartDrag(origin, { x: 103, y: 100 }), false);
assert.strictEqual(pointer.shouldStartDrag(origin, { x: 105, y: 100 }), true, "beyond slop is a drag");
assert.strictEqual(pointer.shouldStartDrag(origin, { x: 100, y: 105 }), true);

const t0 = 1000;
const first = { t: t0, x: 10, y: 10 };
assert.strictEqual(pointer.isDoubleClick(first, { t: t0 + 500, x: 10, y: 10 }), true);
assert.strictEqual(pointer.isDoubleClick(first, { t: t0 + 501, x: 10, y: 10 }), false);
assert.strictEqual(pointer.isDoubleClick(first, { t: t0 + 100, x: 20, y: 10 }), false);

console.log("verify_pointer ok");
