let activeMenu;

export function closeItemMenu() {
  activeMenu?.();
}

// Render outside the HUD's scrolling window so neither menu is clipped by it.
export function showItemMenu({ anchor, x, y, entries, onError }) {
  closeItemMenu();
  const root = document.createElement("div");
  root.className = "cthulhu-item-menu";
  root.setAttribute("aria-label", "Opcje przedmiotu");
  const panel = document.createElement("div");
  panel.className = "hud-context-panel";
  panel.setAttribute("role", "menu");
  root.append(panel);
  let submenu;
  let submenuButton;

  const close = (restoreFocus = false) => {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape, true);
    document.removeEventListener("scroll", scroll, true);
    window.removeEventListener("resize", close);
    root.remove();
    if (activeMenu === close) activeMenu = null;
    if (restoreFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
  };
  const outside = event => { if (!root.contains(event.target)) close(); };
  const escape = event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };
  const scroll = event => { if (!root.contains(event.target)) close(); };
  const position = (element, left, top) => {
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(4, Math.min(left, window.innerWidth - rect.width - 4))}px`;
    element.style.top = `${Math.max(4, Math.min(top, window.innerHeight - rect.height - 4))}px`;
  };
  const hideSubmenu = () => {
    submenu?.remove();
    submenu = null;
    submenuButton?.setAttribute("aria-expanded", "false");
  };
  const buttons = menu => [...menu.querySelectorAll(":scope > button:not(:disabled)")];

  function addEntry(menu, entry) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.disabled = Boolean(entry.disabled);
    const icon = document.createElement("i");
    icon.className = `fa-solid ${entry.icon ?? "fa-box"}`;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = entry.label;
    button.append(icon, label);
    if (entry.danger) button.classList.add("is-danger");
    menu.append(button);
    if (entry.children) {
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      const arrow = document.createElement("span");
      arrow.className = "hud-context-arrow";
      arrow.textContent = "▸";
      button.append(arrow);
      const open = () => {
        if (submenu && submenuButton === button) return;
        hideSubmenu();
        submenuButton = button;
        submenu = document.createElement("div");
        submenu.className = "hud-context-panel hud-context-submenu";
        submenu.setAttribute("role", "menu");
        submenu.setAttribute("aria-label", entry.label);
        for (const child of entry.children) addEntry(submenu, child);
        root.append(submenu);
        button.setAttribute("aria-expanded", "true");
        const rect = button.getBoundingClientRect();
        const width = submenu.getBoundingClientRect().width;
        const left = rect.right + width + 4 > window.innerWidth ? rect.left - width : rect.right;
        position(submenu, left, rect.top);
      };
      button.addEventListener("mouseenter", open);
      button.addEventListener("focus", open);
      button.addEventListener("click", () => { open(); buttons(submenu)[0]?.focus(); });
      button.addEventListener("keydown", event => {
        if (event.key !== "ArrowRight") return;
        event.preventDefault();
        open();
        buttons(submenu)[0]?.focus();
      });
    } else {
      if (menu === panel) {
        button.addEventListener("mouseenter", hideSubmenu);
        button.addEventListener("focus", hideSubmenu);
      }
      button.addEventListener("click", () => {
        close(true);
        Promise.resolve().then(() => entry.action?.()).catch(onError);
      });
    }
  }

  for (const entry of entries) addEntry(panel, entry);
  root.addEventListener("contextmenu", event => event.preventDefault());
  root.addEventListener("keydown", event => {
    const menu = event.target.closest("[role='menu']");
    if (!menu) return;
    if (event.key === "ArrowLeft" && menu === submenu) {
      event.preventDefault();
      const parent = submenuButton;
      parent.focus();
      hideSubmenu();
      return;
    }
    const items = buttons(menu);
    const index = items.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Tab") { close(); return; }
    else return;
    event.preventDefault();
    items[next]?.focus();
  });
  document.body.append(root);
  position(root, x, y);
  activeMenu = close;
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", escape, true);
  document.addEventListener("scroll", scroll, true);
  window.addEventListener("resize", close);
  buttons(panel)[0]?.focus({ preventScroll: true });
}
