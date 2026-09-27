const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const test = require("node:test");
const agent = require("../app/lib/agent");
const chatter = require("../app/lib/chatter");
const dpet = require("../app/lib/dpet");
const deepseek = require("../app/lib/deepseek");
const packs = require("../app/lib/packs");
const pcm = require("../app/renderer/pcm-wav");
const mic = require("../app/renderer/mic-session");
const settings = require("../app/lib/settings");
const stt = require("../app/lib/stt");
const { resolveInside } = require("../app/lib/safe-path");
const { createHideWait } = require("../app/main/hide-wait");
const { allowAppAudio } = require("../app/main/media-permission");
const { pickPython } = require("../scripts/fetch-vendor");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pet-review-"));
}

const crypto = {
  sealKey(plain) {
    return Buffer.from(`enc:${plain}`, "utf8").toString("base64");
  },
  openKey(enc) {
    const text = Buffer.from(enc, "base64").toString("utf8");
    if (!text.startsWith("enc:")) throw new Error("bad");
    return text.slice(4);
  },
};

const brokenCrypto = {
  sealKey() {
    throw new Error("系统加密不可用");
  },
  openKey() {
    throw new Error("系统加密不可用");
  },
};

function packFixture(dir, id) {
  fs.mkdirSync(path.join(dir, "sprites"), { recursive: true });
  fs.writeFileSync(path.join(dir, "sprites", "idle.png"), Buffer.from("png"));
  fs.writeFileSync(
    path.join(dir, "pack.json"),
    JSON.stringify({ id, name: id, states: { idle: "sprites/idle.png" } })
  );
}

test("resolveInside allows ..foo.png and rejects device names, streams, and trailing space", () => {
  const root = tmpDir();
  const ok = resolveInside(root, "sprites/..foo.png");
  assert.equal(path.basename(ok), "..foo.png");
  assert.throws(() => resolveInside(root, "sprites/CON"), /非法路径/);
  assert.throws(() => resolveInside(root, "sprites/nul.txt"), /非法路径/);
  assert.throws(() => resolveInside(root, "sprites/COM1"), /非法路径/);
  assert.throws(() => resolveInside(root, "sprites/file.txt:Zone.Identifier"), /非法路径/);
  assert.throws(() => resolveInside(root, "sprites/file.txt "), /非法路径/);
  assert.throws(() => resolveInside(root, "sprites/file."), /非法路径/);
});

test("importDpet rejects a traversal archive and does not keep the file", () => {
  const parent = tmpDir();
  const archive = path.join(parent, "evil.dpet");
  const imported = path.join(parent, "imported");
  const cache = path.join(parent, "cache");
  dpet.encryptFiles([{ rel: "../pwned.txt", data: Buffer.from("x") }], archive, { id: "evil" });
  assert.throws(() => packs.importDpet(archive, imported, cache), /非法路径|无效/);
  assert.equal(fs.existsSync(path.join(imported, "evil.dpet")), false);
});

test("importDpet copies a valid archive only after it validates", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  packFixture(src, "ok-pack");
  const archive = path.join(parent, "ok.dpet");
  dpet.encryptDir(src, archive);
  const imported = path.join(parent, "imported");
  const cache = path.join(parent, "cache");
  const pack = packs.importDpet(archive, imported, cache);
  assert.equal(pack.id, "ok-pack");
  assert.equal(fs.existsSync(path.join(imported, "ok.dpet")), true);
  assert.equal(fs.existsSync(path.join(pack.dir, "sprites", "idle.png")), true);
});

test("folder import skips symlinks", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  const outside = path.join(parent, "secret.txt");
  fs.writeFileSync(outside, "secret");
  packFixture(src, "ok-pack");
  fs.symlinkSync(outside, path.join(src, "sprites", "link.png"));
  const imported = path.join(parent, "imported");
  const pack = packs.importFolder(src, imported);
  assert.equal(fs.existsSync(path.join(pack.dir, "sprites", "idle.png")), true);
  assert.equal(fs.existsSync(path.join(pack.dir, "sprites", "link.png")), false);
  assert.equal(fs.readFileSync(outside, "utf8"), "secret");
});

test("one broken pack.json does not hide the others", () => {
  const parent = tmpDir();
  const bad = path.join(parent, "bad-pack");
  const good = path.join(parent, "ok-pack");
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, "pack.json"), "{");
  packFixture(good, "ok-pack");
  const listed = packs.listPacksFromDirs([parent]);
  assert.deepEqual(listed.map((p) => p.id), ["ok-pack"]);
});

