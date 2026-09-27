const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const settings = require("../app/lib/settings");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pet-settings-"));
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

test("saveSettings writes the API key only as ciphertext", () => {
  const dir = tmpDir();
  const saved = settings.saveSettings(
    dir,
    { deepseekApiKey: "sk-test-secret", deepseekEnabled: true },
    crypto
  );
  const disk = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  assert.equal(disk.deepseekApiKey, undefined);
  assert.equal(typeof disk.deepseekApiKeyEnc, "string");
  assert.equal(disk.deepseekApiKeyEnc.includes("sk-test-secret"), false);
  assert.equal(saved.deepseekApiKey, "sk-test-secret");
  const pub = settings.publicSettings(saved);
  assert.equal(pub.deepseekApiKey, undefined);
  assert.equal(pub.deepseekApiKeyEnc, undefined);
  assert.equal(pub.hasDeepseekKey, true);
});

test("loadSettings migrates a legacy plaintext API key", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "settings.json"),
    JSON.stringify({ deepseekApiKey: "sk-old-plain", memoryEnabled: true })
  );
  const loaded = settings.loadSettings(dir, crypto);
  assert.equal(loaded.deepseekApiKey, "sk-old-plain");
  const disk = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  assert.equal(disk.deepseekApiKey, undefined);
  assert.ok(disk.deepseekApiKeyEnc);
  assert.equal(disk.memoryEnabled, true);
});

test("deepseekBaseUrl must be https on the allowlist", () => {
  const dir = tmpDir();
  assert.throws(
    () => settings.saveSettings(dir, { deepseekBaseUrl: "http://api.deepseek.com" }, crypto),
    /https/
  );
  assert.throws(
    () => settings.saveSettings(dir, { deepseekBaseUrl: "https://evil.example/api" }, crypto),
    /api\.deepseek\.com/
  );
  assert.throws(
    () => settings.saveSettings(dir, { deepseekBaseUrl: "not a url" }, crypto),
    /无效/
  );
  const saved = settings.saveSettings(
    dir,
    { deepseekBaseUrl: "https://api.deepseek.com/v1" },
    crypto
  );
  assert.equal(saved.deepseekBaseUrl, "https://api.deepseek.com");
});

test("saveSettings drops unknown keys and rejects an unsafe pack id", () => {
  const dir = tmpDir();
  const saved = settings.saveSettings(
    dir,
    { alwaysOnTop: false, injected: "nope", deepseekModel: "deepseek-chat" },
    crypto
  );
  assert.equal(saved.injected, undefined);
  assert.equal(saved.deepseekModel, "deepseek-chat");
  assert.equal(saved.alwaysOnTop, false);
  const disk = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  assert.equal(disk.injected, undefined);
  assert.throws(() => settings.saveSettings(dir, { packId: "../x" }, crypto), /id/);
  assert.throws(
    () => settings.saveSettings(dir, { deepseekModel: "bad model" }, crypto),
    /模型/
  );
});
