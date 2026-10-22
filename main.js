import {
  MODULE_ID, DEFAULT_SECTION, DEFAULT_SLOTS, SLOT_TYPES, PHYSICAL_TYPES,
  inventoryState, inventorySummary, equipmentSummary, equippedIds, orderedInventories, quantity, itemDefinition
} from "./scripts/inventory-model.js";
import {
  config, ownedActors, addSection, removeSection, moveSection, moveInventory, unequip, unequipGear, dropItem,
  editInventory, installWeaponGuard, reportError
} from "./scripts/inventory-service.js";
import { InventoryConfig } from "./scripts/inventory-config.js";
import { chooseTransferAmount } from "./scripts/inventory-dialogs.js";

let hudApp = null;
let tileTemplates;
function loadTileTemplates() {
  const load = foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  return tileTemplates ??= load(["modules/cthulhu-hud/templates/item-tile.html"]);
}
const kg = value => Number(value.toFixed(3)).toLocaleString("pl-PL", { maximumFractionDigits: 3 });
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function refreshHud() {
  if (hudApp?.rendered) hudApp.render(false);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "inventoryConfig", {
    scope: "world", config: false, type: Object,
    default: { slots: { ...DEFAULT_SLOTS }, catalog: [] }, onChange: refreshHud
  });
  game.settings.registerMenu(MODULE_ID, "inventory", {
    name: "Ekwipunek — wagi i sloty", label: "Konfiguruj ekwipunek",
    hint: "Wagi przedmiotów świata, kategorie wyposażenia, liczba slotów oraz import i eksport JSON.",
    icon: "fa-solid fa-boxes-stacked", type: InventoryConfig, restricted: true
  });
});

Hooks.once("ready", async () => {
  installWeaponGuard();
  await loadTileTemplates();
});