test("decodePayload rejects a length past the buffer and too many entries", () => {
  const buf = Buffer.alloc(16);
  buf.write("DP01", 0);
  buf.writeUInt32LE(1, 4);
  buf.writeUInt16LE(1, 8);
  buf.write("a", 10);
  buf.writeUInt32LE(0xffffffff, 11);
  assert.throws(() => dpet.decodePayload(buf), /无效|过大|非法/);
  const many = Buffer.alloc(8);
  many.write("DP01", 0);
  many.writeUInt32LE(dpet.MAX_ENTRIES + 1, 4);
  assert.throws(() => dpet.decodePayload(many), /过多/);
});

test("gunzipLimited stops a decompression bomb", () => {
  const gz = zlib.gzipSync(Buffer.alloc(8000));
  assert.throws(() => dpet.gunzipLimited(gz, 100));
  assert.equal(dpet.MAX_OUTPUT_BYTES, 256 * 1024 * 1024);
});

test("partial cache without the completion marker is not treated as imported", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  packFixture(src, "ok-pack");
  const archive = path.join(parent, "ok.dpet");
  dpet.encryptDir(src, archive);
  const cache = path.join(parent, "cache");
  fs.mkdirSync(cache, { recursive: true });
  const pack = packs.readDpetPack(archive, cache);
  assert.equal(pack.id, "ok-pack");
  assert.equal(fs.existsSync(path.join(pack.dir, dpet.COMPLETE_MARKER)), true);
});

test("stop before the microphone starts does not keep the recorder", () => {
  const session = mic.create();
  const mine = session.begin();
  assert.equal(session.markStop(), null);
  assert.equal(session.accept(mine, { id: "late" }), false);
});

test("a started microphone is returned to the stop that follows it", () => {
  const session = mic.create();
  const mine = session.begin();
  const rec = { id: "live" };
  assert.equal(session.accept(mine, rec), true);
  assert.strictEqual(session.markStop(), rec);
});

test("WAV is 16 kHz mono 16-bit and high frequencies are filtered before downsample", () => {
  const samples = new Float32Array(160);
  samples[0] = 0.5;
  const wav = Buffer.from(pcm.encodeWav(samples, 16000));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.length, 44 + samples.length * 2);
  const n = 4800;
  const tone = new Float32Array(n);
  for (let i = 0; i < n; i++) tone[i] = Math.sin((2 * Math.PI * 20000 * i) / 48000);
  const rms = (arr) => {
    let sum = 0;
    for (const x of arr) sum += x * x;
    return Math.sqrt(sum / arr.length);
  };
  assert.ok(rms(pcm.lowPass(tone, 48000, 16000)) < rms(tone) * 0.5);
});

test("other settings save when encryption is unavailable, and a new key is refused", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "settings.json"),
    JSON.stringify({ deepseekApiKey: "sk-old-plain", memoryEnabled: false })
  );
  const saved = settings.saveSettings(
    dir,
    { privacyAccepted: true, memoryEnabled: true },
    brokenCrypto
  );
  const disk = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  assert.equal(disk.privacyAccepted, true);
  assert.equal(disk.memoryEnabled, true);
  assert.equal(disk.deepseekApiKey, "sk-old-plain");
  assert.equal(saved.deepseekApiKey, "sk-old-plain");
  assert.throws(
    () => settings.saveSettings(dir, { deepseekApiKey: "sk-new", alwaysOnTop: false }, brokenCrypto),
    /无法保存 API Key/
  );
  const after = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  assert.equal(after.alwaysOnTop, false);
  assert.notEqual(after.deepseekApiKey, "sk-new");
  assert.equal(after.deepseekApiKey, "sk-old-plain");
});

test("decrypt failure keeps the ciphertext and null clears it", () => {
  const dir = tmpDir();
  const enc = crypto.sealKey("sk-secret");
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ deepseekApiKeyEnc: enc }));
  settings.saveSettings(dir, { memoryEnabled: true }, brokenCrypto);
  const disk = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  assert.equal(disk.deepseekApiKeyEnc, enc);
  assert.equal(disk.deepseekApiKey, undefined);
  assert.equal(disk.memoryEnabled, true);
  const cleared = settings.saveSettings(dir, { deepseekApiKey: null }, crypto);
  const next = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  assert.equal(next.deepseekApiKeyEnc, undefined);
  assert.equal(cleared.deepseekApiKey, "");
  assert.equal(settings.publicSettings(cleared).hasDeepseekKey, false);
});

