const wrap = document.getElementById("wrap");
const sub = document.getElementById("sub");
const subPanel = document.getElementById("sub-panel");
const actionsBtn = document.getElementById("actions-btn");

function send(cmd) {
  window.petApi.petMenuCommand?.(cmd);
}

function openSub() {
  actionsBtn.classList.add("hot");
  sub.classList.add("open");
}

function closeSub() {
  actionsBtn.classList.remove("hot");
  sub.classList.remove("open");
}

document.querySelectorAll("#menu .item").forEach((btn) => {
  btn.addEventListener("mousedown", (e) => {
    const kind = btn.getAttribute("data-kind");
    if (kind === "actions") {
      e.preventDefault();
      openSub();
      return;
    }
    send({ kind });
  });
  if (btn !== actionsBtn) {
    btn.addEventListener("mouseenter", closeSub);
  }
});

actionsBtn.addEventListener("mouseenter", openSub);
sub.addEventListener("mouseenter", openSub);

// Only dismiss the flyout when the cursor leaves menu+bridge+submenu.
wrap.addEventListener("mouseleave", closeSub);

async function init() {
  const data = (await window.petApi.getPetMenu?.()) || { actions: [] };
  subPanel.innerHTML = "";
  for (const a of data.actions || []) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "item";
    b.textContent = a.label;
    b.addEventListener("mousedown", () => send({ kind: "action", id: a.id }));
    subPanel.appendChild(b);
  }
}

init().catch(console.error);
