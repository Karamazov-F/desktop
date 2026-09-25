/* Body floater: a short hop onto the body center, then a still hold.
   Not the speech bubble. Black fill, solid white outline, no glow.
   20px up to center in 0.2s, then hold 1.8s. */
(function () {
  const STYLE_ID = "pet-floater-style";
  const RISE_MS = 2000;
  const RISE_PX = 20;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".pet-floater{position:absolute;left:50%;top:50%;z-index:6;pointer-events:none;",
      "animation:pet-floater-rise 2s linear forwards;}",
      ".pet-floater-text{display:block;color:#111;font:700 16px/1.15 var(--pet-ui-font);",
      "white-space:nowrap;letter-spacing:.02em;",
      "text-shadow:",
      "0 -2px 0 #fff,0 2px 0 #fff,-2px 0 0 #fff,2px 0 0 #fff,",
      "-2px -2px 0 #fff,2px -2px 0 #fff,-2px 2px 0 #fff,2px 2px 0 #fff,",
      "0 -1px 0 #fff,0 1px 0 #fff,-1px 0 0 #fff,1px 0 0 #fff;}",
      "@keyframes pet-floater-rise{",
      "0%{transform:translate(-50%,calc(-50% + var(--rise, 20px)));opacity:1}",
      "10%{transform:translate(-50%,-50%);opacity:1}",
      "100%{transform:translate(-50%,-50%);opacity:1}}",
    ].join("");
    document.head.appendChild(style);
  }

  function mount(host) {
    let node = null;
    let token = 0;

    function show(text) {
      const label = String(text || "").trim();
      if (!label || !host) return;
      ensureStyle();
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
      node.style.setProperty("--rise", RISE_PX + "px");
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
