/* Body floater: a short hop onto the body center, then a still hold.
   Not the speech bubble. Black fill, solid white outline, no glow.
   20px up to center in 0.2s, then hold 1.8s.
   Positioning lives in pet.css so the page CSP can keep style-src 'self'. */
(function () {
  const RISE_MS = 2000;

  function mount(host) {
    let node = null;
    let token = 0;

    function show(text) {
      const label = String(text || "").trim();
      if (!label || !host) return;
      token += 1;
      const mine = token;
      if (node) {
        node.remove();
        node = null;
      }
      node = document.createElement("div");
      node.className = "pet-floater";
      const span = document.createElement("span");
      span.className = "pet-floater-text";
      span.textContent = label;
      node.appendChild(span);
      host.appendChild(node);
      const finish = () => {
        if (mine !== token || !node) return;
        node.remove();
        node = null;
      };
      node.addEventListener("animationend", finish);
      setTimeout(finish, RISE_MS + 200);
    }

    return { show };
  }

  window.PetFloater = { mount };
})();
