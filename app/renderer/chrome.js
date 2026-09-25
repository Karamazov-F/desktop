function winApi() {
  return window.petApi || window.packerApi || {};
}

document.querySelectorAll("[data-win]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const act = btn.getAttribute("data-win");
    const api = winApi();
    if (act === "min") api.windowMin?.();
    if (act === "close") api.windowClose?.();
  });
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") winApi().windowClose?.();
});
