/**
 * After electron-builder, every license file named in NOTICE must exist
 * in win-unpacked (on disk or inside app.asar).
 *
 *   node scripts/assert-packaged-notices.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NOTICE_PATH = path.join(ROOT, "NOTICE");
const UNPACKED = path.join(ROOT, "app", "dist", "win-unpacked");

const REQUIRED = [
  { label: "nodejs-LICENSE", file: "resources/voice/licenses/nodejs-LICENSE" },
  { label: "sherpa-onnx-LICENSE", file: "resources/voice/licenses/sherpa-onnx-LICENSE" },
  { label: "onnxruntime-LICENSE", file: "resources/voice/licenses/onnxruntime-LICENSE" },
  { label: "sensevoice-README.md", file: "resources/voice/licenses/sensevoice-README.md" },
  { label: "sensevoice-LICENSE", file: "resources/voice/licenses/sensevoice-LICENSE" },
  { label: "funasr-MODEL_LICENSE", file: "resources/voice/licenses/funasr-MODEL_LICENSE" },
  { label: "koffi-LICENSE.txt", file: "resources/licenses/koffi-LICENSE.txt" },
  { label: "LICENSE.electron.txt", file: "LICENSE.electron.txt" },
  { label: "LICENSES.chromium.html", file: "LICENSES.chromium.html" },
  { label: "OFL-LXGWWenKai.txt", asar: "renderer/fonts/OFL-LXGWWenKai.txt" },
  { label: "LXGWWenKai-Regular.woff2", asar: "renderer/fonts/LXGWWenKai-Regular.woff2" },
];

const TRAY_ASAR = ["assets/tray/tray.ico", "assets/tray/tray.png", "assets/tray/tray@2x.png"];

function noticeFileTokens(notice) {
  return [...String(notice).matchAll(/`([^`\n]+)`/g)]
    .map((match) => match[1])
    .filter((token) => !token.endsWith("/") && /LICENSE|OFL-|\.(md|txt|html|woff2)$/i.test(token));
}

function unmappedNoticeTokens(notice) {
  return noticeFileTokens(notice).filter((token) => !REQUIRED.some((item) => token.includes(item.label)));
}

function loadAsar() {
  const candidates = [
    path.join(ROOT, "app", "node_modules", "@electron", "asar"),
    path.join(ROOT, "app", "node_modules", "app-builder-lib", "node_modules", "@electron", "asar"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_) {}
  }
  throw new Error("找不到 @electron/asar，无法检查安装包里的字体许可");
}

function asarHas(asar, archive, rel) {
  const listed = asar.listPackage(archive).map((name) => name.replace(/\\/g, "/"));
  const needle = "/" + rel.replace(/\\/g, "/");
  return listed.some((name) => name === needle || name.endsWith(needle));
}

function assertPackaged(unpackedDir = UNPACKED, notice = fs.readFileSync(NOTICE_PATH, "utf8")) {
  const missingLabels = unmappedNoticeTokens(notice);
  if (missingLabels.length) {
    throw new Error("NOTICE 里的这些文件没有纳入打包检查：\n" + missingLabels.join("\n"));
  }
  for (const item of REQUIRED) {
    if (!notice.includes(item.label)) {
      throw new Error("打包检查要求 NOTICE 写明 " + item.label);
    }
  }
  if (!fs.existsSync(unpackedDir)) {
    throw new Error("找不到打包目录 " + unpackedDir);
  }
  const problems = [];
  const asarPath = path.join(unpackedDir, "resources", "app.asar");
  const asar = loadAsar();
  for (const item of REQUIRED) {
    if (item.file) {
      const abs = path.join(unpackedDir, item.file);
      if (!fs.existsSync(abs) || fs.statSync(abs).size < 20) problems.push(item.file);
      continue;
    }
    if (!fs.existsSync(asarPath) || !asarHas(asar, asarPath, item.asar)) problems.push("app.asar/" + item.asar);
  }
  for (const rel of TRAY_ASAR) {
    if (!fs.existsSync(asarPath) || !asarHas(asar, asarPath, rel)) problems.push("app.asar/" + rel);
  }
  if (problems.length) {
    throw new Error("安装包缺少 NOTICE 中的文件：\n" + problems.join("\n"));
  }
  return problems;
}

if (require.main === module) {
  try {
    assertPackaged();
    console.log("packaged notices ok");
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = { REQUIRED, TRAY_ASAR, noticeFileTokens, unmappedNoticeTokens, assertPackaged };
