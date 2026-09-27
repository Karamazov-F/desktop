const sprite = document.getElementById("sprite");
const spriteB = document.getElementById("sprite-b");
const puppet = document.getElementById("puppet");
const stage = document.getElementById("stage");
const hit = document.getElementById("hit");

// The Mini composer is revealed by hovering the character itself. Main keeps
// it alive long enough for the pointer to travel from the pet into the dock.
hit?.addEventListener("mouseenter", () => window.petApi.setPetComposeHover?.(true));
hit?.addEventListener("mouseleave", () => window.petApi.setPetComposeHover?.(false));
const bubble = document.getElementById("bubble");
const bubbleText = document.getElementById("bubble-text");
const Behavior = window.PetBehavior;
const Pointer = window.PetPointer;

let currentPack = null;
let currentStateName = "idle";
let playReason = "idle";
let frameIndex = 0;
let frameDir = 1;
let animTimer = null;
let idleTimer = null;
let blinkTimer = null;
let bubbleTimer = null;
let clickTimer = null;
let busy = false;
let lifeEnabled = false;
let facing = "right";
let dragging = false;
let lifeToken = 0;
let lastKind = "idle";
let lastAction = "idle";
let frontIsA = true;
let roamRaf = 0;
let reduceMotion = false;
let composeOpen = false;
/** Invalidates in-flight decode callbacks when the state machine advances. */
let framePaintToken = 0;

