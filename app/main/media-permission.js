const path = require("path");

function filePathFromUrl(requestingUrl) {
  let parsed;
  try {
    parsed = new URL(String(requestingUrl || ""));
  } catch {
    return "";
  }
  if (parsed.protocol !== "file:") return "";
  let pathname = decodeURIComponent(parsed.pathname);
  if (process.platform === "win32" && /^\/[A-Za-z]:/.test(pathname)) {
    pathname = pathname.slice(1);
  }
  return path.normalize(pathname);
}

function isInsideDir(filePath, appDir) {
  if (!filePath || !appDir) return false;
  const root = path.normalize(appDir);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return filePath === root || filePath.startsWith(prefix);
}

/**
 * Grant microphone access only for this app's own file:// pages, and only
 * when every requested media type is audio.
 */
function allowAppAudio({ permission, requestingUrl, mediaTypes, appDir, isAppWindow }) {
  const mic =
    permission === "media" || permission === "microphone" || permission === "audioCapture";
  if (!mic || !isAppWindow) return false;
  const filePath = filePathFromUrl(requestingUrl);
  if (!isInsideDir(filePath, appDir)) return false;
  if (Array.isArray(mediaTypes)) {
    return mediaTypes.length > 0 && mediaTypes.every((kind) => kind === "audio");
  }
  return permission !== "media";
}

module.exports = { allowAppAudio, filePathFromUrl, isInsideDir };
