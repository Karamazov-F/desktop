/**
 * Desktop life-stream (dsh-pet-style): ambient chain vs event clips.
 * Renderer loads this as a script; Node tests require() it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PetBehavior = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CLICK_IDS = ["meow", "wave", "happy"];
  const AMBIENT_IDS = ["stretch", "happy", "meow", "wave"];
  const REST_IDS = ["sleep"];
  const MOVE_IDS = ["walk", "run"];

  /** dsh-pet-ish: idle / turn / action / rest / move sum to 100 */
  const DEFAULT_WEIGHTS = {
    idle: 30,
    turn: 10,
    action: 32,
    rest: 8,
    move: 20,
  };

  function hasState(pack, id) {
    return Boolean(pack?.states?.[id]?.frames?.length);
  }

  function pickList(ids, pack) {
    return ids.filter((id) => hasState(pack, id));
  }

  function catalogFromPack(pack) {
    const clicks = pickList(CLICK_IDS, pack);
    const ambient = pickList(AMBIENT_IDS, pack);
    const rest = pickList(REST_IDS, pack);
    const moves = pickList(MOVE_IDS, pack);
    if (!clicks.length && ambient.length) clicks.push(ambient[0]);
    if (!clicks.length && hasState(pack, "idle")) clicks.push("idle");
    return {
      idle: hasState(pack, "idle") ? "idle" : null,
      blink: hasState(pack, "blink") ? "blink" : null,
      clicks,
      ambient,
      rest,
      moves,
      canSlide: true,
    };
  }

  function rollWeighted(weights, rand) {
    const r = (typeof rand === "function" ? rand() : Math.random()) * 100;
    let acc = 0;
    const order = ["idle", "turn", "action", "rest", "move"];
    for (const k of order) {
      acc += Number(weights[k]) || 0;
      if (r < acc) return k;
    }
    return "idle";
  }

  function avoidRepeat(list, last, rand) {
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const pool = last ? list.filter((x) => x !== last) : list;
    const src = pool.length ? pool : list;
    const i = Math.floor((typeof rand === "function" ? rand() : Math.random()) * src.length);
    return src[i];
  }

  /**
   * @param catalog
   * @param ctx {{ lastKind?: string, lastAction?: string, facing?: string, moveOk?: boolean }}
   * @param rand {() => number}
   * @param weights
   */
  function pickNext(catalog, ctx = {}, rand = Math.random, weights = DEFAULT_WEIGHTS) {
    const w = { ...DEFAULT_WEIGHTS, ...weights };
    if (!catalog?.rest?.length) w.rest = 0;
    if (!catalog?.ambient?.length) w.action = 0;
    const movePossible = catalog?.moves?.length || catalog?.canSlide;
    if (!movePossible || ctx.moveOk === false) w.move = 0;

    const total = w.idle + w.turn + w.action + w.rest + w.move;
    if (total <= 0) {
      return { kind: "idle", action: catalog?.idle || "idle" };
    }
    const scaled = {};
    for (const k of Object.keys(w)) scaled[k] = (w[k] / total) * 100;

    let kind = rollWeighted(scaled, rand);
    if (kind === "action" && !catalog.ambient.length) kind = "idle";
    if (kind === "rest" && !catalog.rest.length) kind = "idle";
    if (kind === "move" && ctx.moveOk === false) kind = catalog.ambient.length ? "action" : "idle";

    if (kind === "idle") {
      return { kind: "idle", action: catalog.idle || "idle" };
    }
    if (kind === "turn") {
      const facing = ctx.facing === "left" ? "right" : "left";
      return { kind: "turn", action: catalog.idle || "idle", facing };
    }
    if (kind === "rest") {
      return {
        kind: "rest",
        action: avoidRepeat(catalog.rest, ctx.lastAction, rand),
      };
    }
    if (kind === "move") {
      return {
        kind: "move",
        action: catalog.moves[0] || catalog.idle || "idle",
        facing: ctx.facing === "left" ? "left" : "right",
      };
    }
    return {
      kind: "action",
      action: avoidRepeat(catalog.ambient, ctx.lastAction, rand),
    };
  }

  function pickClick(catalog, last, rand = Math.random) {
    return avoidRepeat(catalog?.clicks || [], last, rand) || catalog?.idle || "idle";
  }

  /**
   * Horizontal roam in current facing. If blocked, request a flip.
   */
  function roamPlan({ facing, win, work, distance = 160, margin = 24, minRoom = 56 }) {
    const f = facing === "left" ? "left" : "right";
    const maxLeft = win.x - work.x - margin;
    const maxRight = work.x + work.width - (win.x + win.width) - margin;
    const room = f === "left" ? maxLeft : maxRight;
    if (room < minRoom) {
      return {
        ok: false,
        flip: true,
        facing: f === "left" ? "right" : "left",
        dx: 0,
        dy: 0,
        distance: 0,
      };
    }
    const dist = Math.max(minRoom, Math.min(Number(distance) || 160, room));
    return {
      ok: true,
      flip: false,
      facing: f,
      dx: f === "left" ? -dist : dist,
      dy: 0,
      distance: dist,
    };
  }

  /** User-directed step: keep requested facing, never auto-flip. */
  function directedPlan({
    direction,
    win,
    work,
    distance = 220,
    margin = 24,
    minRoom = 8,
  }) {
    const dist0 = Math.max(0, Number(distance) || 220);
    const dir =
      direction === "left" ||
      direction === "right" ||
      direction === "up" ||
      direction === "down"
        ? direction
        : "right";
    if (dir === "up" || dir === "down") {
      const maxUp = win.y - work.y - margin;
      const maxDown = work.y + work.height - (win.y + win.height) - margin;
      const room = dir === "up" ? maxUp : maxDown;
      const dist = Math.min(dist0, Math.max(0, room));
      return {
        ok: dist >= minRoom,
        flip: false,
        facing: null,
        dx: 0,
        dy: dir === "up" ? -dist : dist,
        distance: dist,
      };
    }
    const f = dir === "left" ? "left" : "right";
    const maxLeft = win.x - work.x - margin;
    const maxRight = work.x + work.width - (win.x + win.width) - margin;
    const room = f === "left" ? maxLeft : maxRight;
    const dist = Math.min(dist0, Math.max(0, room));
    return {
      ok: dist >= minRoom,
      flip: false,
      facing: f,
      dx: f === "left" ? -dist : dist,
      dy: 0,
      distance: dist,
    };
  }

  function idleDwellMs(rand = Math.random) {
    return 2800 + Math.floor(rand() * 2600);
  }

  function restDwellMs(rand = Math.random) {
    return 4800 + Math.floor(rand() * 3200);
  }

  function turnDwellMs(rand = Math.random) {
    return 900 + Math.floor(rand() * 700);
  }

  function roamDistancePx(rand = Math.random) {
    return 90 + Math.floor(rand() * 140);
  }

  return {
    CLICK_IDS,
    AMBIENT_IDS,
    REST_IDS,
    MOVE_IDS,
    DEFAULT_WEIGHTS,
    catalogFromPack,
    pickNext,
    pickClick,
    roamPlan,
    directedPlan,
    idleDwellMs,
    restDwellMs,
    turnDwellMs,
    roamDistancePx,
  };
});