try {
  reduceMotion = Boolean(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
} catch (_) {}

function clearAnimTimer() {
  if (animTimer) {
    clearInterval(animTimer);
    animTimer = null;
  }
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (blinkTimer) {
    clearTimeout(blinkTimer);
    blinkTimer = null;
  }
}

function bumpLife() {
  lifeToken += 1;
  stopRoam();
  clearIdleTimer();
}

function bubbleDuration(text) {
  return Math.min(16000, Math.max(2800, 1800 + String(text || "").length * 70));
}

function showBubble(text, ms) {
  if (!bubble) return;
  const t = String(text || "").trim();
  if (!t) return;
  (bubbleText || bubble).textContent = t;
  bubble.classList.add("show");
  if (bubbleTimer) clearTimeout(bubbleTimer);
  const hold = ms != null ? ms : bubbleDuration(t);
  bubbleTimer = setTimeout(() => {
    bubble.classList.remove("show");
  }, hold);
}

function frontLayer() {
  return frontIsA ? sprite : spriteB;
}

function backLayer() {
  return frontIsA ? spriteB : sprite;
}

function layerUrl(el) {
  if (!el) return "";
  return el.currentSrc || el.src || el.getAttribute("src") || "";
}

function sameUrl(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch (_) {
    return false;
  }
}

/**
 * Paint next frame on the back buffer; only hide the front after decode.
 * Never assign src on the visible layer (that blanks the transparent window).
 * Never opacity-crossfade (partial opacity flashes the desktop).
 */
function showFrame(url) {
  if (!url) return;
  const token = ++framePaintToken;

  if (!spriteB) {
    sprite.src = url;
    sprite.classList.add("show");
    return;
  }

  const front = frontLayer();
  const back = backLayer();

  if (sameUrl(layerUrl(front), url) && front.classList.contains("show")) {
    return;
  }

  const applySwap = () => {
    if (token !== framePaintToken) return;
    back.classList.add("snap");
    front.classList.add("snap");
    // Back fully opaque first while front still covers — then drop front.
    back.classList.add("show");
    front.classList.remove("show");
    frontIsA = !frontIsA;
  };

  const arm = () => {
    if (token !== framePaintToken) return;
    if (back.complete && back.naturalWidth > 0) {
      applySwap();
      return;
    }
    const onDone = () => {
      back.removeEventListener("load", onDone);
      back.removeEventListener("error", onDone);
      applySwap();
    };
    back.addEventListener("load", onDone);
    back.addEventListener("error", onDone);
  };

  if (sameUrl(layerUrl(back), url)) {
    arm();
    return;
  }
  back.src = url;
  arm();
}

function applyPuppetTransform() {
  if (!puppet) return;
  const flip = facing === "left" ? "scaleX(-1)" : "scaleX(1)";
  const lift = dragging
    ? " translateY(-14px) rotate(7deg) scale(1.06)"
    : "";
  puppet.style.transform = flip + lift;
  puppet.classList.toggle("lifted", dragging);
}

function setFacing(dir) {
  facing = dir === "left" ? "left" : "right";
  applyPuppetTransform();
}

function catalog() {
  return Behavior.catalogFromPack(currentPack);
}

function playState(name, { force = false, line = null, reason = "event" } = {}) {
  if (!currentPack?.states) return;
  const def = currentPack.states[name] || currentPack.states.idle;
  if (!def?.frames?.length) return;
  if (!force && busy && name !== "idle") return;

  clearAnimTimer();
  // Drop any pending back-buffer decode from the previous clip.
  framePaintToken += 1;
  if (name !== "blink") clearIdleTimer();
  currentStateName = name;
  playReason = reason;
  frameIndex = 0;
  frameDir = 1;
  busy = name !== "idle" && name !== "blink" && !def.loop;

  if (line) showBubble(line);
  else if (line !== false && name !== "idle" && name !== "blink" && reason !== "life") {
    const lines = currentPack.dialogue?.onAction?.[name];
    if (Array.isArray(lines) && lines.length) {
      showBubble(lines[Math.floor(Math.random() * lines.length)]);
    }
  }

  const n = def.frames.length;
  const usePingpong = Boolean(def.loop && def.pingpong && n > 2);
  showFrame(def.frames[0]);

  if (n === 1 && def.loop) {
    busy = false;
    if (name === "idle" && reason === "idle" && lifeEnabled) scheduleLegacyIdle();
    return;
  }

  const ms = Math.max(32, Math.round(1000 / (def.fps || 6)));
  animTimer = setInterval(() => {
    if (usePingpong) {
      frameIndex += frameDir;
      if (frameIndex >= n - 1) {
        frameIndex = n - 1;
        frameDir = -1;
      } else if (frameIndex <= 0) {
        frameIndex = 0;
        frameDir = 1;
      }
      showFrame(def.frames[Math.max(0, Math.min(n - 1, frameIndex))]);
      return;
    }

    frameIndex += 1;
    if (frameIndex >= n) {
      if (def.loop) {
        frameIndex = 0;
        showFrame(def.frames[0]);
        return;
      }
      clearAnimTimer();
      busy = false;
      onClipEnded(name, reason);
      return;
    }
    showFrame(def.frames[frameIndex]);
  }, ms);
}

function onClipEnded(name, reason) {
  if (name === "blink") {
    if (currentStateName === "blink") playState("idle", { force: true, reason: playReason || "life" });
    return;
  }
  if (dragging) return;
  if (reason === "roam") {
    playState(name, { force: true, reason: "roam" });
    return;
  }
  if (lifeEnabled && reason !== "idle") {
    continueLife();
    return;
  }
  playState("idle", { force: true, reason: "idle" });
}

function scheduleLegacyIdle() {
  clearIdleTimer();
  if (!currentPack?.states?.blink && !currentPack?.states?.sleep) return;
  idleTimer = setTimeout(() => {
    if (!currentPack || currentStateName !== "idle" || busy || dragging) {
      scheduleLegacyIdle();
      return;
    }
    if (currentPack.states.blink && Math.random() < 0.45) {
      playState("blink", { force: true, reason: "idle" });
      setTimeout(() => {
        if (currentStateName === "blink") playState("idle", { force: true, reason: "idle" });
      }, 220);
      return;
    }
    if (currentPack.states.sleep && Math.random() < 0.35) {
      playState("sleep", { force: true, reason: "idle" });
      setTimeout(() => {
        if (currentStateName === "sleep") playState("idle", { force: true, reason: "idle" });
      }, 4000 + Math.random() * 3000);
      return;
    }
    scheduleLegacyIdle();
  }, 2500 + Math.random() * 2500);
}

function scheduleLifeAfter(ms, token) {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    if (token !== lifeToken) return;
    continueLife();
  }, ms);
  if (currentStateName === "idle" && catalog().blink) {
    blinkTimer = setTimeout(() => {
      if (token !== lifeToken || currentStateName !== "idle" || dragging) return;
      playState("blink", { force: true, reason: "life" });
    }, Math.min(ms - 200, 900 + Math.random() * 1200));
  }
}

