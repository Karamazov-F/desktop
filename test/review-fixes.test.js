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
const { allowAppAudio, isInsideDir } = require("../app/main/media-permission");
const vendor = require("../scripts/fetch-vendor");
const { EventEmitter } = require("events");
const errors = require("../app/lib/user-errors");
const { createVoiceGate, voiceReleaseTooSoon } = require("../app/lib/voice-session");
const { selectTrayAssets, trayIconFiles, fallbackTrayPng } = require("../app/main/tray-icon");
const icons = require("../scripts/make-icons");
const notices = require("../scripts/assert-packaged-notices");
const tar = require("tar");

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
  assert.throws(() => dpet.decodePayload(buf), /这个角色包无法使用，请向角色包作者重新获取/);
  const many = Buffer.alloc(8);
  many.write("DP01", 0);
  many.writeUInt32LE(dpet.MAX_ENTRIES + 1, 4);
  assert.throws(() => dpet.decodePayload(many), /这个角色包无法使用，请向角色包作者重新获取/);
});

test("gunzipLimited stops a decompression bomb", () => {
  const gz = zlib.gzipSync(Buffer.alloc(8000));
  assert.throws(
    () => dpet.gunzipLimited(gz, 100),
    (err) => {
      assert.match(err.message, /这个角色包无法使用，请向角色包作者重新获取/);
      assert.doesNotMatch(err.message, /RangeError|maxOutputLength/);
      return true;
    }
  );
  assert.equal(dpet.MAX_OUTPUT_BYTES, 256 * 1024 * 1024);
});

test("partial cache without the completion marker is not treated as imported", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  packFixture(src, "ok-pack");
  const archive = path.join(parent, "ok.dpet");
  dpet.encryptDir(src, archive);
  const cache = path.join(parent, "cache");
  const dest = path.join(cache, packs.cacheKeyForDpet(archive));
  fs.mkdirSync(path.join(dest, "sprites"), { recursive: true });
  fs.writeFileSync(
    path.join(dest, "pack.json"),
    JSON.stringify({ id: "half-written", name: "x", version: "1", states: { idle: "sprites/idle.png" } })
  );
  fs.writeFileSync(path.join(dest, "sprites", "idle.png"), Buffer.from("stale"));
  fs.writeFileSync(path.join(dest, "HALF"), "partial");
  assert.equal(fs.existsSync(path.join(dest, dpet.COMPLETE_MARKER)), false);
  const pack = packs.readDpetPack(archive, cache);
  assert.equal(pack.id, "ok-pack");
  assert.equal(fs.existsSync(path.join(dest, "HALF")), false);
  assert.equal(fs.existsSync(path.join(dest, dpet.COMPLETE_MARKER)), true);
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
  assert.equal(settings.publicSettings(saved).keyStorage, "plaintext");
  assert.match(errors.keyHintText(settings.publicSettings(saved)), /明文/);
  assert.throws(
    () => settings.saveSettings(dir, { deepseekApiKey: "sk-new", alwaysOnTop: false }, brokenCrypto),
    /无法保存 API Key[\s\S]*窗口置顶[\s\S]*未保存：API Key/
  );
  assert.throws(
    () =>
      settings.saveSettings(
        dir,
        {
          deepseekApiKey: "sk-other",
          alwaysOnTop: false,
          memoryEnabled: true,
          deepseekEnabled: false,
          visionEnabled: false,
          lifeStream: false,
          hideOnFullscreen: true,
          mysteryField: "leak",
        },
        brokenCrypto
      ),
    (err) => {
      assert.match(err.message, /没有其他改动/);
      assert.doesNotMatch(err.message, /窗口置顶|长期记忆|mysteryField/);
      return true;
    }
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
    assert.doesNotMatch(html, /unsafe-inline/);
    assert.doesNotMatch(html, /<style[\s>]/i);
    assert.match(html, /rel="preload"[^>]+LXGWWenKai-Regular\.woff2/);
  }
  const floater = fs.readFileSync(path.join(dir, "floater.js"), "utf8");
  assert.equal(floater.includes("ensureStyle"), false);
  assert.equal(floater.includes('createElement("style")'), false);
  const css = fs.readFileSync(path.join(dir, "pet.css"), "utf8");
  assert.match(css, /\.pet-floater\b/);
});

test("shared browser libraries load together without global declaration collisions", () => {
  const vm = require("vm");
  const context = vm.createContext({});
  context.window = context;
  for (const name of ["user-errors.js", "note-layout.js", "hotkeys.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app", "lib", name), "utf8"), context, { filename: name });
  }
  assert.equal(typeof context.PetUserErrors.keyHintText, "function");
  assert.equal(typeof context.PetNoteLayout.fitPetNote, "function");
  assert.equal(typeof context.PetHotkeys.normalize, "function");
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
  assert.match(result.error, /回复超时了；这次先用本地回复/);
  assert.doesNotMatch(result.error, /网络较慢/);
  assert.doesNotMatch(result.error, /Abort|timeout|Error/i);
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

test("media permission check uses mediaType and Windows paths ignore case", () => {
  const appDir = "C:\\Program Files\\Pet";
  const page = "C:\\Program Files\\Pet\\renderer\\index.html";
  const url = "file:///C:/Program%20Files/Pet/renderer/index.html";
  assert.equal(
    allowAppAudio({
      permission: "media",
      requestingUrl: url,
      mediaType: "audio",
      appDir,
      isAppWindow: true,
      platform: "win32",
    }),
    true
  );
  assert.equal(
    allowAppAudio({
      permission: "media",
      requestingUrl: url,
      mediaType: "video",
      appDir,
      isAppWindow: true,
      platform: "win32",
    }),
    false
  );
  assert.equal(
    allowAppAudio({
      permission: "media",
      requestingUrl: url,
      appDir,
      isAppWindow: true,
      platform: "win32",
    }),
    false
  );
  assert.equal(
    isInsideDir("C:\\PROGRAM FILES\\PET\\renderer\\index.html", "c:\\program files\\pet", "win32"),
    true
  );
  assert.equal(isInsideDir("C:\\Other\\index.html", "c:\\program files\\pet", "win32"), false);
  assert.equal(isInsideDir(page, appDir, "linux"), false);
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

test("vendor staging does not shell out and rejects unsafe archive paths", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "fetch-vendor.js"), "utf8");
  assert.doesNotMatch(src, /spawnSync|python3|py -3|child_process/);
  assert.match(src, /unbzip2-stream/);
  assert.equal(vendor.isSafeArchivePath("package/sherpa-onnx.js"), true);
  assert.equal(vendor.isSafeArchivePath("../etc/passwd"), false);
  assert.equal(vendor.isSafeArchivePath("package/../../etc/passwd"), false);
  assert.equal(vendor.isSafeArchivePath("/etc/passwd"), false);
  assert.equal(vendor.ASSETS.sensevoiceLicense.sha256.length, 64);
});

