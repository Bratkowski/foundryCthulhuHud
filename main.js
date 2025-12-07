
Hooks.on("getSceneControlButtons", controls => {
  controls.tokens.tools.CthulhuPlayerHud  = {
    name: "CthulhuPlayerHud",
    title: "Notes.PlayerHud",
    icon: "fa-solid fa-wrench",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: true,
    onChange: active => {
  console.log("Kliknięto HUD:", active);
}
  };
});
