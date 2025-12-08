let hudApp = null;

// Automatyczny refresh HUD-u gdy jakikolwiek aktor się zmienia
Hooks.on("updateActor", (actor, data) => {
  if (hudApp) hudApp.render(false);
});


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

    // 1) NOWE: konstruktor – stan: który aktor jest wybrany
  constructor(...args) {
    super(...args);

    const userChar = game.user.character;
    this.selectedActorId = userChar ? userChar.id : null;
  }

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
  let characters;

  if (game.user.isGM) {
    // MG – wszyscy badacze typu "character" z właścicielem
    characters = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
  } else {
    // gracz – tylko jego postać
    const userChar = game.user.character;
    characters = userChar ? [userChar] : [];
  }

  // jeśli nic nie jest wybrane, a lista nie jest pusta → wybierz pierwszego
  if (!this.selectedActorId && characters.length > 0) {
    this.selectedActorId = characters[0].id;
  }

  // wybrany aktor (albo pierwszy z listy)
  const actor = characters.find(a => a.id === this.selectedActorId) ?? characters[0];

  // lista do paska portretów
  const actorTabs = characters.map(a => ({
    id: a.id,
    name: a.name,
    portrait: a.img || (a.prototypeToken.texture.src),
    isSelected: a.id === this.selectedActorId
  }));

  // jeśli z jakiegoś powodu nie ma aktora
  if (!actor) {
    return {
      actors: actorTabs,
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

  // normalny przypadek
  return {
    actors: actorTabs,  // ← NAJWAŻNIEJSZE
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

  const rootEl = this.element[0];

  // Pierwsze renderowanie: start jako "collapsed"
  if (!rootEl.classList.contains("collapsed") &&
      !rootEl.classList.contains("expanded")) {
    rootEl.classList.add("collapsed");
  }

  // Kliknięcie portretu:
  // - zmiana aktora
  // - rozwinięcie HUD-u
  html.find(".hud-actor-tab").on("click", ev => {
    const id = ev.currentTarget.dataset.actorId;
    if (!id) return;

    // zmiana wybranego aktora
    if (id !== this.selectedActorId) {
      this.selectedActorId = id;
      this.render(false);
    }

    // rozwiń HUD (jeśli jest złożony)
    rootEl.classList.remove("collapsed");
    rootEl.classList.add("expanded");
  });
}




}
;
