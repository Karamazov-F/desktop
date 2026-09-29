const path = require("path");

function pathApi(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

function filePathFromUrl(requestingUrl, platform = process.platform) {
  let parsed;
  try {
    parsed = new URL(String(requestingUrl || ""));
  } catch {
    return "";
  }
  if (parsed.protocol !== "file:") return "";
  let pathname = decodeURIComponent(parsed.pathname);
  if (platform === "win32" && /^\/[A-Za-z]:/.test(pathname)) {
    pathname = pathname.slice(1);
  }
  return pathApi(platform).normalize(pathname);
}

function isInsideDir(filePath, appDir, platform = process.platform) {
  if (!filePath || !appDir) return false;
  const api = pathApi(platform);
  let file = api.normalize(String(filePath));
  let root = api.normalize(String(appDir));
  if (platform === "win32") {
    file = file.toLowerCase();
    root = root.toLowerCase();
  }
  const prefix = root.endsWith(api.sep) ? root : root + api.sep;
  return file === root || file.startsWith(prefix);
}

/**
 * Grant microphone access only for this app's own file:// pages.
 * Permission requests carry mediaTypes (array). Permission checks carry
 * mediaType (singular). A check for "media" without mediaType is denied.
 */
function allowAppAudio({
  permission,
  requestingUrl,
  mediaTypes,
  mediaType,
  appDir,
  isAppWindow,
  platform = process.platform,
}) {
  const mic =
    permission === "media" || permission === "microphone" || permission === "audioCapture";
  if (!mic || !isAppWindow) return false;
  const filePath = filePathFromUrl(requestingUrl, platform);
  if (!isInsideDir(filePath, appDir, platform)) return false;
  if (Array.isArray(mediaTypes)) {
    return mediaTypes.length > 0 && mediaTypes.every((kind) => kind === "audio");
  }
  if (permission === "media") return mediaType === "audio";
  return true;
}

module.exports = { allowAppAudio, filePathFromUrl, isInsideDir };