test("stt temp names are not only a timestamp", () => {
  const a = stt.tempWavPath();
  const b = stt.tempWavPath();
  assert.notEqual(a, b);
  assert.match(path.basename(a), /^pet-rec-\d+-[0-9a-f]{8}\.wav$/);
});

function fakeWorker() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stdin = { write() {} };
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

test("a late exit from a timed-out worker does not fail the retry", async () => {
  const children = [];
  const sup = stt.createSupervisor({
    requestTimeoutMs: 400,
    readyTimeoutMs: 1000,
    runtime: {
      node: "node",
      worker: "worker.js",
      modelDir: "model",
      root: ".",
      modules: ".",
      dllDir: ".",
    },
    spawnImpl() {
      const child = fakeWorker();
      children.push(child);
      return child;
    },
  });
  const ready = sup.ensureWorker();
  children[0].stdout.emit("data", '{"ready":true}\n');
  await ready;
  await assert.rejects(sup.sendRequest({ path: "a.wav" }), /超时/);
  const again = sup.ensureWorker();
  children[1].stdout.emit("data", '{"ready":true}\n');
  await again;
  const second = sup.sendRequest({ path: "b.wav" });
  children[0].emit("exit", 1);
  let settled = false;
  second.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(settled, false);
  children[1].stdout.emit("data", '{"id":2,"ok":true,"text":"你好"}\n');
  assert.equal((await second).text, "你好");
});

test("a stale voice cancel does not clear the newer session", () => {
  const gate = createVoiceGate();
  const first = gate.begin();
  gate.cancel(first.sessionId);
  const second = gate.begin();
  const stale = gate.cancel(first.sessionId);
  assert.equal(stale.ignored, true);
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.current(), second.sessionId);
  assert.equal(gate.cancel(second.sessionId).cancelled, true);
  assert.equal(gate.isBusy(), false);
  const third = gate.begin();
  assert.equal(gate.cancel("").ignored, true);
  assert.equal(gate.cancel(undefined).ignored, true);
  assert.equal(gate.cancel(null).ignored, true);
  assert.equal(gate.finish("").ignored, true);
  assert.equal(gate.finish(undefined).ignored, true);
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.cancel(third.sessionId).cancelled, true);
});

test("an older microphone stop does not drop the newer recorder", () => {
  const session = mic.create();
  const first = session.begin(1);
  assert.equal(session.markStop(1), null);
  assert.equal(session.accept(first, { id: "late" }), false);
  const second = session.begin(2);
  const rec = { id: "live" };
  assert.equal(session.accept(second, rec), true);
  assert.equal(session.markStop(1), undefined);
  assert.strictEqual(session.markStop(2), rec);
  assert.equal(session.markStop(), null);
});

test("hold-to-talk cancel passes the session id", () => {
  const root = path.join(__dirname, "..", "app", "renderer");
  for (const name of ["chat.js", "compose.js"]) {
    const src = fs.readFileSync(path.join(root, name), "utf8");
    assert.match(src, /voiceCancel\(res\.sessionId\)/);
    assert.doesNotMatch(src, /voiceCancel\?\.\(\)/);
  }
  const pet = fs.readFileSync(path.join(root, "pet.js"), "utf8");
  const ipcFail = pet.slice(pet.indexOf("transcribeAudio"));
  assert.match(ipcFail, /voiceCancel\?\.\(sessionId\)/);
});

