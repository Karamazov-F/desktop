const DEFAULT_ACTIONS = ["idle", "blink", "meow", "stretch", "sleep", "happy"];

/** @type {{ action: string, video: string | null }[]} */
let rows = DEFAULT_ACTIONS.map((action) => ({ action, video: null }));

const rowsEl = document.getElementById("rows");
const logEl = document.getElementById("log");

function log(msg) {
  logEl.textContent = String(msg);
}

function render() {
  rowsEl.innerHTML = "";
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    const actionTd = document.createElement("td");
    const actionInput = document.createElement("input");
    actionInput.type = "text";
    actionInput.value = row.action;
    actionInput.placeholder = "idle / happy / run …";
    actionInput.addEventListener("input", () => {
      rows[i].action = actionInput.value.trim();
    });
    actionTd.appendChild(actionInput);

    const videoTd = document.createElement("td");
    const pathEl = document.createElement("div");
    pathEl.className = "path";
    pathEl.textContent = row.video || "未选择";
    pathEl.title = row.video || "";
    videoTd.appendChild(pathEl);

    const btnTd = document.createElement("td");
    btnTd.className = "row-actions";
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "ghost";
    pick.textContent = "选择视频";
    pick.addEventListener("click", async () => {
      const p = await window.packerApi.pickVideo();
      if (p) {
        rows[i].video = p;
        render();
      }
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "删除";
    del.addEventListener("click", () => {
      rows.splice(i, 1);
      render();
    });
    btnTd.appendChild(pick);
    btnTd.appendChild(del);

    tr.appendChild(actionTd);
    tr.appendChild(videoTd);
    tr.appendChild(btnTd);
    rowsEl.appendChild(tr);
  });
}

document.getElementById("add").addEventListener("click", () => {
  rows.push({ action: "", video: null });
  render();
});

document.getElementById("export").addEventListener("click", async () => {
  const id = document.getElementById("packId").value.trim();
  const name = document.getElementById("packName").value.trim();
  const actions = rows
    .map((r) => ({ action: r.action.trim(), video: r.video }))
    .filter((r) => r.action && r.video);
  if (!actions.some((a) => a.action.toLowerCase() === "idle")) {
    log("错误：必须有名为 idle 且已选视频的一行。");
    return;
  }
  const outFile = await window.packerApi.pickSave(`${id || "pack"}.dpet`);
  if (!outFile) return;
  log("开始出包…");
  const res = await window.packerApi.build({
    id,
    name,
    author: document.getElementById("author").value.trim(),
    size: {
      width: Number(document.getElementById("width").value),
      height: Number(document.getElementById("height").value),
    },
    chroma: document.getElementById("chroma").checked,
    actions,
    outFile,
  });
  if (!res.ok) {
    log("失败：" + res.error);
    return;
  }
  log(`完成：${res.outFile}\n动作：${Object.keys(res.pack.states).join(", ")}`);
});

window.packerApi.onProgress((msg) => log(msg));
render();
