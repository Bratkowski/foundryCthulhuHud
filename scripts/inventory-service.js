import {
  MODULE_ID, DEFAULT_SECTION, DEFAULT_SLOTS, PHYSICAL_TYPES, SLOT_TYPES,
  isInventoryActor, inventoryState, itemDefinition, itemKey, quantity, equippedWeapon
} from "./inventory-model.js";

export function config() {
  return game.settings.get(MODULE_ID, "inventoryConfig") ?? { slots: { ...DEFAULT_SLOTS }, catalog: [] };
}

export function ownedActors() {
  return game.actors.filter(actor => isInventoryActor(actor) && actor.isOwner);
}

export function assertOwner(actor) {
  if (!isInventoryActor(actor) || !actor.isOwner) throw new Error("Wymagane prawo właściciela do tego ekwipunku.");
}

export function reportError(error) {
  console.error(`${MODULE_ID} |`, error);
  ui.notifications.error(error.message ?? "Nie udało się zmienić ekwipunku.");
}

// Serialize local edits so two quick drops never save an outdated copy of the flags.
let editQueue = Promise.resolve();
export function editInventory(action) {
  const operation = editQueue.then(action);
  editQueue = operation.catch(() => {});
  return operation;
}

export async function saveState(actor, state) {
  assertOwner(actor);
  return actor.setFlag(MODULE_ID, "inventory", state);
}

export async function addSection(actor, name) {
  assertOwner(actor);
  name = name.trim();
  if (!name || name.length > 80) throw new Error("Nazwa sekcji musi mieć od 1 do 80 znaków.");
  const state = inventoryState(actor, config());
  state.sections.push({ id: foundry.utils.randomID(), name });
  await saveState(actor, state);
}

export async function removeSection(actor, sectionId) {
  assertOwner(actor);
  if (sectionId === DEFAULT_SECTION) return;
  const state = inventoryState(actor, config());
  state.sections = state.sections.filter(section => section.id !== sectionId);
  for (const placement of state.placements) {
    if (placement.sectionId === sectionId) placement.sectionId = DEFAULT_SECTION;
  }
  await saveState(actor, state);
}

export async function unequip(actor, kind, index) {
  assertOwner(actor);
  const state = inventoryState(actor, config());
  if (!SLOT_TYPES.includes(kind) || !Number.isInteger(index) || index < 0 || index >= state.equipped[kind].length) return;
  state.equipped[kind][index] = null;
  await saveState(actor, state);
}

function rebindWeaponSkills(itemData, source, destination) {
  if (itemData.type !== "weapon") return;
  for (const reference of Object.values(itemData.system?.skill ?? {})) {
    if (!reference || typeof reference !== "object") continue;
    const previous = source?.items.get(reference.id);
    const cocid = previous?.flags?.CoC7?.cocidFlag?.id;
    const name = reference.name || cocid || previous?.name;
    const match = destination.items.find(skill => skill.type === "skill" && (
      (cocid && skill.flags?.CoC7?.cocidFlag?.id === cocid) ||
      (name && (skill.flags?.CoC7?.cocidFlag?.id === name || skill.name === name)) ||
      (previous?.name && skill.name === previous.name)
    ));
    reference.id = match?.id ?? "";
    if (name) reference.name = name;
  }
}

export async function dropItem(data, target) {
  const destination = await fromUuid(target.actorUuid);
  assertOwner(destination);
  if (data.type !== "Item" || !data.uuid) throw new Error("Przeciągnij przedmiot z ekwipunku.");
  const item = await fromUuid(data.uuid);
  if (!item || !PHYSICAL_TYPES.has(item.type)) throw new Error("Ten dokument nie jest przedmiotem ekwipunku.");
  const source = item.parent;
  if (source) assertOwner(source);
  else if (!item.testUserPermission(game.user, "OBSERVER")) throw new Error("Nie masz dostępu do tego przedmiotu.");
  const settings = config();
  const state = inventoryState(destination, settings);
  if (target.kind) {
    const definition = itemDefinition(item, settings);
    if (destination.type !== "character" || !SLOT_TYPES.includes(target.kind) || definition.kind !== target.kind) {
      throw new Error("Przedmiot nie pasuje do tego slotu. Kategorię ustawia MG w konfiguracji ekwipunku.");
    }
    if (quantity(item) <= 0) throw new Error("Nie można wyposażyć przedmiotu o zerowej ilości.");
    if (!Number.isInteger(target.index) || target.index < 0 || target.index >= state.equipped[target.kind].length) throw new Error("Ten slot już nie istnieje.");
    if (state.equipped[target.kind][target.index] && !(source?.uuid === destination.uuid && state.equipped[target.kind][target.index] === item.id)) {
      throw new Error("Slot jest zajęty. Najpierw zdejmij wyposażenie przyciskiem ×.");
    }
  } else if (!state.sections.some(section => section.id === target.sectionId)) {
    throw new Error("Ta sekcja już nie istnieje.");
  }

  if (source?.uuid === destination.uuid) {
    if (target.kind) {
      for (const kind of SLOT_TYPES) state.equipped[kind] = state.equipped[kind].map(id => id === item.id ? null : id);
      state.equipped[target.kind][target.index] = item.id;
    } else {
      state.placements.find(p => p.itemId === item.id).sectionId = target.sectionId;
      // Dropping an equipped tile in a bag explicitly puts it away.
      if (data.fromSlot) {
        for (const kind of SLOT_TYPES) state.equipped[kind] = state.equipped[kind].map(id => id === item.id ? null : id);
      }
    }
    await saveState(destination, state);
    return;
  }

  // Create first; remove the source only once the target item and placement are saved.
  const itemData = item.toObject();
  delete itemData._id;
  delete itemData.folder;
  rebindWeaponSkills(itemData, source, destination);
  const [created] = await destination.createEmbeddedDocuments("Item", [itemData]);
  if (!created) throw new Error("Nie udało się dodać przedmiotu do docelowego ekwipunku.");
  try {
    const latest = inventoryState(destination, settings);
    if (target.kind && latest.equipped[target.kind]?.[target.index]) throw new Error("Slot został zajęty podczas przenoszenia.");
    if (!target.kind && !latest.sections.some(section => section.id === target.sectionId)) throw new Error("Sekcja została usunięta podczas przenoszenia.");
    latest.placements.find(p => p.itemId === created.id).sectionId = target.sectionId ?? DEFAULT_SECTION;
    if (target.kind) latest.equipped[target.kind][target.index] = created.id;
    await saveState(destination, latest);
    if (source) {
      const removed = await source.deleteEmbeddedDocuments("Item", [item.id]);
      if (!removed.some(document => document.id === item.id)) throw new Error("Przeniesienie anulowane: przedmiot pozostał w źródłowym ekwipunku.");
    }
  } catch (error) {
    try {
      await destination.deleteEmbeddedDocuments("Item", [created.id]);
    } catch (rollbackError) {
      console.error(`${MODULE_ID} | Cofnięcie przeniesienia`, rollbackError);
      ui.notifications.error("Nie udało się cofnąć przeniesienia. Sprawdź oba ekwipunki przed kolejną próbą.");
    }
    throw error;
  }
}