test("a voice reply with chat closed still shows the fallback note", async () => {
  const note = "回复超时了；这次先用本地回复";
  const root = tmpDir();
  const userData = path.join(root, "user");
  fs.mkdirSync(userData);
  const electronEntry = require.resolve("electron", { paths: [path.join(__dirname, "..", "app")] });
  const previousElectron = require.cache[electronEntry];
  require.cache[electronEntry] = {
    id: electronEntry,
    filename: electronEntry,
    loaded: true,
    exports: {
      app: { getPath: () => userData, isReady: () => true },
      safeStorage: { isEncryptionAvailable: () => false },
      BrowserWindow: function BrowserWindow() {},
      screen: {
        getPrimaryDisplay: () => ({
          workArea: { x: 0, y: 0, width: 800, height: 600 },
          workAreaSize: { width: 800, height: 600 },
        }),
        getCursorScreenPoint: () => ({ x: -1, y: -1 }),
      },
      dialog: {},
      desktopCapturer: {},
      ipcMain: { handle() {}, on() {} },
      session: { defaultSession: {} },
      globalShortcut: {},
      Tray: function Tray() {},
      Menu: { buildFromTemplate: () => ({}) },
      nativeImage: {},
    },
  };
  const { state } = require("../app/main/state");
  const voice = require("../app/main/voice");
  const windows = require("../app/main/windows");
  const { presentVoiceState } = require("../app/renderer/voice-present");
  const sent = [];
  let composeClosed = 0;
  function track(name) {
    return {
      isDestroyed: () => false,
      isVisible: () => false,
      getBounds: () => ({ x: 10, y: 20, width: 128, height: 128 }),
      show() {},
      showInactive() {},
      focus() {},
      close() {
        if (name !== "compose") return;
        composeClosed += 1;
        state.composeExpanded = false;
        state.composeVoicePin = false;
        state.composeNoteText = "";
        state.composeNoteUntilLeave = false;
      },
      setContentSize() {},
      setPosition() {},
      setBounds() {},
      webContents: {
        send(channel, payload) {
          sent.push({ name, channel, payload });
        },
      },
    };
  }
  state.chatWindow = null;
  state.petWindow = track("pet");
  state.composeWindow = track("compose");
  const originalTurn = agent.runAgentTurn;
  agent.runAgentTurn = async () => ({
    source: "local-fallback",
    text: "嗯",
    error: note,
    displayName: "小鲸",
  });
  try {
    const started = await voice.beginVoice("hotkey");
    assert.equal(started.ok, true);
    const result = await voice.handleTranscribedText("今天天气怎么样");
    voice.settleTranscribed(started.sessionId, result);
    const notedAt = Date.now();
    const idle = sent.filter((e) => e.channel === "voice-state" && e.payload.state === "idle" && e.payload.note);
    assert.equal(idle.length, 2);
    for (const event of idle) {
      assert.equal(event.payload.note, note);
      assert.equal(event.payload.text, "今天天气怎么样");
    }
    assert.deepEqual(
      idle.map((e) => e.name).sort(),
      ["compose", "pet"]
    );
    assert.equal(sent.some((e) => e.name === "chat"), false);
    const hints = [];
    const floats = [];
    presentVoiceState({ state: "transcribing" }, {
      setHint(text) { hints.push(text); },
      floatText(text) { floats.push(text); },
    });
    presentVoiceState(idle.find((e) => e.name === "compose").payload, {
      setHint(text) { hints.push(text); },
      floatText(text) { floats.push(text); },
    });
    presentVoiceState({ state: "idle" }, {
      setHint(text) { hints.push(text); },
      floatText(text) { floats.push(text); },
    });
    assert.deepEqual(hints, ["", note, ""]);
    assert.deepEqual(floats, [note]);

    const layout = require("../app/lib/note-layout");
    const hold = layout.holdMs(note);
    const elapsed = () => Date.now() - notedAt;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 500 - elapsed())));
    assert.equal(composeClosed, 0);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, hold - 400 - elapsed())));
    assert.equal(composeClosed, 0);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, hold + 800 - elapsed())));
    assert.equal(composeClosed, 1);

    const compose = require("../app/main/compose");
    state.composerHover = true;
    compose.releaseComposeNoteHold();
    assert.equal(composeClosed, 1);
    state.composerHover = false;
    compose.pointerLeftCompose();
    assert.equal(composeClosed, 2);
    state.composerHover = false;

    agent.runAgentTurn = async () => ({ source: "local", text: "嗯", displayName: "小鲸" });
    await voice.handleTranscribedText("在吗");
    const localIdle = sent.filter((e) => e.channel === "voice-state" && e.payload.state === "idle").pop();
    assert.equal(localIdle.payload.note || "", "");
    assert.notEqual(localIdle.payload.note, "来源：本地回复");
    const closedBeforeQuick = composeClosed;
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(composeClosed > closedBeforeQuick);

    agent.runAgentTurn = async () => ({
      source: "local",
      text: "嗯",
      displayName: "小鲸",
      fallbackNote: "还没填 DeepSeek Key，这次用本地回复",
    });
    await voice.handleTranscribedText("你好");
    const keyIdle = sent.filter((e) => e.name === "compose" && e.channel === "voice-state" && e.payload.note).pop();
    assert.equal(keyIdle.payload.note, "还没填 DeepSeek Key，这次用本地回复");
    const closedDuringKey = composeClosed;
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(composeClosed, closedDuringKey);
    compose.cancelComposeNoteHold();

    state.composeExpanded = true;
    const closedBeforeDraft = composeClosed;
    compose.holdComposeForNote(note);
    compose.releaseComposeNoteHold();
    assert.equal(composeClosed, closedBeforeDraft);
    assert.equal(state.composeExpanded, true);
    assert.equal(state.composeNoteText, "");
    assert.deepEqual(sent.filter((e) => e.name === "compose" && e.channel === "compose-note").pop().payload, { text: "", expiredNote: note });

    state.composeExpanded = false;
    compose.holdComposeForNote(note);
    compose.markComposeInteraction();
    state.composeHintText = "新的聊天错误";
    state.composeHintIsNote = false;
    compose.releaseComposeNoteHold();
    assert.equal(state.composeHintText, "新的聊天错误");
    assert.equal(state.composeNoteText, "");
    assert.deepEqual(sent.filter((e) => e.name === "compose" && e.channel === "compose-note").pop().payload, { text: "", expiredNote: note });

    state.composeExpanded = false;
    compose.holdComposeForNote(note);
    compose.markComposeInteraction();
    compose.releaseComposeNoteHold();
    assert.equal(composeClosed, closedBeforeDraft);
    assert.equal(state.composeExpanded, true);
    state.composeExpanded = false;

    const element = () => ({
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {},
      style: { setProperty() {} },
      textContent: "",
      value: "",
      focus() {},
      disabled: false,
    });
    const hintEl = element();
    hintEl.textContent = "stale";
    const ids = {
      input: element(),
      send: element(),
      hint: hintEl,
      card: element(),
      "open-compose": element(),
      "quick-mic": element(),
      "field-mic": element(),
    };
    global.document = {
      getElementById(id) {
        return ids[id] || element();
      },
      body: { classList: { add() {}, remove() {} } },
    };
    const voiceHandlers = [];
    global.window = {
      petApi: {
        onVoiceState(cb) {
          voiceHandlers.push(cb);
        },
        onComposeLayout() {},
        onComposeExpand() {},
        onComposeHint() {},
        setComposeHover() {},
        setComposeExpanded() {},
        setComposeHold() {},
      },
      PetHoldTalk: { bind() {}, TOO_SHORT: "短" },
      PetUserErrors: errors,
      PetVoicePresent: { presentVoiceState },
    };
    require("../app/renderer/compose.js");
    voiceHandlers[0]({ state: "transcribing" });
    assert.equal(hintEl.textContent, "");
    voiceHandlers[0]({ state: "idle", text: "今天天气怎么样", note });
    assert.equal(hintEl.textContent, note);
    voiceHandlers[0]({ state: "idle" });
    assert.equal(hintEl.textContent, "");

    const packsDir = path.join(root, "packs");
    const folder = path.join(packsDir, "a-folder");
    fs.mkdirSync(folder, { recursive: true });
    windows.rememberChosenImport(path.join(packsDir, "猫猫..v2.dpet"));
    windows.rememberChosenImport(folder);
    const remembered = fs.readFileSync(path.join(userData, "last-import-dir.txt"), "utf8");
    assert.equal(remembered, packsDir);
    assert.notEqual(remembered, folder);
    windows.clearLastImportDir();
    assert.equal(fs.existsSync(path.join(userData, "last-import-dir.txt")), false);

    fs.writeFileSync(
      path.join(userData, "settings.json"),
      JSON.stringify({ deepseekEnabled: true, deepseekApiKey: "sk-test-key-1234", packId: "xiao-jing" })
    );
    errors.resetReplyNotices();
    agent.runAgentTurn = async () => ({
      source: "local-fallback",
      text: "嗯",
      error: note,
      displayName: "小鲸",
    });
    await windows.runChatter();
    await windows.runChatter();
    const chatterFloats = sent.filter((e) => e.name === "pet" && e.channel === "float-text");
    assert.deepEqual(chatterFloats.map((e) => e.payload), [note]);

    const shown = [];
    require.cache[electronEntry].exports.dialog.showMessageBox = (opts) => shown.push(opts);
    state.tray = null;
    windows.finishImportedPack({
      id: "xiao-jing",
      name: "小鲸",
      persona: { displayName: "小鲸" },
      size: { width: 64, height: 64 },
    });
    windows.finishImportedPack({
      id: "whale-2",
      persona: { displayName: "鲸" },
      size: { width: 64, height: 64 },
    });
    windows.finishImportedPack({ id: "plain-pack", size: { width: 64, height: 64 } });
    assert.deepEqual(
      shown.map((item) => item.message),
      ["已导入并切换到「小鲸」", "已导入并切换到「鲸」", "已导入并切换到「新角色」"]
    );

    const { packWindowSize } = require("../app/main/pet-window");
    const narrow = packWindowSize({ size: { width: 1, height: 1 } });
    const whale = packWindowSize({ size: { width: 256, height: 256 } });
    assert.equal(whale.width, 288);
    const longestNotes = [
      errors.BALANCE_REPLY,
      errors.KEY_FORBIDDEN,
      errors.KEY_INVALID,
      errors.NETWORK_REPLY,
      errors.UNKNOWN_REPLY,
      errors.RATE_LIMIT,
      errors.TIMEOUT_REPLY,
      errors.MISSING_KEY_NOTE,
    ];
    for (const text of longestNotes) {
      const fit = layout.fitPetNote(text, narrow.width, narrow.height);
      assert.equal(fit.lines.join(""), text);
      assert.equal(fit.fits, true, text);
      const wide = layout.fitPetNote(text, whale.width, whale.height);
      assert.equal(wide.lines.join(""), text);
      assert.equal(wide.fits, true, text);
      const box = layout.composeNoteSize(text, 360);
      assert.equal(box.lines.join(""), text);
      assert.equal(box.fits, true);
      assert.ok(box.height >= 68);
    }
    const petWin = require("../app/main/pet-window");
    const uncut = errors.BALANCE_REPLY + errors.KEY_FORBIDDEN;
    petWin.floatText(uncut);
    assert.equal(sent.filter((e) => e.channel === "float-text").pop().payload, uncut);

    const stt = "语音识别出错，请再试一次";
    state.composeExpanded = false;
    const again = await voice.beginVoice("hotkey");
    voice.failTranscribe(again.sessionId, stt);
    const sttIdle = sent.filter((e) => e.channel === "voice-state" && e.payload.state === "idle").pop();
    assert.equal(sttIdle.payload.note, stt);
    assert.equal(sttIdle.payload.suppressPetFloat, true);
    assert.equal(sttIdle.payload.error, undefined);
    const sttFloats = [];
    presentVoiceState(sttIdle.payload, { floatText: (text) => sttFloats.push(text) });
    assert.deepEqual(sttFloats, []);
    const idleCount = sent.filter((e) => e.channel === "voice-state" && e.payload.state === "idle").length;
    assert.equal(voice.failTranscribe(again.sessionId, stt).ok, false);
    assert.equal(sent.filter((e) => e.channel === "voice-state" && e.payload.state === "idle").length, idleCount);
    const withoutCompose = await voice.beginVoice("hotkey");
    const savedCompose = state.composeWindow;
    state.composeWindow = null;
    voice.failTranscribe(withoutCompose.sessionId, stt);
    const petOnlyIdle = sent.filter((e) => e.name === "pet" && e.channel === "voice-state" && e.payload.state === "idle").pop();
    assert.equal(petOnlyIdle.payload.suppressPetFloat, false);
    const petOnlyFloats = [];
    presentVoiceState(petOnlyIdle.payload, { floatText: (text) => petOnlyFloats.push(text) });
    assert.deepEqual(petOnlyFloats, [stt]);
    state.composeWindow = savedCompose;
    require("../app/main/compose").cancelComposeNoteHold();
    const closedAtStt = composeClosed;
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(composeClosed, closedAtStt);
    const sttHints = [];
    presentVoiceState({ state: "idle", error: stt }, {
      setHint(text) {
        sttHints.push(text);
      },
    });
    assert.deepEqual(sttHints, [stt]);
  } finally {
    agent.runAgentTurn = originalTurn;
    if (previousElectron) require.cache[electronEntry] = previousElectron;
    else delete require.cache[electronEntry];
    delete global.document;
    delete global.window;
    state.petWindow = null;
    state.composeWindow = null;
    state.chatWindow = null;
    state.voiceBusy = false;
    state.composeVoicePin = false;
    state.composeNoteText = "";
    state.composeNoteUntilLeave = false;
    state.composerHover = false;
    require("../app/main/compose").cancelComposeNoteHold();
  }
});

