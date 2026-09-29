const DEFAULTS = {
  voiceHotkey: "CommandOrControl+Shift+Space",
  hideHotkey: "CommandOrControl+Shift+H",
};

const MOD_ORDER = ["CommandOrControl", "Alt", "Shift"];

function normalize(raw) {
  if (raw == null) return "";
  const text = String(raw).trim();
  if (!text) return "";
  const parts = text.split("+").map((s) => s.trim()).filter(Boolean);
  const mods = new Set();
  let key = "";
  for (const p of parts) {
    const low = p.toLowerCase().replace(/\s/g, "");
    if (
      [
        "commandorcontrol",
        "cmdorctrl",
        "command",
        "cmd",
        "control",
        "ctrl",
        "super",
        "meta",
        "win",
      ].includes(low)
    ) {
      mods.add("CommandOrControl");
    } else if (["alt", "option"].includes(low)) {
      mods.add("Alt");
    } else if (low === "shift") {
      mods.add("Shift");
    } else if (low === "space" || p === "空格") {
      key = "Space";
    } else if (low === "plus" || p === "+") {
      key = "Plus";
    } else if (p.length === 1) {
      key = /[a-zA-Z]/.test(p) ? p.toUpperCase() : p;
    } else {
      key = p[0].toUpperCase() + p.slice(1);
    }
  }
  if (!key) return "";
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join("+");
}

function formatDisplay(raw) {
  const n = normalize(raw);
  if (!n) return "未设置";
  return n
    .replace(/CommandOrControl/g, "Ctrl")
    .replace(/Space/g, "空格")
    .replace(/\+/g, " + ")
    .replace(/Plus/g, "+");
}

function electronKeyFromEvent(e) {
  const code = String(e?.code || "");
  if (code === "Space" || e?.key === " ") return "Space";
  if (code === "Tab") return "Tab";
  if (code === "Escape") return "Escape";
  if (code === "Enter" || code === "NumpadEnter") return "Enter";
  if (code === "Backspace") return "Backspace";
  if (code === "Delete") return "Delete";
  if (code === "Insert") return "Insert";
  if (code === "Home") return "Home";
  if (code === "End") return "End";
  if (code === "PageUp") return "PageUp";
  if (code === "PageDown") return "PageDown";
  if (code === "ArrowUp") return "Up";
  if (code === "ArrowDown") return "Down";
  if (code === "ArrowLeft") return "Left";
  if (code === "ArrowRight") return "Right";
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
  if (code === "NumpadAdd" || e?.key === "+") return "Plus";
  if (code === "NumpadSubtract") return "-";
  if (code === "NumpadDivide") return "/";
  if (code === "NumpadMultiply") return "*";
  if (code === "Backquote") return e?.shiftKey ? "~" : "`";

  const key = String(e?.key || "");
  if (key.length === 1) {
    if (key === "+") return "Plus";
    if (/[a-zA-Z]/.test(key)) return key.toUpperCase();
    return key;
  }

  if (code === "Minus") return "-";
  if (code === "Equal") return e?.shiftKey ? "Plus" : "=";
  if (code === "BracketLeft") return "[";
  if (code === "BracketRight") return "]";
  if (code === "Backslash") return "\\";
  if (code === "Semicolon") return ";";
  if (code === "Quote") return "'";
  if (code === "Comma") return ",";
  if (code === "Period") return ".";
  if (code === "Slash") return "/";
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return null;
}

function acceleratorsToTry(raw) {
  const n = normalize(raw);
  if (!n) return [];
  const tries = [n];
  if (/(^|\+)~$/.test(n)) {
    tries.push(n.replace(/~$/, "`"));
  }
  if (n === "Shift+~") tries.push("~");
  if (n === "Shift+`") tries.push("Shift+~", "`");
  return [...new Set(tries.filter(Boolean))];
}

function fromKeyboardEvent(e) {
  if (["Control", "Shift", "Alt", "Meta", "OS"].includes(e?.key)) return "";
  const key = electronKeyFromEvent(e);
  if (!key) return "";
  const mods = new Set();
  if (e?.ctrlKey || e?.metaKey) mods.add("CommandOrControl");
  if (e?.altKey) mods.add("Alt");
  if (e?.shiftKey) mods.add("Shift");
  const isFn = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  if (!mods.size && !isFn) return "";
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join("+");
}

const petHotkeysApi = {
  DEFAULTS,
  normalize,
  formatDisplay,
  fromKeyboardEvent,
  electronKeyFromEvent,
  acceleratorsToTry,
};

if (typeof module === "object" && module.exports) {
  module.exports = petHotkeysApi;
} else if (typeof window !== "undefined") {
  window.PetHotkeys = petHotkeysApi;
}
