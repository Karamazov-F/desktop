const ACTION_LABELS = {
  idle: "待机",
  blink: "眨眼",
  sleep: "睡觉",
  stretch: "伸懒腰",
  meow: "挥手/喵",
  wave: "挥手",
  happy: "开心",
  walk: "走",
  run: "跑",
};

const TRAY_ACTIONS = ["sleep", "stretch", "meow", "wave", "happy", "walk", "run"];

function availableActions(pack) {
  return Object.keys(pack?.states || {}).filter((k) => k !== "blink");
}

function toolDefs({ memoryEnabled, visionEnabled, actions }) {
  const tools = [
    {
      type: "function",
      function: {
        name: "play_action",
        description:
          "播放桌宠动画。只能使用当前角色包里有的动作 id。",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "动作 id，例如 happy、sleep、meow、stretch、walk、run",
              enum: actions.length ? actions : ["idle"],
            },
          },
          required: ["action"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "move_pet",
        description:
          "让桌宠在屏幕工作区内边播行走动画边平移。用户说左走/右走/走开/过来时必须调用；不要只 play_action walk。distance 为像素，默认 220。",
        parameters: {
          type: "object",
          properties: {
            direction: {
              type: "string",
              enum: ["left", "right", "up", "down"],
            },
            distance: { type: "number" },
          },
          required: ["direction"],
        },
      },
    },
  ];
  if (memoryEnabled) {
    tools.push(
      {
        type: "function",
        function: {
          name: "remember",
          description: "把一条关于用户的短事实写入本机长期记忆。",
          parameters: {
            type: "object",
            properties: { fact: { type: "string" } },
            required: ["fact"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "forget",
          description: "按关键词删除本机记忆中的匹配条目。",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      }
    );
  }
  if (visionEnabled) {
    tools.push({
      type: "function",
      function: {
        name: "glance_screen",
        description:
          "看一眼用户桌面截屏（用户已打开「允许查看屏幕」）。用于回答「我在干什么/看看屏幕」。截图会发给视觉接口。",
        parameters: { type: "object", properties: {} },
      },
    });
  }
  return tools;
}

function parseToolArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeToolName(name) {
  return String(name || "").trim();
}

function allowedToolNames({ memoryEnabled, visionEnabled }) {
  const names = new Set(["play_action", "move_pet"]);
  if (memoryEnabled) {
    names.add("remember");
    names.add("forget");
  }
  if (visionEnabled) names.add("glance_screen");
  return names;
}

function validatePlayAction(pack, action) {
  const key = String(action || "").trim();
  if (!key) return { ok: false, error: "missing action" };
  if (!pack?.states?.[key]) return { ok: false, error: `unknown action ${key}` };
  return { ok: true, action: key };
}

function validateMove(args) {
  const dir = String(args.direction || "").toLowerCase();
  if (!["left", "right", "up", "down"].includes(dir)) {
    return { ok: false, error: "bad direction" };
  }
  let distance = Number(args.distance);
  if (!Number.isFinite(distance)) distance = 220;
  distance = Math.max(40, Math.min(900, Math.round(distance)));
  return { ok: true, direction: dir, distance };
}

module.exports = {
  ACTION_LABELS,
  TRAY_ACTIONS,
  availableActions,
  toolDefs,
  parseToolArgs,
  normalizeToolName,
  allowedToolNames,
  validatePlayAction,
  validateMove,
};
