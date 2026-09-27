const path = require("path");

const PACK_ID_RE = /^[a-z0-9_-]{1,64}$/;

function isSafePackId(id) {
  return typeof id === "string" && PACK_ID_RE.test(id);
}

/**
 * Resolve `rel` inside `destDir`. Rejects `..`, absolute paths, drive
 * letters, and UNC paths on both Windows and POSIX.
 */
function resolveInside(destDir, rel) {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 512 || rel.includes("\0")) {
    throw new Error("角色包包含非法路径，已拒绝导入");
  }
  const norm = rel.replace(/\\/g, "/");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm) || norm.startsWith("//")) {
    throw new Error("角色包包含非法路径，已拒绝导入");
  }
  const parts = norm.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("角色包包含非法路径，已拒绝导入");
  }
  const root = path.resolve(destDir);
  const abs = path.resolve(root, ...parts);
  const relOut = path.relative(root, abs);
  if (!relOut || relOut.startsWith("..") || path.isAbsolute(relOut)) {
    throw new Error("角色包包含非法路径，已拒绝导入");
  }
  return abs;
}

module.exports = {
  PACK_ID_RE,
  isSafePackId,
  resolveInside,
};
