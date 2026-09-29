const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function trayIconFiles(appDir) {
  const dir = path.join(appDir, "assets", "tray");
  return {
    ico: path.join(dir, "tray.ico"),
    png: path.join(dir, "tray.png"),
    png2x: path.join(dir, "tray@2x.png"),
  };
}

function selectTrayAssets(files, { platform, exists } = {}) {
  const there = exists || ((file) => fs.existsSync(file));
  const useIco = platform === "win32" && there(files.ico);
  return {
    useIco,
    ico: files.ico,
    png: files.png,
    png2x: files.png2x,
    primary: useIco ? files.ico : files.png,
  };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function fallbackTrayPng() {
  const size = 16;
  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const row = y * rowBytes;
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      raw[i] = border ? 0x5c : 0xc5;
      raw[i + 1] = border ? 0x67 : 0xce;
      raw[i + 2] = border ? 0x70 : 0xd6;
      raw[i + 3] = 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { trayIconFiles, selectTrayAssets, fallbackTrayPng };