test("local mode stays quiet and a missing key is mentioned once", async () => {
  errors.resetReplyNotices();
  const pack = {
    id: "xiao-jing",
    name: "小鲸",
    states: { idle: { frames: [] } },
    dialogue: { fallback: ["嗯"] },
    persona: { displayName: "小鲸" },
  };
  const userData = tmpDir();
  const off = await agent.runAgentTurn({
    pack,
    settings: { deepseekEnabled: false, deepseekApiKey: "", memoryEnabled: false, visionEnabled: false },
    userText: "你好",
    userData,
  });
  assert.equal(off.source, "local");
  assert.equal(off.fallbackNote, "");
  assert.equal(off.error, undefined);
  const first = await agent.runAgentTurn({
    pack,
    settings: { deepseekEnabled: true, deepseekApiKey: "", memoryEnabled: false, visionEnabled: false },
    userText: "你好",
    userData,
  });
  assert.equal(first.fallbackNote, "还没填 DeepSeek Key，这次用本地回复");
  const second = await agent.runAgentTurn({
    pack,
    settings: { deepseekEnabled: true, deepseekApiKey: "", memoryEnabled: false, visionEnabled: false },
    userText: "再来",
    userData,
  });
  assert.equal(second.fallbackNote, "");
  const unreadableDir = tmpDir();
  fs.writeFileSync(path.join(unreadableDir, "settings.json"), JSON.stringify({
    deepseekEnabled: true,
    deepseekApiKeyEnc: crypto.sealKey("sk-secret"),
  }));
  const unreadableSettings = settings.loadSettings(unreadableDir, brokenCrypto);
  assert.equal(settings.publicSettings(unreadableSettings).keyUnreadable, true);
  assert.match(errors.keyHintText(settings.publicSettings(unreadableSettings)), /已保存的 Key 暂时无法读取/);
  const unreadable = await agent.runAgentTurn({ pack, settings: unreadableSettings, userText: "你好", userData: unreadableDir });
  assert.equal(unreadable.reason, "unreadable-key");
  assert.equal(unreadable.fallbackNote, errors.UNREADABLE_KEY_NOTE);
  assert.doesNotMatch(unreadable.fallbackNote, /还没填|sk-secret/);
  const unreadableAgain = await agent.runAgentTurn({ pack, settings: unreadableSettings, userText: "再来", userData: unreadableDir });
  assert.equal(unreadableAgain.fallbackNote, "");
  const gate = errors.createNoteGate(1000);
  const network = errors.NETWORK_REPLY;
  assert.equal(gate(network, 0), network);
  assert.equal(gate(network, 500), "");
  assert.equal(gate(errors.TIMEOUT_REPLY, 500), errors.TIMEOUT_REPLY);
  assert.equal(gate(network, 1000), network);
});