async function continueLife() {
  if (!lifeEnabled || dragging || composeOpen) {
    if (!dragging) playState("idle", { force: true, reason: "idle" });
    return;
  }
  const token = (lifeToken += 1);
  stopRoam();
  const cat = catalog();
  let moveOk = true;
  try {
    const space = await window.petApi.getWorkArea?.();
    if (space?.win && space?.work) {
      const plan = Behavior.roamPlan({
        facing,
        win: space.win,
        work: space.work,
        distance: Behavior.roamDistancePx(),
      });
      moveOk = plan.ok;
    }
  } catch (_) {
    moveOk = false;
  }
  if (token !== lifeToken) return;

  const next = Behavior.pickNext(
    cat,
    { lastKind, lastAction, facing, moveOk },
    Math.random
  );
  lastKind = next.kind;
  lastAction = next.action || lastAction;

  if (next.kind === "turn") {
    setFacing(next.facing);
    playState(cat.idle || "idle", { force: true, reason: "life" });
    scheduleLifeAfter(Behavior.turnDwellMs(), token);
    return;
  }
  if (next.kind === "idle") {
    playState(cat.idle || "idle", { force: true, reason: "life" });
    scheduleLifeAfter(Behavior.idleDwellMs(), token);
    return;
  }
  if (next.kind === "rest") {
    playState(next.action, { force: true, reason: "life" });
    scheduleLifeAfter(Behavior.restDwellMs(), token);
    return;
  }
  if (next.kind === "move") {
    startRoam(token, next.action);
    return;
  }
  playState(next.action, { force: true, reason: "life" });
}

function stopRoam() {
  if (roamRaf) {
    cancelAnimationFrame(roamRaf);
    roamRaf = 0;
  }
}

async function startDirectedWalk({
  token,
  direction,
  distance,
  actionName,
  then = "idle",
} = {}) {
  if (token !== lifeToken) return;
  const dist0 = Math.max(40, Math.min(900, Number(distance) || 220));
  let dir = direction;
  if (dir === "current" || !dir) dir = facing;
  if (dir === "left" || dir === "right") setFacing(dir);

  let dx = 0;
  let dy = 0;
  try {
    const space = await window.petApi.getWorkArea?.();
    if (token !== lifeToken) return;
    if (space?.win && space?.work && Behavior.directedPlan) {
      const plan = Behavior.directedPlan({
        direction: dir,
        win: space.win,
        work: space.work,
        distance: dist0,
        minRoom: 8,
      });
      dx = plan.dx || 0;
      dy = plan.dy || 0;
      if (plan.facing) setFacing(plan.facing);
    } else {
      if (dir === "left") dx = -dist0;
      else if (dir === "right") dx = dist0;
      else if (dir === "up") dy = -dist0;
      else if (dir === "down") dy = dist0;
    }
  } catch (_) {
    if (dir === "left") dx = -dist0;
    else if (dir === "right") dx = dist0;
    else if (dir === "up") dy = -dist0;
    else if (dir === "down") dy = dist0;
  }

  const walkName = currentPack?.states?.[actionName]
    ? actionName
    : currentPack?.states?.walk
      ? "walk"
      : currentPack?.states?.run
        ? "run"
        : catalog().idle || "idle";
  lastKind = "event";
  lastAction = walkName;
  playState(walkName, { force: true, line: false, reason: "roam" });

  const finish = () => {
    if (token !== lifeToken) return;
    if (then === "life" && lifeEnabled) continueLife();
    else playState(catalog().idle || "idle", { force: true, reason: "idle" });
  };

  if ((!dx && !dy) || reduceMotion) {
    if (dx || dy) window.petApi.nudgeBy?.({ dx, dy });
    setTimeout(finish, reduceMotion ? 200 : 700);
    return;
  }

  const duration = Math.max(700, Math.min(2800, Math.round(Math.hypot(dx, dy) * 8)));
  const start = performance.now();
  let accX = 0;
  let accY = 0;
  const step = (now) => {
    if (token !== lifeToken || dragging) return;
    const t = Math.min(1, (now - start) / duration);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const targetX = dx * ease;
    const targetY = dy * ease;
    window.petApi.nudgeBy?.({ dx: targetX - accX, dy: targetY - accY });
    accX = targetX;
    accY = targetY;
    if (t < 1) roamRaf = requestAnimationFrame(step);
    else {
      roamRaf = 0;
      finish();
    }
  };
  roamRaf = requestAnimationFrame(step);
}