test("renderer pages keep a self style CSP and floaters are not injected", () => {
  const dir = path.join(__dirname, "..", "app", "renderer");
  const pages = fs.readdirSync(dir).filter((name) => name.endsWith(".html"));
  assert.ok(pages.length >= 4);
  for (const name of pages) {
    const html = fs.readFileSync(path.join(dir, name), "utf8");
    assert.match(html, /style-src 'self'/);
    assert.doesNotMatch(html, /<style[\s>]/i);
  }
  const floater = fs.readFileSync(path.join(dir, "floater.js"), "utf8");
  assert.equal(floater.includes("ensureStyle"), false);
  assert.equal(floater.includes('createElement("style")'), false);
  const css = fs.readFileSync(path.join(dir, "pet.css"), "utf8");
  assert.match(css, /\.pet-floater\b/);
});

test("idle chatter never receives a screen capture", () => {
  const extras = chatter.chatterTurnExtras();
  assert.equal(extras.captureScreen, null);
  assert.equal(extras.allowVision, false);
  assert.equal(agent.visionIsOn({ visionEnabled: true }, extras.allowVision), false);
  const src = fs.readFileSync(path.join(__dirname, "..", "app", "main", "windows.js"), "utf8");
  const body = src.slice(src.indexOf("async function runChatter"), src.indexOf("function defaultChatBounds"));
  assert.match(body, /chatterTurnExtras/);
  assert.doesNotMatch(body, /capturePrimaryJpeg/);
});

test("an aborted turn does not call the network or capture the screen", async () => {
  const ac = new AbortController();
  ac.abort();
  let captured = false;
  const result = await agent.runAgentTurn({
    pack: {
      id: "xiao-jing",
      name: "小鲸",
      states: { idle: { frames: [] } },
      dialogue: { fallback: ["嗯"] },
      persona: { displayName: "小鲸" },
    },
    settings: {
      deepseekEnabled: true,
      deepseekApiKey: "sk-test",
      deepseekBaseUrl: "https://api.deepseek.com",
      deepseekModel: "deepseek-flash",
      memoryEnabled: false,
      visionEnabled: true,
    },
    userText: "你好",
    userData: tmpDir(),
    allowVision: true,
    captureScreen: async () => {
      captured = true;
      return Buffer.from([0xff, 0xd8]);
    },
    signal: ac.signal,
  });
  assert.equal(result.source, "local-fallback");
  assert.equal(captured, false);
});

test("a turn signal aborts an in-flight chat completion", async () => {
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const ac = new AbortController();
  const port = server.address().port;
  const started = Date.now();
  setTimeout(() => ac.abort(), 40);
  await assert.rejects(() =>
    deepseek.chatCompletions({
      apiKey: "sk-test",
      baseUrl: `http://127.0.0.1:${port}`,
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 30000,
      signal: ac.signal,
    })
  );
  assert.ok(Date.now() - started < 5000);
  await new Promise((resolve) => server.close(resolve));
});

test("media permission allows only this app's audio", () => {
  const appDir = path.join("/opt", "pet");
  const page = path.join(appDir, "renderer", "index.html");
  const url = "file://" + page;
  assert.equal(
    allowAppAudio({
      permission: "media",
      requestingUrl: url,
      mediaTypes: ["audio"],
      appDir,
      isAppWindow: true,
    }),
    true
  );
  assert.equal(
    allowAppAudio({
      permission: "media",
      requestingUrl: url,
      mediaTypes: ["audio", "video"],
      appDir,
      isAppWindow: true,
    }),
    false
  );
  assert.equal(
    allowAppAudio({
      permission: "media",
      requestingUrl: "https://example.com/",
      mediaTypes: ["audio"],
      appDir,
      isAppWindow: true,
    }),
    false
  );
  assert.equal(
    allowAppAudio({
      permission: "media",
      requestingUrl: "file:///etc/passwd",
      mediaTypes: ["audio"],
      appDir,
      isAppWindow: true,
    }),
    false
  );
});

test("cancelling a hide wait resolves it", async () => {
  const gate = createHideWait();
  const started = Date.now();
  const pending = gate.wait(5000);
  gate.cancel();
  await pending;
  assert.ok(Date.now() - started < 1000);
});

test("fetch-vendor can select py -3 when python3 is missing", () => {
  const chosen = pickPython((candidate) => candidate.cmd === "py");
  assert.deepEqual(chosen, { cmd: "py", args: ["-3"] });
  assert.throws(() => pickPython(() => false), /Python 3/);
});

test("stt temp names are not only a timestamp", () => {
  const a = stt.tempWavPath();
  const b = stt.tempWavPath();
  assert.notEqual(a, b);
  assert.match(path.basename(a), /^pet-rec-\d+-[0-9a-f]{8}\.wav$/);
});