test("a fallback note wraps inside the narrowest pet window and stays up", () => {
  const vm = require("vm");
  const layout = require("../app/lib/note-layout");
  const text = errors.BALANCE_REPLY;
  const delays = [];
  const timers = [];
  function makeEl() {
    return {
      className: "",
      textContent: "",
      children: [],
      listeners: {},
      appendChild(child) {
        this.children.push(child);
        child.parent = this;
        return child;
      },
      remove() {
        if (!this.parent) return;
        this.parent.children = this.parent.children.filter((child) => child !== this);
        this.parent = null;
      },
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      },
    };
  }
  const host = makeEl();
  const sandbox = {
    document: { createElement: () => makeEl() },
    window: { PetNoteLayout: layout },
    setTimeout(fn, ms) {
      delays.push(ms);
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    },
    clearTimeout,
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app", "renderer", "floater.js"), "utf8"), vm.createContext(sandbox), {
    filename: "floater.js",
  });
  const floater = sandbox.window.PetFloater.mount(host, {
    width: () => 96,
    height: () => 352,
  });
  try {
    floater.show(text);
    const node = host.children[0];
    const lines = node.children.map((child) => child.textContent);
    const plan = layout.fitPetNote(text, 96, 352);
    assert.deepEqual(lines, [text]);
    assert.equal(lines.join(""), text);
    assert.equal(plan.lines.join(""), text);
    assert.equal(plan.fits, true);
    assert.equal(delays[0], plan.holdMs);
    assert.ok(delays[0] > 2000);
    if (node.listeners.animationend) node.listeners.animationend();
    assert.equal(host.children[0], node);
  } finally {
    for (const id of timers) clearTimeout(id);
  }
});

test("chat and the compose bar show a fallback row only when there is a reason", async () => {
  const vm = require("vm");
  function element() {
    const handlers = {};
    return {
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, fn) {
        handlers[type] = fn;
      },
      click() {
        return handlers.click && handlers.click();
      },
      keydown(event) {
        return handlers.keydown && handlers.keydown(event);
      },
      emit(type) {
        return handlers[type] && handlers[type]();
      },
      style: { setProperty() {} },
      textContent: "",
      value: "",
      focus() {},
      disabled: false,
      className: "",
    };
  }
  const rows = [];
  const log = {
    appendChild(node) {
      rows.push(node);
    },
    scrollTop: 0,
    scrollHeight: 0,
    replaceChildren() {
      rows.length = 0;
    },
    querySelector() {
      return null;
    },
  };
  function rowEl() {
    return { className: "", textContent: "", classList: { add() {} } };
  }
  const ids = {
    log,
    input: element(),
    send: element(),
    mic: element(),
    who: element(),
    hint: element(),
  };
  const turns = [];
  const sandbox = {
    console,
    Promise,
    document: {
      getElementById(id) {
        return ids[id] || element();
      },
      createElement() {
        return rowEl();
      },
    },
    window: {
      petApi: {
        getBootstrap: async () => ({ pack: { persona: { displayName: "小鲸" } }, settings: {}, chatLog: [] }),
        onSettingsChanged() {},
        onThinking() {},
        onChatCleared() {},
        onChatTurn(cb) {
          turns.push(cb);
        },
        onVoiceState() {},
        onVoiceTranscript() {},
        setComposeHold() {},
        voiceStart: async () => ({ ok: true, sessionId: 1 }),
        voiceStop: async () => {},
        voiceCancel: async () => {},
        floatText() {},
      },
      PetHoldTalk: { bind() {}, TOO_SHORT: "短" },
      PetUserErrors: errors,
    },
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app", "renderer", "chat.js"), "utf8"), vm.createContext(sandbox), {
    filename: "chat.js",
  });
  await new Promise((resolve) => setImmediate(resolve));
  turns[0]({
    user: "你好",
    reply: {
      text: "嗯",
      displayName: "小鲸",
      source: "local-fallback",
      error: "回复超时了；这次先用本地回复",
    },
  });
  turns[0]({
    user: "在吗",
    reply: { text: "嗯", displayName: "小鲸", source: "local" },
  });
  turns[0]({
    user: "再来",
    reply: {
      text: "嗯",
      displayName: "小鲸",
      source: "local",
      reason: "missing-key",
      fallbackNote: "",
      usedVision: true,
    },
  });
  const metas = rows.filter((row) => String(row.className).includes("meta")).map((row) => row.textContent);
  assert.ok(metas.includes("回复超时了；这次先用本地回复"));
  assert.equal(metas.includes("来源：本地回复"), false);
  assert.equal(metas.includes("还没填 DeepSeek Key，这次用本地回复"), false);
  assert.ok(metas.includes("已查看屏幕，画面已发送"));

  const hintEl = element();
  const inputEl = element();
  const sendEl = element();
  const composeIds = {
    input: inputEl,
    send: sendEl,
    hint: hintEl,
    card: element(),
    "open-compose": element(),
    "quick-mic": element(),
    "field-mic": element(),
  };
  const composeSandbox = {
    console,
    Promise,
    hintSignals: [],
    expandedSignals: [],
    document: {
      getElementById(id) {
        return composeIds[id] || element();
      },
      body: { classList: { add() {}, remove() {} } },
    },
    window: {
      petApi: {
        onVoiceState() {},
        onComposeLayout() {},
        onComposeExpand() {},
        onComposeHint() {},
        onComposeNote(cb) {
          composeSandbox.note = cb;
        },
        setComposeHover() {},
        setComposeExpanded(value) {
          composeSandbox.expandedSignals.push(value);
        },
        setComposeHintText(value) {
          composeSandbox.hintSignals.push(value);
        },
        setComposeHold() {},
        chat: async () => composeSandbox.nextReply,
        floatText() {},
        voiceStart: async () => ({ ok: false }),
        voiceStop: async () => {},
        voiceCancel: async () => {},
      },
      PetHoldTalk: { bind() {}, TOO_SHORT: "短" },
      PetUserErrors: errors,
      PetVoicePresent: require("../app/renderer/voice-present"),
    },
  };
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "app", "renderer", "compose.js"), "utf8"),
    vm.createContext(composeSandbox),
    { filename: "compose.js" }
  );
  inputEl.value = "你好";
  composeSandbox.nextReply = { text: "嗯", source: "local", fallbackNote: "" };
  await sendEl.click();
  assert.equal(hintEl.textContent, "");
  inputEl.value = "你好";
  composeSandbox.nextReply = {
    text: "嗯",
    source: "local",
    fallbackNote: "还没填 DeepSeek Key，这次用本地回复",
  };
  await sendEl.click();
  assert.equal(hintEl.textContent, "还没填 DeepSeek Key，这次用本地回复");
  composeSandbox.document = composeSandbox.document;
  composeSandbox.note({ text: errors.BALANCE_REPLY });
  assert.equal(hintEl.textContent, errors.BALANCE_REPLY);
  assert.equal(composeSandbox.hintSignals.at(-1), errors.BALANCE_REPLY);
  assert.equal(composeSandbox.expandedSignals.length, 0);
  inputEl.value = "明天见";
  inputEl.emit("input");
  assert.deepEqual(composeSandbox.expandedSignals, [true]);
  composeSandbox.note({ text: "", expiredNote: errors.BALANCE_REPLY });
  assert.equal(composeSandbox.hintSignals.at(-1), "");
  assert.equal(inputEl.value, "明天见");
  composeSandbox.note({ text: errors.BALANCE_REPLY });
  inputEl.value = "新消息";
  composeSandbox.nextReply = { text: "嗯", source: "local", fallbackNote: "新的聊天错误" };
  await sendEl.click();
  composeSandbox.note({ text: "", expiredNote: errors.BALANCE_REPLY });
  assert.equal(hintEl.textContent, "新的聊天错误");
  assert.equal(composeSandbox.hintSignals.at(-1), "新的聊天错误");
});

