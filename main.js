let hudApp = null;
const actor = game.user.character;

Hooks.on("getSceneControlButtons", controls => {
  controls.notes.tools.CthulhuPlayerHud  = {
    name: "CthulhuPlayerHud",
    title: "Notes.PlayerHud",
    icon: "fa-solid fa-user",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: true,
    onChange: active => {
  if (active) {
        if (!hudApp) hudApp = new CthulhuHud();
        hudApp.render(true);
      } else {
        if (hudApp) hudApp.close();
      }
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
      template: null,               // Na razie nie używamy osobnego HTML-a
      popOut: true,                 // okno oderwane typu popup
      width: 1200,
      height: "auto",
      classes: ["cthulhu-hud-window"]
    });
  }

  getData() {
    return {
      message: "HUD działa!"
    };
  }
  
  async _renderInner(data) {
  const div = document.createElement("div");
  div.innerHTML = `
    <div style="padding: 10px;">
    <h2 style="margin:0; font-size: 20px;">Cthulhu HUD</h2>
    <p>${data.message}</p>
    </div>
    `;
  return div;
  }

  activateListeners(html) {
  super.activateListeners(html);
    // tu dodasz kliknięcia później
  }
}
;
