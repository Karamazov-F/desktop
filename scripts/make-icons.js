/**
 * Build the Windows icon set from one square PNG.
 *
 *   node scripts/make-icons.js --source path/to/icon.png
 *   node scripts/make-icons.js --placeholder
 *
 * --placeholder draws a neutral geometric stand-in (not brand art) at 1024px
 * and runs it through the same resizer. Replace it by passing --source once
 * the real artwork is ready. Source must be a square PNG at least 1024px.
 *
 * Writes:
 *   app/build/icon.ico     16, 24, 32, 48, 64, 128, 256
 *   app/build/tray.ico     the same sizes
 *   app/build/tray.png     16x16
 *   app/build/tray@2x.png  32x32
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "app", "build");
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];
const MIN_SOURCE = 1024;

function pngSize(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : fs.readFileSync(buffer);
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("不是 PNG 文件");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function toIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6 + 16 * count);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const parts = [header];
  images.forEach((img, index) => {
    const at = 6 + index * 16;
    header[at] = img.width >= 256 ? 0 : img.width;
    header[at + 1] = img.height >= 256 ? 0 : img.height;
    header[at + 2] = 0;
    header[at + 3] = 0;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(img.png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += img.png.length;
    parts.push(img.png);
  });
  return Buffer.concat(parts);
}

function icoDirectory(buffer) {
  if (buffer.length < 6 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    throw new Error("不是 ICO 文件");
  }
  const count = buffer.readUInt16LE(4);
  const images = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const width = buffer[at] || 256;
    const height = buffer[at + 1] || 256;
    images.push({ width, height });
  }
  return images;
}

async function placeholderPng() {
  const size = MIN_SOURCE;
  const radius = Math.round(size * 0.18);
  const inset = Math.round(size * 0.28);
  const inner = Math.round(size * 0.44);
  const innerRadius = Math.round(size * 0.08);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="#5c6770"/>
    <rect x="${inset}" y="${inset}" width="${inner}" height="${inner}" rx="${innerRadius}" fill="#e8eef2"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function loadSource(file) {
  const buffer = fs.readFileSync(file);
  const size = pngSize(buffer);
  if (size.width !== size.height || size.width < MIN_SOURCE) {
    throw new Error(`图标源图必须是边长至少 ${MIN_SOURCE} 的正方形 PNG（当前 ${size.width}x${size.height}）`);
  }
  return buffer;
}

async function pngAt(source, size) {
  return sharp(source)
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
}

async function buildFromSource(source) {
  const rendered = [];
  for (const size of ICON_SIZES) {
    rendered.push({ width: size, height: size, png: await pngAt(source, size) });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ico = toIco(rendered);
  fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), ico);
  fs.writeFileSync(path.join(OUT_DIR, "tray.ico"), ico);
  const bySize = new Map(rendered.map((img) => [img.width, img.png]));
  fs.writeFileSync(path.join(OUT_DIR, "tray.png"), bySize.get(16));
  fs.writeFileSync(path.join(OUT_DIR, "tray@2x.png"), bySize.get(32));
  return {
    icon: path.join(OUT_DIR, "icon.ico"),
    trayIco: path.join(OUT_DIR, "tray.ico"),
    tray: path.join(OUT_DIR, "tray.png"),
    tray2x: path.join(OUT_DIR, "tray@2x.png"),
  };
}

async function main(argv) {
  const placeholder = argv.includes("--placeholder");
  const sourceFlag = argv.indexOf("--source");
  if (placeholder === (sourceFlag >= 0)) {
    throw new Error("请指定 --placeholder，或 --source <正方形 PNG>");
  }
  const source = placeholder ? await placeholderPng() : await loadSource(argv[sourceFlag + 1]);
  if (!placeholder) {
    /* loadSource already checked dimensions */
  } else {
    const size = pngSize(source);
    if (size.width !== size.height || size.width < MIN_SOURCE) {
      throw new Error("占位图生成失败");
    }
  }
  const written = await buildFromSource(source);
  for (const file of Object.values(written)) console.log("wrote", file);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  ICON_SIZES,
  MIN_SOURCE,
  pngSize,
  toIco,
  icoDirectory,
  placeholderPng,
  loadSource,
  buildFromSource,
};