test("model and microphone errors shown to the user are Chinese", () => {
  assert.equal(
    errors.userFacingError({ status: 401, message: "DeepSeek 401: invalid api key" }),
    "API Key 无效，请到设置里重新填写；这次先用本地回复"
  );
  assert.equal(
    errors.userFacingError({ status: 403, message: "forbidden" }),
    "没有权限访问 DeepSeek，请检查账号状态；这次先用本地回复"
  );
  const aborted = new Error("思考时间过长");
  aborted.name = "AbortError";
  assert.equal(errors.userFacingError(aborted), "回复超时了；这次先用本地回复");
  assert.equal(errors.userFacingError(new Error("思考时间过长")), "回复超时了；这次先用本地回复");
  assert.equal(
    errors.userFacingError(new Error("getaddrinfo ENOTFOUND api.deepseek.com")),
    "连不上 DeepSeek，请检查网络；这次先用本地回复"
  );
  assert.equal(
    errors.userFacingError({ status: 402, message: "Insufficient Balance" }),
    "DeepSeek 账户余额不足，请到 DeepSeek 开放平台充值；这次先用本地回复"
  );
  assert.equal(errors.userFacingError({ status: 429, message: "rate limit" }), "请求太频繁，稍等一下再试；这次先用本地回复");
  assert.equal(
    errors.userFacingError(new Error("DeepSeek 500: boom")),
    "没能从 DeepSeek 得到回复；这次先用本地回复"
  );
  assert.equal(
    errors.userFacingError(new Error("request failed with status 401")),
    "没能从 DeepSeek 得到回复；这次先用本地回复"
  );
  assert.equal(errors.userFacingError(new Error("想一下。")), "想一下；这次先用本地回复");
  assert.equal(errors.userFacingError(new Error("想一下！")), "想一下；这次先用本地回复");
  assert.equal(errors.userFacingError(new Error("想一下？")), "想一下；这次先用本地回复");
  assert.equal(errors.TIMEOUT_REPLY, "回复超时了；这次先用本地回复");
  assert.equal(errors.UNKNOWN_REPLY, "没能从 DeepSeek 得到回复；这次先用本地回复");
  assert.equal(
    errors.replyFallbackNote({ source: "local-fallback", error: "回复超时了；这次先用本地回复" }),
    "回复超时了；这次先用本地回复"
  );
  assert.equal(errors.replyFallbackNote({ source: "local", text: "嗯" }), "");
  assert.equal(errors.replyFallbackNote({ source: "deepseek", error: "nope" }), "");
  for (const sample of [
    { status: 401, message: "invalid api key" },
    { status: 403, message: "forbidden" },
    { status: 429, message: "rate limit" },
    { status: 402, message: "Insufficient Balance" },
    aborted,
    new Error("getaddrinfo ENOTFOUND api.deepseek.com"),
    new Error("DeepSeek 500: boom"),
    Object.assign(new Error("response body exceeded limit"), { code: "EMAXBODY" }),
    new Error("missing api key"),
  ]) {
    const shown = errors.userFacingError(sample);
    assert.match(shown, /本地回复/);
    assert.match(shown, /这次先用本地回复/);
    assert.doesNotMatch(shown, /这次没能回复，请再试一次/);
  }
  assert.equal(
    errors.micFailureMessage({ name: "NotAllowedError" }),
    "麦克风权限被拒绝，请打开 设置 → 隐私和安全性 → 麦克风，开启“麦克风访问”和“允许桌面应用访问麦克风”"
  );
  assert.equal(errors.micFailureMessage({ name: "NotFoundError" }), "没有检测到麦克风，请插上耳机或麦克风后再试");
  assert.equal(
    errors.micFailureMessage({ name: "NotReadableError" }),
    "麦克风正被其他程序占用（如会议软件），关闭后再试"
  );
  assert.equal(errors.TOO_EARLY, "没听清，按住稍久一点再说");
  assert.equal(errors.VOICE_PROCESS_FAILED, "语音处理出错，请再试一次");
  assert.equal(errors.sttFailureMessage(new Error("语音组件未随安装包提供，请重新安装桌宠。")), "语音组件损坏，请重新安装桌宠");
  assert.equal(
    errors.sttFailureMessage(new Error("ENOENT: no such file model.int8.onnx")),
    "语音组件损坏，请重新安装桌宠"
  );
  assert.equal(errors.sttFailureMessage(new Error("ENOENT: open C:\\temp\\note.wav")), "语音识别出错，请再试一次");
  assert.equal(errors.sttFailureMessage(new Error("语音识别超时")), "识别超时，请再说一次");
  assert.equal(errors.sttFailureMessage(new Error("SenseVoice 启动超时")), "识别超时，请再说一次");
  assert.equal(errors.sttFailureMessage(new Error("sherpa worker exited")), "语音识别出错，请再试一次");
  const plain = errors.keyHintText({ keyStorage: "plaintext", deepseekApiKeyMasked: "sk-ab…wxyz" });
  assert.equal(
    plain,
    "已保存 Key：sk-ab…wxyz。这台电脑不支持系统加密，Key 以明文保存在本机；不放心可以点“清除 API Key”。"
  );
  assert.doesNotMatch(plain, /不明文存放/);
  const none = errors.keyHintText({ keyStorage: "none", encryptionAvailable: false });
  assert.doesNotMatch(none, /会用系统加密保存/);
  assert.match(none, /系统加密不可用/);
  assert.match(errors.keyHintText({ keyStorage: "none", encryptionAvailable: true }), /会用系统加密保存/);
  assert.equal(
    errors.displaySaveError(new Error("Error invoking remote method 'save-settings': Error: 系统加密不可用，无法保存 API Key。已保存：没有其他改动。未保存：API Key。")),
    "系统加密不可用，无法保存 API Key。已保存：没有其他改动。未保存：API Key。"
  );
  assert.equal(errors.fieldLabel("notARealField"), "其他设置");
  assert.equal(
    errors.userFacingError(Object.assign(new Error("response body exceeded limit"), { code: "EMAXBODY" })),
    "没能从 DeepSeek 得到回复；这次先用本地回复"
  );
});