export function worldCatalog() {
  const rows = new Map(config().catalog.map(row => [row.key, { ...row, present: false }]));
  const allItems = [...game.items, ...[...game.actors].flatMap(actor => [...actor.items])];
  for (const item of allItems.filter(item => PHYSICAL_TYPES.has(item.type))) {
    const key = itemKey(item);
    rows.set(key, { ...itemDefinition(item, config()), present: true });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

function speakerActor() {
  const speaker = ChatMessage.getSpeaker();
  if (typeof ChatMessage.getSpeakerActor === "function") return ChatMessage.getSpeakerActor(speaker);
  if (speaker.token) {
    const token = game.scenes.get(speaker.scene)?.tokens.get(speaker.token);
    if (token?.actor) return token.actor;
  }
  return game.actors.get(speaker.actor) ?? game.user.character;
}

const WRAPPED = Symbol.for(`${MODULE_ID}.weaponGuard`);
export function installWeaponGuard() {
  const macros = game.CoC7?.macros;
  const original = macros?.weaponCheck;
  if (typeof original === "function" && !original[WRAPPED]) {
    const wrapped = function (data, event, ...args) {
      const actor = speakerActor();
      if (actor?.type !== "character") return original.call(this, data, event, ...args);
      const weapon = equippedWeapon(actor, data, config());
      if (!weapon) {
        event?.preventDefault?.();
        ui.notifications.warn(`${actor.name}: ta broń nie jest wyposażona. Umieść ją w slocie broni lub noża w HUD-zie.`);
        return false;
      }
      return original.call(this, { ...data, name: weapon.name, id: weapon.id, uuid: weapon.uuid }, event, ...args);
    };
    wrapped[WRAPPED] = true;
    macros.weaponCheck = wrapped;
  }
  // Also cover direct actor.weaponCheck calls, including system content links.
  const prototype = CONFIG.Actor.documentClass.prototype;
  const actorCheck = prototype.weaponCheck;
  if (typeof actorCheck === "function" && !actorCheck[WRAPPED]) {
    const wrapped = function (data, ...args) {
      if (this.type !== "character") return actorCheck.call(this, data, ...args);
      const weapon = equippedWeapon(this, data, config());
      if (!weapon) {
        ui.notifications.warn(`${this.name}: ta broń nie jest wyposażona.`);
        return false;
      }
      return actorCheck.call(this, { ...data, name: weapon.name, id: weapon.id, uuid: weapon.uuid }, ...args);
    };
    wrapped[WRAPPED] = true;
    prototype.weaponCheck = wrapped;
  }
  // CoC7 8.16 actor sheets call weaponRoll directly and bypass weaponCheck.
  const actorRoll = prototype.weaponRoll;
  if (typeof actorRoll === "function" && !actorRoll[WRAPPED]) {
    const wrapped = function (weapon, ...args) {
      if (this.type !== "character") return actorRoll.call(this, weapon, ...args);
      const equipped = equippedWeapon(this, weapon, config());
      if (!equipped) {
        ui.notifications.warn(`${this.name}: ${weapon?.name ?? "ta broń"} nie jest wyposażona. Umieść ją w slocie broni lub noża w HUD-zie.`);
        return false;
      }
      return actorRoll.call(this, equipped, ...args);
    };
    wrapped[WRAPPED] = true;
    prototype.weaponRoll = wrapped;
  }
}