async function startRoam(token, actionName) {
  const space = await window.petApi.getWorkArea?.();
  if (token !== lifeToken) return;
  if (!space?.win || !space?.work) {
    playState(actionName || "idle", { force: true, reason: "life" });
    scheduleLifeAfter(Behavior.idleDwellMs(), token);
    return;
  }
  let plan = Behavior.roamPlan({
    facing,
    win: space.win,
    work: space.work,
    distance: Behavior.roamDistancePx(),
  });
  if (!plan.ok) {
    setFacing(plan.facing);
    playState(catalog().idle || "idle", { force: true, reason: "life" });
    scheduleLifeAfter(Behavior.turnDwellMs(), token);
    return;
  }
  setFacing(plan.facing);
  const walk = currentPack?.states?.[actionName] ? actionName : catalog().idle || "idle";
  playState(walk, { force: true, reason: "roam" });
  if (reduceMotion) {
    window.petApi.nudgeBy?.({ dx: plan.dx, dy: 0 });
    scheduleLifeAfter(400, token);
    return;
  }
  const duration = 1600 + Math.floor(Math.random() * 700);
  const start = performance.now();
  let lastT = start;
  const step = (now) => {
    if (token !== lifeToken || dragging) return;
    const t = Math.min(1, (now - start) / duration);
    const dt = now - lastT;
    lastT = now;
    const eased = t < 0.08 || t > 0.92 ? 0 : 1;
    if (eased && dt > 0) {
      const slice = plan.dx / (duration * 0.84);
      window.petApi.nudgeBy?.({ dx: slice * dt, dy: 0 });
    }
    if (t < 1) roamRaf = requestAnimationFrame(step);
    else {
      roamRaf = 0;
      if (token === lifeToken) continueLife();
    }
  };
  roamRaf = requestAnimationFrame(step);
}

function playClickReaction() {
  bumpLife();
  const action = Behavior.pickClick(catalog(), lastAction);
  lastKind = "click";
  lastAction = action;
  playState(action, { force: true, reason: "click" });
}

function playDoubleClick() {
  bumpLife();
  window.petApi.setComposeOpen?.({ compose: true });
}

async function loadPack(pack) {
  if (!pack?.states) return;
  bumpLife();
  currentPack = pack;
  for (const st of Object.values(pack.states || {})) {
    for (const url of st.frames || []) {
      const im = new Image();
      im.src = url;
    }
  }
  const w = pack.size?.width || 128;
  const h = pack.size?.height || 128;
  if (stage) {
    stage.style.width = w + "px";
    stage.style.height = h + "px";
  }
  const layout = document.getElementById("layout");
  if (layout) {
    layout.style.setProperty("--stage-h", h + "px");
    layout.style.setProperty("--bubble-max", Math.max(160, w + 8) + "px");
  }
  if (puppet) {
    puppet.style.width = w + "px";
    puppet.style.height = h + "px";
  }
  sprite.style.width = w + "px";
  sprite.style.height = h + "px";
  if (spriteB) {
    spriteB.style.width = w + "px";
    spriteB.style.height = h + "px";
  }
  if (window.petApi.resizeToPack) {
    await window.petApi.resizeToPack({
      width: w,
      height: h,
      hasDialogue: Boolean(pack.persona || pack.dialogue),
      bubbleH: 0,
    });
  }
  const pixelish =
    /pixel|blob/i.test(pack.id || "") || /pixel/i.test(pack.name || "");
  const rendering = pixelish ? "pixelated" : "auto";
  sprite.style.imageRendering = rendering;
  if (spriteB) spriteB.style.imageRendering = rendering;
  busy = false;
  dragging = false;
  applyPuppetTransform();
  playState("idle", { force: true, reason: lifeEnabled ? "life" : "idle" });
  if (pack.persona?.greeting) {
    setTimeout(() => showBubble(pack.persona.greeting, 2800), 500);
  }
  if (lifeEnabled) {
    const token = lifeToken;
    scheduleLifeAfter(3200, token);
  }
}

