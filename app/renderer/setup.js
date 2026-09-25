const listEl = document.getElementById("list");
const logEl = document.getElementById("log");
const installBtn = document.getElementById("install");
const refreshBtn = document.getElementById("refresh");
const continueBtn = document.getElementById("continue");

function log(msg) {
  logEl.textContent = String(msg);
}

function render(rows) {
  listEl.innerHTML = "";
  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "item " + (r.ok ? "ok" : r.required ? "bad" : "");
    const tag = r.ok ? "已就绪" : r.required ? "缺失" : "可选";
    div.innerHTML = `<div class="item-top"><div class="name">${r.title}</div><span class="tag">${tag}</span></div>
      <div class="meta">${r.detail || ""}</div>
      <div class="meta">${r.status || ""}</div>`;
    listEl.appendChild(div);
  }
  const missing = rows.filter((r) => r.required && !r.ok);
  installBtn.disabled = missing.length === 0;
  installBtn.textContent = missing.length
    ? `一键安装缺失项（${missing.length}）`
    : "依赖已齐";
}

async function refresh() {
  const rows = await window.petApi.depsStatus();
  render(rows);
  const missing = rows.filter((r) => r.required && !r.ok);
  log(
    missing.length
      ? `还缺：${missing.map((m) => m.title).join("、")}`
      : "必装依赖已就绪，可以继续。"
  );
  return rows;
}

installBtn.addEventListener("click", async () => {
  installBtn.disabled = true;
  try {
    const rows = await window.petApi.depsStatus();
    const ids = rows.filter((r) => r.required && !r.ok && r.canInstall).map((r) => r.id);
    if (!ids.length) {
      log("没有可安装的缺失项。");
      return;
    }
    log("开始安装：" + ids.join(", "));
    const res = await window.petApi.depsInstall(ids);
    if (!res.ok) throw new Error(res.error || "install failed");
    await refresh();
  } catch (err) {
    log("安装失败：" + (err.message || err));
    installBtn.disabled = false;
  }
});

refreshBtn.addEventListener("click", () => refresh().catch((e) => log(e.message)));
continueBtn.addEventListener("click", () => window.petApi.depsContinue());

window.petApi.onDepsProgress?.((p) => {
  const pct = p.pct != null ? ` ${p.pct}%` : "";
  log((p.message || "…") + pct);
});

refresh().catch((e) => log(e.message));
