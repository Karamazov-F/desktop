const path = require("path");

const PACK_ID_RE = /^[a-z0-9_-]{1,64}$/;
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const BAD_PATH = "角色包包含非法路径，已拒绝导入";

function isSafePackId(id) {
  return typeof id === "string" && PACK_ID_RE.test(id);
}

function badSegment(part) {
  if (!part || part === "." || part === "..") return true;
  if (part.includes(":") || part.endsWith(".") || part.endsWith(" ")) return true;
  if (RESERVED_NAME.test(part)) return true;
  return false;
}

/**
 * Resolve `rel` inside `destDir`. Rejects `..`, absolute paths, drive
 * letters, UNC paths, NTFS alternate streams, reserved device names, and
 * trailing dots or spaces. A name like `..foo.png` is a normal file name.
 */
function resolveInside(destDir, rel) {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 512 || rel.includes("\0")) {
    throw new Error(BAD_PATH);
  }
  const norm = rel.replace(/\\/g, "/");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm) || norm.startsWith("//")) {
    throw new Error(BAD_PATH);
  }
  const parts = norm.split("/");
  if (parts.some(badSegment)) throw new Error(BAD_PATH);
  const root = path.resolve(destDir);
  const abs = path.resolve(root, ...parts);
  const relOut = path.relative(root, abs);
  const escapes =
    !relOut ||
    relOut === ".." ||
    relOut.startsWith(`..${path.sep}`) ||
    relOut.startsWith("../") ||
    path.isAbsolute(relOut);
  if (escapes) throw new Error(BAD_PATH);
  return abs;
}

module.exports = {
  PACK_ID_RE,
  isSafePackId,
  resolveInside,
};