for (const hook of ["createActor", "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem", "updateUser", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateToken"]) {
  Hooks.on(hook, refreshHud);
}

function toggleHud() {
  if (hudApp?.rendered) hudApp.close();
  else {
    hudApp ??= new CthulhuHud();
    hudApp.render(true);
  }
}

Hooks.on("getSceneControlButtons", controls => {
  const tool = {
    name: "CthulhuPlayerHud", title: "Cthulhu HUD — statystyki i ekwipunek",
    icon: "fa-solid fa-user", button: true, visible: true,
    onClick: toggleHud, onChange: toggleHud
  };
  if (Array.isArray(controls)) {
    controls.find(control => control.name === "token")?.tools.push(tool);
  } else if (controls.tokens) {
    tool.order = Object.keys(controls.tokens.tools).length;
    delete tool.onClick;
    controls.tokens.tools[tool.name] = tool;
  }
});

class CthulhuHud extends Application {
  constructor(...args) {
    super(...args);
    this.selectedActorId = game.user.character?.id ?? null;
    this.expanded = false;
    this.busy = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cthulhu-hud", title: "Cthulhu HUD",
      template: "modules/cthulhu-hud/templates/hud.html",
      width: 680, height: "auto", top: 8, left: 260, resizable: true,
      classes: ["cthulhu-hud-window"], scrollY: [".window-content"]
    });
  }

  tile(item, actor, state, settings) {
    const definition = itemDefinition(item, settings);
    const count = quantity(item);
    const weight = definition.weight === null ? "?" : kg(definition.weight);
    const equipped = equippedIds(state).has(item.id);
    const totalWeight = definition.weight === null ? "?" : kg(definition.weight * count);
    const image = item.img || "icons/svg/item-bag.svg";
    const tooltip = `<div class="cthulhu-item-tooltip"><img src="${escapeHTML(image)}" alt=""><div><strong>${escapeHTML(item.name)}</strong><p>Ilość: ${count} · ${weight} kg/szt.</p><p>Łącznie: ${totalWeight} kg</p><p>${equipped ? "Wyposażone" : "W ekwipunku"}</p></div></div>`;
    return { id: item.id, uuid: item.uuid, actorUuid: actor.uuid, name: item.name, image, count, weight, totalWeight, equipped, tooltip };
  }

  burden(actor, settings) {
    const summary = actor.type === "character" ? equipmentSummary(actor, settings) : inventorySummary(actor, settings);
    return {
      weight: kg(summary.weight), count: summary.count, unknown: summary.unknown, overloaded: summary.overloaded,
      hasLimit: summary.limit !== null, limit: summary.limit === null ? "—" : kg(summary.limit)
    };
  }

  inventory(actor, settings) {
    const state = inventoryState(actor, settings);
    const items = actor.items.filter(item => PHYSICAL_TYPES.has(item.type));
    return {
      actorId: actor.id, actorUuid: actor.uuid, name: actor.name, isVehicle: actor.type === "vehicle",
      detachable: actor.id !== this.selectedActorId,
      isGeneral: actor.id === this.selectedActorId,
      ...this.burden(actor, settings),
      sections: state.sections.map((section, index) => ({
        ...section, actorUuid: actor.uuid, removable: section.id !== DEFAULT_SECTION,
        canMoveUp: section.id !== DEFAULT_SECTION && index > 0,
        canMoveDown: section.id !== DEFAULT_SECTION && index < state.sections.length - 2,
        items: items.filter(item => state.placements.find(p => p.itemId === item.id)?.sectionId === section.id)
          .map(item => this.tile(item, actor, state, settings))
      }))
    };
  }

  async getData() {
    await loadTileTemplates();
    const available = ownedActors();
    const characters = available.filter(actor => actor.type === "character");
    const actor = characters.find(character => character.id === this.selectedActorId) ?? characters[0];
    this.selectedActorId = actor?.id ?? null;
    const settings = config();
    const attached = game.user.getFlag(MODULE_ID, "inventoryActors") ?? [];
    const inventories = orderedInventories(available, attached, actor?.id);
    const movableCount = inventories.filter(a => a.id !== actor?.id).length;
    const attrs = actor?.system?.attribs ?? {};
    const state = actor ? inventoryState(actor, settings) : null;
    const labels = { weapon: "Broń", knife: "Nóż", armor: "Pancerz" };
    return {
      actors: characters.map(a => ({ id: a.id, name: a.name, portrait: a.img || a.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg", isSelected: a.id === actor?.id })),
      hasActor: Boolean(actor), name: actor?.name ?? "Brak postaci — wybierz dostępny ekwipunek",
      hpValue: attrs.hp?.value ?? 0, hpMax: attrs.hp?.max ?? 0,
      mpValue: attrs.mp?.value ?? 0, mpMax: attrs.mp?.max ?? 0,
      sanValue: attrs.san?.value ?? 0, sanMax: attrs.san?.max ?? 0,
      luckValue: attrs.lck?.value ?? 0, cashValue: actor?.system?.monetary?.cash ?? "—",
      isGM: game.user.isGM, expanded: this.expanded,
      equippedSummary: actor ? this.burden(actor, settings) : null,
      equipmentActorUuid: actor?.uuid,
      equippedGear: actor ? state.equipped.gear.map(id => this.tile(actor.items.get(id), actor, state, settings)) : [],
      equipment: actor ? SLOT_TYPES.map(kind => ({
        kind, label: labels[kind], actorUuid: actor.uuid,
        slots: state.equipped[kind].map((id, index) => ({
          kind, index, number: index + 1, actorUuid: actor.uuid,
          item: id ? this.tile(actor.items.get(id), actor, state, settings) : null
        }))
      })) : [],
      inventories: inventories.map((a, index) => ({
        ...this.inventory(a, settings),
        canMoveUp: a.id !== actor?.id && index > 0,
        canMoveDown: a.id !== actor?.id && index < movableCount - 1
      })),
      availableInventories: available.filter(a => !inventories.includes(a)).map(a => ({ id: a.id, name: `${a.name} (${a.type === "vehicle" ? "pojazd" : "postać"})` }))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = this.element[0];
    root.classList.toggle("collapsed", !this.expanded);
    root.classList.toggle("expanded", this.expanded);
    html.find("[data-action='select-actor']").on("click", event => {
      this.selectedActorId = event.currentTarget.dataset.actorId;
      this.expanded = true;
      this.render(false);
    });
    html.find("[data-action='expand']").on("click", () => {
      this.expanded = !this.expanded;
      this.render(false);
    });
    html.find("[data-action='config']").on("click", () => new InventoryConfig().render(true));
    const run = action => {
      if (this.busy) return;
      this.busy = true;
      editInventory(action).catch(reportError).finally(() => { this.busy = false; refreshHud(); });
    };
    html.find("[data-action='attach-inventory']").on("click", () => run(async () => {
      const id = html.find("[name='inventory-actor']").val();
      if (!ownedActors().some(actor => actor.id === id)) return;
      const ids = game.user.getFlag(MODULE_ID, "inventoryActors") ?? [];
      await game.user.setFlag(MODULE_ID, "inventoryActors", [...new Set([...ids, id])]);
    }));
    html.find("[data-action='detach-inventory']").on("click", event => run(async () => {
      const id = event.currentTarget.dataset.actorId;
      const ids = game.user.getFlag(MODULE_ID, "inventoryActors") ?? [];
      await game.user.setFlag(MODULE_ID, "inventoryActors", ids.filter(value => value !== id));
    }));
    html.find("[data-action='add-section']").on("click", event => {
      const actorUuid = event.currentTarget.dataset.actorUuid;
      new Dialog({
        title: "Nowa sekcja ekwipunku",
        content: '<form><label>Nazwa sekcji <input name="section-name" type="text" maxlength="80" placeholder="np. Plecak, Bagażnik" autofocus></label></form>',
        buttons: {
          add: { label: "Dodaj", callback: dialog => run(async () => addSection(await fromUuid(actorUuid), dialog.find("[name='section-name']").val())) },
          cancel: { label: "Anuluj" }
        }, default: "add"
      }).render(true);
    });
    html.find("[data-action='remove-section']").on("click", event => run(async () => {
      const { actorUuid, sectionId } = event.currentTarget.dataset;
      await removeSection(await fromUuid(actorUuid), sectionId);
    }));
    html.find("[data-action='move-section']").on("click", event => {
      const { actorUuid, sectionId, direction } = event.currentTarget.dataset;
      run(async () => moveSection(await fromUuid(actorUuid), sectionId, direction));
    });
    html.find("[data-action='move-inventory']").on("click", event => {
      const { actorId, direction } = event.currentTarget.dataset;
      run(async () => moveInventory(actorId, direction, this.selectedActorId));
    });
    html.find("[data-action='unequip-gear']").on("click", event => {
      event.stopPropagation();
      const { actorUuid, itemId } = event.currentTarget.dataset;
      run(async () => unequipGear(await fromUuid(actorUuid), itemId));
    });
    html.find("[data-action='unequip']").on("click", event => {
      event.stopPropagation();
      const { actorUuid, kind, index } = event.currentTarget.dataset;
      run(async () => unequip(await fromUuid(actorUuid), kind, Number(index)));
    });
    html.find(".hud-item-tile").on("dblclick", async event => {
      try {
        const item = await fromUuid(event.currentTarget.dataset.uuid);
        if (item?.isOwner) item.sheet.render(true);
      } catch (error) { reportError(error); }
    });
    html.find(".hud-item-tile").on("dragstart", event => {
      const tile = event.currentTarget;
      const data = { type: "Item", uuid: tile.dataset.uuid, fromSlot: Boolean(tile.closest(".hud-equipped-item")) };
      event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(data));
      event.originalEvent.dataTransfer.effectAllowed = "copyMove";
    });
    html.find(".hud-drop-zone").on("dragover", event => {
      event.preventDefault();
      event.currentTarget.classList.add("is-dragover");
    }).on("dragleave", event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove("is-dragover");
    }).on("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.remove("is-dragover");
      const { actorUuid, sectionId, kind, index } = event.currentTarget.dataset;
      const mergeItemId = event.target?.closest(".hud-item-tile")?.dataset.itemId;
      const raw = event.originalEvent.dataTransfer.getData("text/plain");
      run(async () => {
        let data;
        try { data = JSON.parse(raw); }
        catch { throw new Error("Nieprawidłowe dane przeciąganego przedmiotu."); }
        const item = data.type === "Item" && data.uuid ? await fromUuid(data.uuid) : null;
        if (!item || !PHYSICAL_TYPES.has(item.type)) throw new Error("Przeciągnij przedmiot z ekwipunku.");
        const expectedQuantity = quantity(item);
        const amount = await chooseTransferAmount(item);
        if (amount === null) return;
        await dropItem(data, { actorUuid, sectionId, kind, index: Number(index), mergeItemId, amount, expectedQuantity });
      });
    });
  }
}
