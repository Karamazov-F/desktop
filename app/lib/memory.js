const fs = require("fs");
const path = require("path");
const { ensureDir, memoryDir } = require("./paths");

function packMemoryPath(userData, packId) {
  return path.join(memoryDir(userData), `${packId}.json`);
}

function emptyMemory() {
  return { facts: [], summary: "", updatedAt: null };
}

function loadMemory(userData, packId) {
  const p = packMemoryPath(userData, packId);
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      return {
        facts: Array.isArray(raw.facts) ? raw.facts.map(String).filter(Boolean) : [],
        summary: typeof raw.summary === "string" ? raw.summary : "",
        updatedAt: raw.updatedAt || null,
      };
    }
  } catch (_) {}
  return emptyMemory();
}

function saveMemory(userData, packId, mem) {
  ensureDir(memoryDir(userData));
  const next = {
    facts: (mem.facts || []).map((f) => String(f).trim()).filter(Boolean).slice(0, 80),
    summary: String(mem.summary || "").slice(0, 1200),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(packMemoryPath(userData, packId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function rememberFact(userData, packId, fact) {
  const mem = loadMemory(userData, packId);
  const t = String(fact || "").trim().slice(0, 240);
  if (!t) return mem;
  if (!mem.facts.some((f) => f.toLowerCase() === t.toLowerCase())) {
    mem.facts.push(t);
  }
  return saveMemory(userData, packId, mem);
}

function forgetFacts(userData, packId, query) {
  const mem = loadMemory(userData, packId);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return mem;
  mem.facts = mem.facts.filter((f) => !f.toLowerCase().includes(q));
  return saveMemory(userData, packId, mem);
}

function clearMemory(userData, packId) {
  return saveMemory(userData, packId, emptyMemory());
}

function clearAllMemory(userData) {
  fs.rmSync(memoryDir(userData), { recursive: true, force: true });
}

function memoryPromptBlock(mem) {
  if (!mem) return "";
  const facts = (mem.facts || []).slice(-40);
  const bits = [];
  if (facts.length) bits.push("已知用户事实：\n- " + facts.join("\n- "));
  if (mem.summary) bits.push("近期摘要：" + mem.summary);
  return bits.join("\n");
}

module.exports = {
  loadMemory,
  saveMemory,
  rememberFact,
  forgetFacts,
  clearMemory,
  clearAllMemory,
  memoryPromptBlock,
  emptyMemory,
};
