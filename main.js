let hudApp = null;

Hooks.on("getSceneControlButtons", controls => {
  controls.notes.tools.CthulhuPlayerHud  = {
    name: "CthulhuPlayerHud",
    title: "Najważnieszje staty",
    icon: "fa-solid fa-user",
    order: Object.keys(controls.notes.tools).length,
    button: true,
    visible: true,
    onChange: active => {
  if (active) {
        if (!hudApp) hudApp = new CthulhuHud();
        hudApp.render(true);
      } else {
        if (hudApp) hudApp.close();
      }

  const actor = game.user.character;
  if (!actor) {
  console.log("Brak przypisanego aktora!");
  } else {
    const name = actor.name;
    const hpValue = actor.system.attribs.hp.value;
    const hpMax = actor.system.attribs.hp.max;
    const sanValue = actor.system.attribs.san.value;
    const sanMax = actor.system.attribs.san.max;
    const luckValue = actor.system.attribs.lck.value;
    const mpValue = actor.system.attribs.mp.value;
    const mpMax = actor.system.attribs.mp.max;

console.log("=== DANE AKTORA ===");

console.log("Imię i nazwisko:", actor.name);

// HP
console.log("HP:", actor.system.attribs.hp.value, "/", actor.system.attribs.hp.max);

// SAN
console.log("SAN:", actor.system.attribs.san.value, "/", actor.system.attribs.san.max);

// Luck
console.log("Luck:", actor.system.attribs.lck.value);

// Magic Points
console.log("MP:", actor.system.attribs.mp.value, "/", actor.system.attribs.mp.max);
}
}
  };
})

class CthulhuHud extends Application {
    static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cthulhu-hud",
      title: "Cthulhu HUD",
      template: "modules/cthulhu-hud/templates/hud.html",
      popOut: true,                 // okno oderwane typu popup
      width: 600,
      height: "auto",
      classes: ["cthulhu-hud-window"]
    });
  }

getData() {
  const actor = game.user.character;
  if (!actor) {
    return {
      name: "Brak postaci",
      hpValue: 0,
      hpMax: 0,
      sanValue: 0,
      sanMax: 0,
      luckValue: 0,
      mpValue: 0,
      mpMax: 0,
      cashValue: 0
    };
  }

  return {
    name: actor.name,
    hpValue: actor.system.attribs.hp.value,
    hpMax: actor.system.attribs.hp.max,
    sanValue: actor.system.attribs.san.value,
    sanMax: actor.system.attribs.san.max,
    luckValue: actor.system.attribs.lck.value,
    mpValue: actor.system.attribs.mp.value,
    mpMax: actor.system.attribs.mp.max,
    cashValue: actor.system.monetary.cash
  };
}


  activateListeners(html) {
  super.activateListeners(html);
  // this.element to jQuery owijające .window-app (główny kontener okna)
  const rootEl = this.element[0];

  // start: zwinięty
  rootEl.classList.add("collapsed");

  html.find(".cthulhu-hud-tab").on("click", () => {
    if (rootEl.classList.contains("collapsed")) {
      rootEl.classList.remove("collapsed");
      rootEl.classList.add("expanded");
    } else {
      rootEl.classList.remove("expanded");
      rootEl.classList.add("collapsed");
    }
  });
  }
}
;
