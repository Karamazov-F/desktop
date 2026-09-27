/**
 * How long a temporary note stays up, and how it wraps inside a window.
 * CJK is treated as one em wide so a line that fits here also fits on screen.
 * Loaded from Node (module.exports) and from the pet page (PetNoteLayout).
 */
const PET_FONT_PX = 16;
const PET_LINE_PX = 20;
const PET_INSET_PX = 24;
const COMPOSE_FONT_PX = 12;
const COMPOSE_LINE_PX = 18;
const HOLD_FLOOR_MS = 6000;

function charsOf(text) {
  return Array.from(String(text || ""));
}

function holdMs(text) {
  return Math.max(HOLD_FLOOR_MS, 1200 + charsOf(text).length * 160);
}

function wrapText(text, innerWidth, fontPx) {
  const inner = Math.max(fontPx, Math.floor(innerWidth));
  const per = Math.max(1, Math.floor(inner / fontPx));
  const chars = charsOf(text);
  const lines = [];
  for (let i = 0; i < chars.length; i += per) lines.push(chars.slice(i, i + per).join(""));
  if (!lines.length) lines.push("");
  return { lines, per, innerWidth: inner };
}

function fitPetNote(text, windowWidth, windowHeight) {
  const label = String(text || "");
  const inner = Math.max(PET_FONT_PX, Math.floor(Number(windowWidth) || 0) - PET_INSET_PX);
  const wrapped = wrapText(label, inner, PET_FONT_PX);
  const blockHeight = wrapped.lines.length * PET_LINE_PX + 8;
  const widthOk = wrapped.lines.every((line) => charsOf(line).length * PET_FONT_PX <= wrapped.innerWidth);
  return {
    text: label,
    lines: wrapped.lines,
    holdMs: holdMs(label),
    innerWidth: wrapped.innerWidth,
    blockHeight,
    fits: wrapped.lines.join("") === label && widthOk && blockHeight <= Number(windowHeight),
  };
}

function composeNoteSize(text, width) {
  const label = String(text || "");
  const boxWidth = Math.max(COMPOSE_FONT_PX, Math.floor(Number(width) || 0));
  const inner = Math.max(COMPOSE_FONT_PX, boxWidth - (14 * 2 + 12 * 2));
  const wrapped = wrapText(label, inner, COMPOSE_FONT_PX);
  const hintH = wrapped.lines.length * COMPOSE_LINE_PX + 8;
  return {
    width: boxWidth,
    height: 68 + hintH + 8,
    lines: wrapped.lines,
    text: label,
    fits: wrapped.lines.join("") === label,
  };
}

const api = {
  PET_FONT_PX,
  PET_INSET_PX,
  HOLD_FLOOR_MS,
  holdMs,
  wrapText,
  fitPetNote,
  composeNoteSize,
};

if (typeof module === "object" && module.exports) {
  module.exports = api;
} else {
  globalThis.PetNoteLayout = api;
}
