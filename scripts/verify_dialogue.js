/**
 * Verify sample-human persona/dialogue wiring without GUI.
 */
const path = require("path");
const assert = require("assert");
const { readPack } = require("../app/lib/packs");
const dialogue = require("../app/lib/dialogue");

const PACKS = path.join(__dirname, "..", "packs");
const pack = readPack(PACKS, "sample-human");

assert.ok(pack, "sample-human pack");
assert.ok(pack.persona?.displayName, "persona.displayName");
assert.ok(pack.states.idle, "idle");
assert.ok(pack.states.meow, "meow");
assert.strictEqual(pack.states.meow?.label, "挥手");
assert.ok(pack.states.idle.pingpong, "idle pingpong");

const hi = dialogue.reply(pack, "你好呀");
assert.ok(hi.matched);
assert.strictEqual(hi.action, "meow");

if (pack.states.sleep) {
  const sleep = dialogue.reply(pack, "有点困了");
  assert.strictEqual(sleep.action, "sleep");
}
if (pack.states.stretch) {
  assert.strictEqual(dialogue.reply(pack, "好累啊").action, "stretch");
}
if (pack.states.happy) {
  assert.strictEqual(dialogue.reply(pack, "今天很开心").action, "happy");
}

const jing = readPack(PACKS, "xiao-jing");
assert.ok(jing, "xiao-jing pack");
assert.ok(jing.states.walk, "xiao-jing walk");
const leftWalk = dialogue.reply(jing, "左走");
assert.ok(leftWalk.matched, "左走 matched");
assert.strictEqual(leftWalk.action, "walk");
assert.ok(leftWalk.move, "左走 should move");
assert.strictEqual(leftWalk.move.direction, "left");
const rightWalk = dialogue.reply(jing, "往右走两步");
assert.strictEqual(rightWalk.move.direction, "right");
const plainWalk = dialogue.reply(jing, "散步");
assert.strictEqual(plainWalk.action, "walk");
assert.strictEqual(plainWalk.move.direction, "current");
assert.strictEqual(dialogue.reply(jing, "你好呀").move, null);

const agent = require("../app/lib/agent");
const plays = [];
async function verifyLocalAgent() {
  const res = await agent.runAgentTurn({
    pack: jing,
    settings: { deepseekEnabled: false },
    userText: "左走",
    userData: require("os").tmpdir(),
    applyPlay: (action, line, move) => plays.push({ action, line, move }),
    applyMove: () => {
      throw new Error("local 左走 should not teleport via applyMove");
    },
  });
  assert.strictEqual(res.source, "local");
  assert.strictEqual(plays.length, 1);
  assert.strictEqual(plays[0].action, "walk");
  assert.strictEqual(plays[0].move.direction, "left");
}

verifyLocalAgent()
  .then(() => {
    console.log(
      JSON.stringify(
        {
          ok: true,
          displayName: pack.persona.displayName,
          states: Object.keys(pack.states),
          idleFrames: pack.states.idle.frames.length,
          meowFrames: pack.states.meow.frames.length,
          jingWalk: {
            action: leftWalk.action,
            dir: leftWalk.move.direction,
            agentPlay: plays[0],
          },
        },
        null,
        2
      )
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
