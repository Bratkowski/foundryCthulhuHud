let hudApp = null;

Hooks.on("getSceneControlButtons", controls => {
  controls.notes.tools.CthulhuPlayerHud  = {
    name: "CthulhuPlayerHud",
    title: "Notes.PlayerHud",
    icon: "fa-solid fa-user",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: true,
    onChange: active => {
  console.log("Kliknięto HUD:", active);
  if (active) {
        if (!hudApp) hudApp = new CthulhuHud();
        hudApp.render(true);
      } else {
        if (hudApp) hudApp.close();
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
      width: 300,
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
