/* Fallback notes sit in the window, wrap, and stay up long enough to read.
   Positioning lives in pet.css so the page CSP can keep style-src 'self'. */
(function () {
  function mount(host, opts) {
    let node = null;
    let token = 0;

    function windowSize() {
      const width = opts && opts.width ? opts.width() : host && host.clientWidth;
      const height = opts && opts.height ? opts.height() : host && host.clientHeight;
      return { width: width || 96, height: height || 352 };
    }

    function show(text) {
      const label = String(text || "").trim();
      if (!label || !host || !window.PetNoteLayout) return;
      token += 1;
      const mine = token;
      if (node) {
        node.remove();
        node = null;
      }
      const size = windowSize();
      const plan = window.PetNoteLayout.fitPetNote(label, size.width, size.height);
      node = document.createElement("div");
      node.className = "pet-floater";
      const span = document.createElement("span");
      span.className = "pet-floater-line";
      span.textContent = label;
      node.appendChild(span);
      host.appendChild(node);
      const finish = () => {
        if (mine !== token || !node) return;
        node.remove();
        node = null;
      };
      setTimeout(finish, plan.holdMs);
    }

    return { show };
  }

  window.PetFloater = { mount };
})();
