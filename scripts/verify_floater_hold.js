/**
 * Floater travels up the body once; hold-to-talk waits a full second.
 * Usage: app/node_modules/electron/dist/electron.exe scripts/verify_floater_hold.js
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "comfy", "verify", "floater_mid.png");

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const result = { ok: true, errors: [] };
  function fail(msg) {
    result.ok = false;
    result.errors.push(msg);
  }

  try {
    const watch = require("../app/main/pointer-watch");
    const stop = watch.watchPresses(() => {});
    stop();
    result.pointerWatch = true;
  } catch (err) {
    fail("pointer-watch: " + (err && err.message));
  }

  const win = new BrowserWindow({
    width: 320,
    height: 360,
    show: true,
    webPreferences: { contextIsolation: false, nodeIntegration: false },
  });
  const html = `<!DOCTYPE html><html><head>
    <link rel="stylesheet" href="../../app/renderer/fonts.css" />
    <style>html,body{margin:0;background:#efe6d4} #stage{position:relative;width:256px;height:256px;margin:40px;background:#f4efe4}</style>
    </head><body>
    <div id="stage"></div>
    <button id="mic" type="button">按住说话</button>
    <script src="../../app/renderer/floater.js"></script>
    <script src="../../app/renderer/hold-talk.js"></script>
    </body></html>`;
  const file = path.join(ROOT, "comfy", "verify", "floater_hold.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  await win.loadFile(file);

  const travel = await win.webContents.executeJavaScript(`(() => {
    const stage = document.getElementById("stage");
    const floater = PetFloater.mount(stage);
    floater.show("按键时间过短");
    const el = stage.querySelector(".pet-floater");
    const y0 = el.getBoundingClientRect().top;
    const color = getComputedStyle(el.querySelector(".pet-floater-text")).color;
    const shadow = getComputedStyle(el.querySelector(".pet-floater-text")).textShadow;
    return new Promise((resolve) => {
      setTimeout(() => {
        const yArrived = el.getBoundingClientRect().top;
        setTimeout(() => {
          const yHold = el.getBoundingClientRect().top;
          resolve({ y0, yArrived, yHold, color, shadow: shadow.slice(0, 80), text: el.textContent });
        }, 1000);
      }, 250);
    });
  })()`);
  result.travel = travel;
  const hopped = travel.y0 - travel.yArrived;
  const settled = Math.abs(travel.yHold - travel.yArrived);
  if (!(hopped > 16 && hopped < 24)) fail("floater hop is not ~20px: " + JSON.stringify(travel));
  if (settled > 2) fail("floater did not hold still: " + JSON.stringify(travel));
  if (travel.text !== "按键时间过短") fail("floater text: " + travel.text);
  if (!String(travel.color).includes("17")) fail("floater fill is not black: " + travel.color);
  if (!/255,\s*255,\s*255/.test(travel.shadow) && !/#fff/i.test(travel.shadow)) {
    fail("floater has no white outline: " + travel.shadow);
  }

  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());

  const hold = await win.webContents.executeJavaScript(`(() => {
    const btn = document.getElementById("mic");
    const log = [];
    PetHoldTalk.bind(btn, {
      onListen() { log.push("listen"); btn.classList.add("hot"); },
      onSend() { log.push("send"); btn.classList.remove("hot"); },
      onTooShort() { log.push("short"); btn.classList.remove("hot"); },
    });
    function press(id) {
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: id, pointerType: "mouse" }));
    }
    function release(id) {
      btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: id, pointerType: "mouse" }));
    }
    press(1);
    release(1);
    const afterShort = { log: log.slice(), hot: btn.classList.contains("hot") };
    return new Promise((resolve) => {
      setTimeout(() => {
        press(2);
        const atListen = { log: log.slice(), hot: btn.classList.contains("hot") };
        setTimeout(() => {
          const mid = { log: log.slice(), hot: btn.classList.contains("hot") };
          release(2);
          resolve({ afterShort, atListen, mid, afterLong: { log: log.slice(), hot: btn.classList.contains("hot") } });
        }, PetHoldTalk.MIN_MS + 40);
      }, 40);
    });
  })()`);
  result.hold = hold;
  if (hold.afterShort.log.join() !== "listen,short" || hold.afterShort.hot) {
    fail("short press: " + JSON.stringify(hold.afterShort));
  }
  if (hold.atListen.log.join() !== "listen,short,listen" || !hold.atListen.hot) {
    fail("listen starts with the press: " + JSON.stringify(hold.atListen));
  }
  if (hold.afterLong.log.join() !== "listen,short,listen,send" || hold.afterLong.hot) {
    fail("release: " + JSON.stringify(hold.afterLong));
  }

  console.log(JSON.stringify(result));
  app.exit(result.ok ? 0 : 1);
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