test("import failure restores a pack that was already there", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  packFixture(src, "ok-pack");
  const archive = path.join(parent, "ok.dpet");
  dpet.encryptDir(src, archive);
  const imported = path.join(parent, "imported");
  const cache = path.join(parent, "cache");
  fs.mkdirSync(imported, { recursive: true });
  const dest = path.join(imported, "ok.dpet");
  fs.writeFileSync(dest, Buffer.from("previous-good-pack"));
  assert.throws(
    () =>
      packs.importDpet(archive, imported, cache, {
        rmSync() {
          throw new Error("导入中断");
        },
      }),
    /导入中断/
  );
  assert.equal(fs.readFileSync(dest, "utf8"), "previous-good-pack");
});

test("rejected marker is only for permanent pack failures", () => {
  const parent = tmpDir();
  const cache = path.join(parent, "cache");
  fs.mkdirSync(cache);
  const dest = path.join(cache, "half");
  fs.mkdirSync(dest);
  assert.equal(packs.rememberPackFailure(dest, Object.assign(new Error("disk"), { code: "EIO" })), false);
  assert.equal(fs.existsSync(`${dest}.rejected`), false);
  const bad = path.join(parent, "bad.dpet");
  fs.writeFileSync(bad, Buffer.from("nope-not-a-pack"));
  assert.throws(() => packs.readDpetPack(bad, cache), /这个角色包无法使用，请向角色包作者重新获取/);
  assert.equal(fs.existsSync(path.join(cache, packs.cacheKeyForDpet(bad)) + ".rejected"), true);

  const locked = path.join(parent, "locked.dpet");
  fs.writeFileSync(locked, Buffer.from("secret-pack-bytes"));
  denyRead(locked);
  try {
    let probe;
    try {
      fs.readFileSync(locked);
    } catch (err) {
      probe = err;
    }
    assert.ok(probe && (probe.code === "EACCES" || probe.code === "EPERM"), probe && probe.code);
    let caught;
    try {
      packs.readDpetPack(locked, cache);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught);
    assert.ok(caught.code === "EACCES" || caught.code === "EPERM", caught.code);
    assert.notEqual(caught.code, "EISDIR");
    assert.equal(fs.existsSync(path.join(cache, packs.cacheKeyForDpet(locked)) + ".rejected"), false);
  } finally {
    allowRead(locked);
  }
});

function denyRead(file) {
  if (process.platform === "win32") {
    const { execFileSync } = require("child_process");
    execFileSync("icacls", [file, "/inheritance:r", "/deny", "*S-1-1-0:(R)"], { stdio: "pipe" });
    return;
  }
  fs.chmodSync(file, 0);
}

function allowRead(file) {
  if (process.platform === "win32") {
    const { execFileSync } = require("child_process");
    try {
      execFileSync("icacls", [file, "/grant", "*S-1-1-0:(F)"], { stdio: "pipe" });
    } catch (_) {}
    return;
  }
  try {
    fs.chmodSync(file, 0o644);
  } catch (_) {}
}

test("startup clears leftover import and unpack directories", () => {
  const cache = tmpDir();
  fs.mkdirSync(path.join(cache, ".import-abc"));
  fs.mkdirSync(path.join(cache, ".unpack-def"));
  fs.mkdirSync(path.join(cache, "keep-me"));
  fs.writeFileSync(path.join(cache, "old.dpet.bak-import"), "leftover");
  fs.writeFileSync(path.join(cache, "half.dpet.partial"), "partial");
  fs.writeFileSync(path.join(cache, "notes.partial"), "keep-other");
  packs.cleanStagingDirs(cache);
  assert.equal(fs.existsSync(path.join(cache, ".import-abc")), false);
  assert.equal(fs.existsSync(path.join(cache, ".unpack-def")), false);
  assert.equal(fs.existsSync(path.join(cache, "old.dpet.bak-import")), false);
  assert.equal(fs.existsSync(path.join(cache, "half.dpet.partial")), false);
  assert.equal(fs.existsSync(path.join(cache, "notes.partial")), true);
  assert.equal(fs.existsSync(path.join(cache, "keep-me")), true);
});

test("a busy leftover file does not stop the pack list", () => {
  const parent = tmpDir();
  const cache = path.join(parent, "cache");
  fs.mkdirSync(cache);
  const locked = path.join(cache, "half.dpet.partial");
  fs.writeFileSync(locked, "partial");
  const orig = fs.rmSync;
  const warnings = [];
  const origWarn = console.warn;
  fs.rmSync = () => {
    const err = new Error("resource busy");
    err.code = "EBUSY";
    throw err;
  };
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    assert.doesNotThrow(() => packs.listPacksFromDirs([parent], { cacheDir: cache }));
  } finally {
    fs.rmSync = orig;
    console.warn = origWarn;
  }
  assert.equal(fs.existsSync(locked), true);
  assert.match(warnings.join("\n"), /EBUSY/);
});

test("a pack file whose name contains two dots still imports", () => {
  const parent = tmpDir();
  const src = path.join(parent, "src");
  packFixture(src, "ok-pack");
  const archive = path.join(parent, "猫猫..v2.dpet");
  dpet.encryptDir(src, archive);
  const imported = path.join(parent, "imported");
  const cache = path.join(parent, "cache");
  const pack = packs.importDpet(archive, imported, cache);
  assert.equal(pack.id, "ok-pack");
  assert.equal(fs.existsSync(path.join(imported, "猫猫..v2.dpet")), true);
});

