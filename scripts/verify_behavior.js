const assert = require("assert");
const path = require("path");
const behavior = require("../app/lib/behavior");
const { readPack } = require("../app/lib/packs");

const ROOT = path.join(__dirname, "..");
const human = readPack(path.join(ROOT, "packs"), "sample-human");
const blob = readPack(path.join(ROOT, "packs"), "blob");
const pixel = readPack(path.join(ROOT, "packs"), "pixel");

assert.ok(human, "sample-human pack");
const cat = behavior.catalogFromPack(human);
assert.deepStrictEqual(cat.clicks.slice().sort(), ["happy", "meow"]);
assert.ok(cat.ambient.includes("stretch"));
assert.ok(cat.rest.includes("sleep"));
assert.deepStrictEqual(cat.moves, []);
assert.strictEqual(cat.canSlide, true);

const blobCat = behavior.catalogFromPack(blob);
assert.ok(blobCat.clicks.includes("happy"));
assert.ok(blobCat.ambient.includes("happy"));
assert.deepStrictEqual(blobCat.rest, []);

const pixelCat = behavior.catalogFromPack(pixel);
assert.ok(pixelCat.clicks.includes("happy"));
assert.ok(pixelCat.ambient.includes("stretch"));

let seq = 0;
const randSeq = (vals) => {
  let i = 0;
  return () => vals[i++] ?? 0;
};

const idlePick = behavior.pickNext(cat, { facing: "right", moveOk: true }, randSeq([0.05]));
assert.strictEqual(idlePick.kind, "idle");

const turnPick = behavior.pickNext(cat, { facing: "right", moveOk: true }, randSeq([0.35]));
assert.strictEqual(turnPick.kind, "turn");
assert.strictEqual(turnPick.facing, "left");

const clickA = behavior.pickClick(cat, "meow", () => 0);
assert.strictEqual(clickA, "happy");
const clickB = behavior.pickClick(cat, "happy", () => 0);
assert.strictEqual(clickB, "meow");

const blocked = behavior.roamPlan({
  facing: "right",
  win: { x: 1800, y: 700, width: 280, height: 300 },
  work: { x: 0, y: 0, width: 1920, height: 1080 },
  distance: 160,
  margin: 24,
  minRoom: 56,
});
assert.strictEqual(blocked.ok, false);
assert.strictEqual(blocked.flip, true);
assert.strictEqual(blocked.facing, "left");

const open = behavior.roamPlan({
  facing: "left",
  win: { x: 800, y: 400, width: 280, height: 300 },
  work: { x: 0, y: 0, width: 1920, height: 1080 },
  distance: 160,
});
assert.strictEqual(open.ok, true);
assert.ok(open.dx < 0);
assert.strictEqual(open.dy, 0);

const noMove = behavior.pickNext(cat, { facing: "right", moveOk: false }, randSeq([0.95]));
assert.notStrictEqual(noMove.kind, "move");

const directedLeft = behavior.directedPlan({
  direction: "left",
  win: { x: 800, y: 400, width: 280, height: 300 },
  work: { x: 0, y: 0, width: 1920, height: 1080 },
  distance: 220,
});
assert.strictEqual(directedLeft.ok, true);
assert.ok(directedLeft.dx < 0);
assert.strictEqual(directedLeft.facing, "left");
assert.strictEqual(directedLeft.flip, false);

const directedBlocked = behavior.directedPlan({
  direction: "left",
  win: { x: 30, y: 400, width: 280, height: 300 },
  work: { x: 0, y: 0, width: 1920, height: 1080 },
  distance: 220,
  margin: 24,
  minRoom: 8,
});
assert.strictEqual(directedBlocked.facing, "left");
assert.ok(directedBlocked.dx <= 0);
assert.strictEqual(directedBlocked.flip, false);

const kinds = { idle: 0, turn: 0, action: 0, rest: 0, move: 0 };
for (let i = 0; i < 1000; i++) {
  const p = behavior.pickNext(cat, { facing: "right", moveOk: true, lastAction: "stretch" });
  kinds[p.kind] += 1;
}
assert.ok(kinds.idle > 150 && kinds.idle < 450, `idle ${kinds.idle}`);
assert.ok(kinds.move > 80, `move ${kinds.move}`);
assert.ok(kinds.action > 150, `action ${kinds.action}`);
assert.ok(kinds.turn > 40, `turn ${kinds.turn}`);

seq += 1;
console.log("verify_behavior ok", { kinds, seq });
