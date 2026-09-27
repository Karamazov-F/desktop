/**
 * Encrypted character pack (.dpet)
 *
 * Layout:
 *   magic[4] = "DPET"
 *   version[1] = 1
 *   headerLen[4] LE
 *   header JSON { alg, kdf, salt, id, name, version, size }
 *   iv[12]
 *   ciphertext (gzip of DP01 payload)
 *   tag[16]
 *
 * Payload DP01:
 *   magic[4] = "DP01"
 *   count[4] LE
 *   repeated: nameLen[2] LE, name utf8, dataLen[4] LE, bytes
 *
 * This is distribution wrapping (stops casual unzip), not strong DRM.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { resolveInside } = require("./safe-path");

const MAGIC = Buffer.from("DPET");
const PAYLOAD_MAGIC = Buffer.from("DP01");
const VERSION = 1;
const INFO = Buffer.from("dpet-v1");
const MAX_ENTRIES = 10000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const COMPLETE_MARKER = ".dpet-complete";

function wrapKey() {
  return crypto.createHash("sha256").update("desktop-pet-custom.dpet.v1").digest();
}

function deriveKey(salt) {
  return crypto.hkdfSync("sha256", wrapKey(), salt, INFO, 32);
}

const SKIP_DIR = new Set(["_author", "node_modules", ".git"]);

function collectFiles(dir, base = dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    if (SKIP_DIR.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) collectFiles(abs, base, acc);
    else if (ent.isFile()) {
      const rel = path.relative(base, abs).replace(/\\/g, "/");
      acc.push({ rel, abs });
    }
  }
  return acc;
}

function encodePayload(files) {
  const parts = [PAYLOAD_MAGIC, Buffer.alloc(4)];
  parts[1].writeUInt32LE(files.length, 0);
  for (const f of files) {
    const name = Buffer.from(f.rel, "utf8");
    const data = Buffer.isBuffer(f.data) ? f.data : fs.readFileSync(f.abs);
    const nameLen = Buffer.alloc(2);
    nameLen.writeUInt16LE(name.length, 0);
    const dataLen = Buffer.alloc(4);
    dataLen.writeUInt32LE(data.length, 0);
    parts.push(nameLen, name, dataLen, data);
  }
  return Buffer.concat(parts);
}

function need(buf, off, len) {
  if (!Number.isInteger(len) || len < 0 || off < 0 || off + len > buf.length) {
    throw new Error("角色包内容无效");
  }
}

function decodePayload(buf) {
  if (buf.length < 8 || buf.subarray(0, 4).toString("binary") !== PAYLOAD_MAGIC.toString("binary")) {
    throw new Error("角色包文件已损坏");
  }
  const count = buf.readUInt32LE(4);
  if (count > MAX_ENTRIES) throw new Error("角色包文件过多，已拒绝导入");
  let off = 8;
  let total = 0;
  const files = [];
  for (let i = 0; i < count; i++) {
    need(buf, off, 2);
    const nameLen = buf.readUInt16LE(off);
    off += 2;
    if (nameLen > 512) throw new Error("角色包包含非法路径，已拒绝导入");
    need(buf, off, nameLen);
    const rel = buf.subarray(off, off + nameLen).toString("utf8");
    off += nameLen;
    need(buf, off, 4);
    const dataLen = buf.readUInt32LE(off);
    off += 4;
    if (dataLen > MAX_FILE_BYTES) throw new Error("角色包内文件过大，已拒绝导入");
    total += dataLen;
    if (total > MAX_OUTPUT_BYTES) throw new Error("角色包过大，已拒绝导入");
    need(buf, off, dataLen);
    const data = Buffer.from(buf.subarray(off, off + dataLen));
    off += dataLen;
    files.push({ rel, data });
  }
  return files;
}

function gunzipLimited(gz, maxOutputLength = MAX_OUTPUT_BYTES) {
  return zlib.gunzipSync(gz, { maxOutputLength });
}

function encryptFiles(files, destPath, meta = {}) {
  const headerObj = {
    alg: "aes-256-gcm",
    kdf: "hkdf-sha256",
    salt: "",
    id: meta.id || "pack",
    name: meta.name || "",
    version: meta.version || "1.0.0",
    size: meta.size || { width: 128, height: 128 },
  };
  const salt = crypto.randomBytes(16);
  headerObj.salt = salt.toString("base64");
  const header = Buffer.from(JSON.stringify(headerObj), "utf8");
  const gz = zlib.gzipSync(encodePayload(files));
  const iv = crypto.randomBytes(12);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(gz), cipher.final()]);
  const tag = cipher.getAuthTag();
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32LE(header.length, 0);
  const out = Buffer.concat([
    MAGIC,
    Buffer.from([VERSION]),
    headerLen,
    header,
    iv,
    ciphertext,
    tag,
  ]);
  if (destPath) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, out);
  }
  return { buffer: out, header: headerObj, path: destPath };
}

function encryptDir(dir, destPath, meta = {}) {
  const collected = collectFiles(dir);
  if (!collected.some((f) => f.rel === "pack.json")) {
    throw new Error("角色包缺少 pack.json");
  }
  const rawJson = JSON.parse(fs.readFileSync(path.join(dir, "pack.json"), "utf8"));
  const files = collected.map((f) => ({
    rel: f.rel,
    data: fs.readFileSync(f.abs),
  }));
  return encryptFiles(files, destPath, {
    id: meta.id || rawJson.id || path.basename(dir),
    name: meta.name || rawJson.name || rawJson.persona?.displayName || "",
    version: meta.version || rawJson.version || "1.0.0",
    size: rawJson.size || { width: 128, height: 128 },
  });
}

function parseArchive(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.length < 9 || buf.subarray(0, 4).toString("binary") !== MAGIC.toString("binary")) {
    throw new Error("不是有效的角色包文件");
  }
  const version = buf[4];
  if (version !== VERSION) throw new Error("不支持的角色包版本");
  const headerLen = buf.readUInt32LE(5);
  let off = 9;
  let header;
  try {
    header = JSON.parse(buf.subarray(off, off + headerLen).toString("utf8"));
  } catch {
    throw new Error("角色包文件已损坏");
  }
  off += headerLen;
  const iv = buf.subarray(off, off + 12);
  off += 12;
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(off, buf.length - 16);
  let gz;
  try {
    const salt = Buffer.from(header.salt, "base64");
    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    gz = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("角色包文件已损坏");
  }
  const payload = gunzipLimited(gz);
  const files = decodePayload(payload);
  return { header, files };
}

function decryptToDir(srcPath, destDir) {
  const parsed = parseArchive(fs.readFileSync(srcPath));
  const parent = path.dirname(path.resolve(destDir));
  fs.mkdirSync(parent, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(parent, ".unpack-"));
  try {
    const writes = [];
    for (const f of parsed.files) {
      writes.push({ abs: resolveInside(tmp, f.rel), data: f.data });
    }
    for (const file of writes) {
      fs.mkdirSync(path.dirname(file.abs), { recursive: true });
      fs.writeFileSync(file.abs, file.data);
    }
    if (!fs.existsSync(path.join(tmp, "pack.json"))) {
      throw new Error("角色包无效");
    }
    fs.writeFileSync(path.join(tmp, COMPLETE_MARKER), "1");
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.renameSync(tmp, destDir);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
  return { dir: destDir, header: parsed.header };
}

function isDpetFile(filePath) {
  return String(filePath || "").toLowerCase().endsWith(".dpet");
}

module.exports = {
  encryptDir,
  encryptFiles,
  decryptToDir,
  parseArchive,
  decodePayload,
  gunzipLimited,
  isDpetFile,
  collectFiles,
  MAX_ENTRIES,
  MAX_FILE_BYTES,
  MAX_OUTPUT_BYTES,
  COMPLETE_MARKER,
};
