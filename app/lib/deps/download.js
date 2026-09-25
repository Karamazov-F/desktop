const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { URL } = require("url");

function curlBin() {
  if (process.platform === "win32") return "curl.exe";
  return "curl";
}

function downloadWithCurl(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const tmp = dest + ".part";
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const args = [
      "-L",
      "--fail",
      "--retry",
      "5",
      "--retry-delay",
      "2",
      "--retry-all-errors",
      "--connect-timeout",
      "20",
      "-A",
      "desktop-pet-custom",
      "-C",
      "-",
      "-o",
      tmp,
      url,
    ];
    const p = spawn(curlBin(), args, { windowsHide: true });
    let stderr = "";
    p.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      const m = s.match(/(\d+)\s+(\d+)\s/) || s.match(/(\d+(?:\.\d+)?)%/);
      if (m && onProgress) {
        const pct = Math.round(Number(m[1]));
        if (Number.isFinite(pct)) onProgress({ pct, url });
      }
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) {
        reject(new Error((stderr || `curl exit ${code}`).slice(-800)));
        return;
      }
      if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 8) {
        reject(new Error("curl 下载结果为空"));
        return;
      }
      fs.renameSync(tmp, dest);
      resolve(dest);
    });
  });
}

function downloadWithHttps(url, dest, onProgress) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const tmp = dest + ".part";
    const have = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
    const file = fs.createWriteStream(tmp, have ? { flags: "a" } : undefined);
    let hops = 0;
    const get = (u, resumeFrom) => {
      if (hops++ > 8) {
        file.close();
        reject(new Error("too many redirects"));
        return;
      }
      const parsed = new URL(u);
      const lib = parsed.protocol === "https:" ? https : http;
      const headers = { "User-Agent": "desktop-pet-custom" };
      if (resumeFrom) headers.Range = `bytes=${resumeFrom}-`;
      const req = lib.get(u, { headers }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          get(new URL(res.headers.location, u).toString(), resumeFrom);
          return;
        }
        if (res.statusCode === 416) {
          res.resume();
          file.close(() => {
            if (fs.existsSync(tmp) && fs.statSync(tmp).size > 8) {
              fs.renameSync(tmp, dest);
              resolve(dest);
            } else reject(new Error("download 416"));
          });
          return;
        }
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          file.close();
          fs.rmSync(tmp, { force: true });
          reject(new Error(`download ${res.statusCode} ${u}`));
          return;
        }
        const total = Number(res.headers["content-length"] || 0) + (res.statusCode === 206 ? resumeFrom : 0);
        let got = res.statusCode === 206 ? resumeFrom : 0;
        res.on("data", (chunk) => {
          got += chunk.length;
          if (total && onProgress) {
            onProgress({ got, total, pct: Math.round((got / total) * 100), url });
          }
        });
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.renameSync(tmp, dest);
            resolve(dest);
          });
        });
      });
      req.setTimeout(30000, () => {
        req.destroy(new Error("download timeout"));
      });
      req.on("error", (err) => {
        file.close();
        reject(err);
      });
    };
    get(url, have);
  });
}

async function downloadFile(url, dest, onProgress) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 8) return dest;
  try {
    return await downloadWithCurl(url, dest, onProgress);
  } catch (err) {
    try {
      return await downloadWithHttps(url, dest, onProgress);
    } catch (err2) {
      throw new Error(`${url}\ncurl: ${err.message}\nhttps: ${err2.message}`);
    }
  }
}

async function downloadFirst(urls, dest, onProgress) {
  let lastErr;
  for (const url of urls) {
    try {
      onProgress?.({ message: path.basename(new URL(url).pathname), pct: 0, url });
      return await downloadFile(url, dest, onProgress);
    } catch (err) {
      lastErr = err;
      try {
        fs.rmSync(dest + ".part", { force: true });
      } catch (_) {}
    }
  }
  throw lastErr || new Error("no download urls");
}

module.exports = { downloadFile, downloadFirst };