async function bootstrap() {
  const data = await window.petApi.getBootstrap();
  lifeEnabled = data?.settings?.lifeStream === true;
  if (data.pack) await loadPack(data.pack);

  window.petApi.onPackChanged(async (id) => {
    const pack = await window.petApi.setPack(id);
    await loadPack(pack);
  });

  window.petApi.onSettingsChanged?.((s) => {
    const next = s?.lifeStream === true;
    if (next === lifeEnabled) return;
    lifeEnabled = next;
    bumpLife();
    if (lifeEnabled) continueLife();
    else {
      playState("idle", { force: true, reason: "idle" });
    }
  });

  window.petApi.onPlayAction?.((payload) => {
    const name = typeof payload === "string" ? payload : payload?.action;
    const line = typeof payload === "object" ? payload?.line : null;
    const move = typeof payload === "object" ? payload?.move : null;
    const hasMove =
      move &&
      ["left", "right", "up", "down", "current"].includes(String(move.direction));
    if (hasMove) {
      bumpLife();
      if (line) showBubble(line);
      const walkName = name && currentPack?.states?.[name] ? name : "walk";
      startDirectedWalk({
        token: lifeToken,
        direction: move.direction,
        distance: move.distance,
        actionName: walkName,
        then: "idle",
      });
      return;
    }
    if (name && currentPack?.states?.[name]) {
      bumpLife();
      lastKind = "event";
      lastAction = name;
      playState(name, { force: true, line: line || null, reason: "event" });
    } else if (line) {
      showBubble(line);
      if (lifeEnabled) scheduleLifeAfter(2200, lifeToken);
    }
  });

  const floater = window.PetFloater.mount(stage);
  window.petApi.onFloatText?.((text) => floater.show(text));
  window.petApi.onShowBubble?.((text) => showBubble(text));

  window.petApi.onFacing?.((dir) => {
    setFacing(dir);
  });

  const listenDot = document.getElementById("listen-dot");
  const mic = window.PetMicSession.create();

  async function discardMic() {
    const rec = mic.markCancel();
    if (listenDot) listenDot.classList.remove("on");
    if (rec) {
      try {
        await rec.stop(false);
      } catch (_) {}
    }
  }

  async function startMic() {
    const mine = mic.begin();
    const rec = window.PetPcm.create();
    try {
      await rec.start();
    } catch (err) {
      try {
        await rec.stop(false);
      } catch (_) {}
      throw err;
    }
    if (!mic.accept(mine, rec)) {
      try {
        await rec.stop(false);
      } catch (_) {}
      try {
        await window.petApi.voiceCancel?.();
      } catch (_) {}
      return;
    }
    if (listenDot) listenDot.classList.add("on");
  }

  async function stopMicAndSend() {
    const rec = mic.markStop();
    if (listenDot) listenDot.classList.remove("on");
    if (!rec) {
      try {
        await window.petApi.voiceCancel?.();
      } catch (_) {}
      return;
    }
    const buf = await rec.stop(true);
    await window.petApi.transcribeAudio(buf, "audio/wav", true);
  }

  window.petApi.onVoiceRecord?.(async (cmd) => {
    try {
      if (cmd === "start") await startMic();
      if (cmd === "stop") await stopMicAndSend();
      if (cmd === "cancel") await discardMic();
    } catch (err) {
      console.error(err);
      if (listenDot) listenDot.classList.remove("on");
      if (cmd !== "stop") return;
      try {
        await window.petApi.transcribeAudio(new Uint8Array(0), "audio/wav", true);
      } catch (_) {}
    }
  });

  window.petApi.onVoiceState?.((s) => {
    if (listenDot) {
      if (s?.state === "listening") listenDot.classList.add("on");
      if (s?.state === "idle") listenDot.classList.remove("on");
    }
  });

  window.petApi.onComposeFlag?.((on) => {
    composeOpen = Boolean(on);
    bumpLife();
    if (!composeOpen && lifeEnabled && !dragging) {
      scheduleLifeAfter(1600, lifeToken);
    }
  });

  window.petApi.onOpenCompose?.((extra) => {
    if (extra?.history) window.petApi.openChat?.();
    else window.petApi.setComposeOpen?.({ compose: true });
  });

  function setDragging(on) {
    dragging = Boolean(on);
    applyPuppetTransform();
    if (dragging) {
      bumpLife();
      puppet?.classList.add("lifted");
    } else {
      puppet?.classList.remove("lifted");
      applyPuppetTransform();
      if (lifeEnabled) scheduleLifeAfter(700, lifeToken);
      else playState("idle", { force: true, reason: "idle" });
    }
  }

  window.addEventListener("mousemove", (e) => {
    if (ptr?.dragging) return;
    const hitEl =
      e.target === hit ||
      e.target === sprite ||
      e.target === spriteB ||
      e.target === puppet ||
      e.target?.id === "stage" ||
      stage?.contains(e.target);
    window.petApi.setMousePassthrough?.(!hitEl);
  });

  const pointerTarget = hit || sprite;
  let ptr = null;
  let lastClickAt = null;

  pointerTarget.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    try {
      pointerTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    ptr = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      sx: e.screenX,
      sy: e.screenY,
      dragging: false,
      closedCompose: false,
    };
    window.petApi.setMousePassthrough?.(false);
  });

  window.addEventListener("pointermove", (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    if (!ptr.dragging && Pointer.shouldStartDrag({ x: ptr.x, y: ptr.y }, { x: e.clientX, y: e.clientY })) {
      ptr.dragging = true;
      setDragging(true);
    }
    if (!ptr.dragging) return;
    window.petApi.dragBy?.({
      dx: e.screenX - ptr.sx,
      dy: e.screenY - ptr.sy,
    });
    ptr.sx = e.screenX;
    ptr.sy = e.screenY;
  });

  function endPointer(e, { click }) {
    if (!ptr || (e && e.pointerId !== ptr.id)) return;
    const wasDrag = ptr.dragging;
    const closedCompose = ptr.closedCompose;
    const x = e?.clientX ?? ptr.x;
    const y = e?.clientY ?? ptr.y;
    try {
      pointerTarget.releasePointerCapture(ptr.id);
    } catch (_) {}
    ptr = null;
    if (wasDrag) {
      setDragging(false);
      return;
    }
    // Press that only dismissed the dialog is not a click / double-click.
    if (!click || closedCompose) return;
    const now = { t: Date.now(), x, y };
    if (Pointer.isDoubleClick(lastClickAt, now)) {
      lastClickAt = null;
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      playDoubleClick();
      return;
    }
    lastClickAt = now;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      clickTimer = null;
      playClickReaction();
    }, Pointer.DOUBLECLICK_MS);
  }

  window.addEventListener("pointerup", (e) => {
    if (e.button !== 0) return;
    endPointer(e, { click: true });
  });
  window.addEventListener("pointercancel", (e) => {
    endPointer(e, { click: false });
  });

  pointerTarget.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (ptr?.dragging || dragging) return;
    window.petApi.openPetMenu?.({ x: e.screenX, y: e.screenY });
  });
}

bootstrap().catch(console.error);