test("response body stays tied to the abort signal", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"choices":[');
  });
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
  assert.ok(Date.now() - started < 2000);
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test("response body reads stop at the size cap", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    const timer = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(timer);
        return;
      }
      res.write(chunk);
    }, 5);
    res.on("close", () => clearInterval(timer));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const started = Date.now();
  await assert.rejects(
    () =>
      deepseek.chatCompletions({
        apiKey: "sk-test",
        baseUrl: `http://127.0.0.1:${port}`,
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 30000,
      }),
    (err) => {
      assert.equal(err.code, "EMAXBODY");
      return true;
    }
  );
  assert.ok(Date.now() - started < 10000);
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test("pinned unpackers extract zip, tar.gz, and bzip2 without leaving the archive", async () => {
  const parent = tmpDir();
  const zip = path.join(__dirname, "fixtures", "node-mini.zip");
  const exe = path.join(parent, "node.exe");
  const license = path.join(parent, "nodejs-LICENSE");
  await vendor.readZipFiles(zip, (name) => {
    if (name.endsWith("/node.exe")) return exe;
    if (name.endsWith("/LICENSE")) return license;
    return null;
  });
  assert.equal(fs.readFileSync(exe, "utf8"), "MZ-fake-node");
  assert.match(fs.readFileSync(license, "utf8"), /MIT/);

  const pkgRoot = path.join(parent, "pkg");
  fs.mkdirSync(path.join(pkgRoot, "package"), { recursive: true });
  fs.writeFileSync(path.join(pkgRoot, "package", "sherpa-onnx.js"), "module.exports = {};\n");
  const tgz = path.join(parent, "pkg.tgz");
  await tar.c({ gzip: true, file: tgz, cwd: pkgRoot }, ["package"]);
  const unpacked = path.join(parent, "unpacked");
  await vendor.extractPackage(tgz, unpacked);
  assert.equal(fs.existsSync(path.join(unpacked, "sherpa-onnx.js")), true);

  const model = path.join(parent, "model");
  fs.mkdirSync(model);
  await vendor.extractBz2Files(path.join(__dirname, "fixtures", "model-mini.tar.bz2"), (base) => {
    if (base === "model.int8.onnx" || base === "tokens.txt" || base.toLowerCase() === "readme.md") {
      return path.join(model, base);
    }
    return null;
  });
  assert.equal(fs.readFileSync(path.join(model, "tokens.txt"), "utf8"), "tok\n");
  assert.match(fs.readFileSync(path.join(model, "README.md"), "utf8"), /readme/);
});

test("tray uses a packaged ico on Windows and png elsewhere", () => {
  const files = trayIconFiles("/app");
  const slash = (file) => file.replace(/\\/g, "/");
  assert.match(slash(files.ico), /\/assets\/tray\/tray\.ico$/);
  assert.match(slash(files.png2x), /\/assets\/tray\/tray@2x\.png$/);
  assert.doesNotMatch(slash(files.ico), /\/build\//);
  const win = selectTrayAssets(
    { ico: "tray.ico", png: "tray.png", png2x: "tray@2x.png" },
    { platform: "win32", exists: () => true }
  );
  assert.equal(win.useIco, true);
  assert.equal(win.primary, "tray.ico");
  assert.equal(win.includeHiDpi, undefined);
  const lo = selectTrayAssets(
    { ico: "tray.ico", png: "tray.png", png2x: "tray@2x.png" },
    { platform: "linux", exists: () => true }
  );
  assert.equal(lo.useIco, false);
  assert.equal(lo.primary, "tray.png");
  const root = path.join(__dirname, "..");
  const ico = icons.icoDirectory(fs.readFileSync(path.join(root, "app", "assets", "tray", "tray.ico")));
  const widths = ico.map((img) => img.width);
  for (const size of icons.ICON_SIZES) assert.ok(widths.includes(size), String(size));
  assert.ok(widths.includes(20));
  assert.ok(widths.includes(40));
  assert.deepEqual(icons.pngSize(path.join(root, "app", "assets", "tray", "tray.png")), { width: 16, height: 16 });
  assert.deepEqual(icons.pngSize(path.join(root, "app", "assets", "tray", "tray@2x.png")), { width: 32, height: 32 });
  assert.equal(icons.pngSize(fallbackTrayPng()).width, 16);
  const traySrc = fs.readFileSync(path.join(root, "app", "main", "tray.js"), "utf8");
  assert.match(traySrc, /display-metrics-changed/);
  assert.doesNotMatch(traySrc, /addRepresentation/);
  assert.doesNotMatch(traySrc, /scaleFactor/);
  assert.equal(fs.existsSync(path.join(root, "app", "tray.ico")), false);
  assert.equal(fs.existsSync(path.join(root, "app", "tray.png")), false);
  assert.deepEqual(notices.TRAY_ASAR, ["assets/tray/tray.ico", "assets/tray/tray.png", "assets/tray/tray@2x.png"]);
  assert.equal(voiceReleaseTooSoon("hotkey", 1000, 1400), true);
  assert.equal(voiceReleaseTooSoon("hotkey", 1000, 1600), false);
  assert.equal(voiceReleaseTooSoon("hold", 1000, 1100), false);
});

test("bold is synthesized and emoji precede the generic family", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "app", "renderer", "fonts.css"), "utf8");
  assert.equal(css.includes("font-weight: 500"), false);
  assert.equal(css.includes("font-weight: 700"), false);
  assert.match(css, /font-weight: 400/);
  assert.match(css, /font-display:\s*swap/);
  assert.match(css, /"Segoe UI Emoji", system-ui/);
  const pet = fs.readFileSync(path.join(__dirname, "..", "app", "renderer", "pet.css"), "utf8");
  assert.match(pet, /font:\s*700/);
  assert.ok(pet.endsWith("\n"));
  assert.equal(pet.startsWith(" "), false);
  assert.equal(/[ \t]$/m.test(pet), false);
  const compose = fs.readFileSync(path.join(__dirname, "..", "app", "renderer", "compose.css"), "utf8");
  assert.equal(compose.startsWith(" "), false);
  assert.ok(compose.endsWith("\n"));
  assert.equal(/[ \t]$/m.test(compose), false);
});

test("NOTICE license files are all checked at package time", () => {
  const notice = fs.readFileSync(path.join(__dirname, "..", "NOTICE"), "utf8");
  assert.deepEqual(notices.unmappedNoticeTokens(notice), []);
  assert.match(notice, /sensevoice-LICENSE/);
  assert.match(notice, /funasr-MODEL_LICENSE/);
  assert.match(notice, /FunASR Model Open Source License Agreement v1\.1/);
  assert.match(notice, /58830eca4012644aac0c3218c3ccc7d98f003fda/);
  assert.equal(vendor.ASSETS.funasrModelLicense.sha256, "7dba975a2069691db4992b0592d70828b330d2f8a30a71450f4e152a554e84f8");
});
