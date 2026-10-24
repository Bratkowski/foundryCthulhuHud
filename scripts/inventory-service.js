import {
  MODULE_ID, DEFAULT_SECTION, DEFAULT_SLOTS, PHYSICAL_TYPES, SLOT_TYPES, EQUIPMENT_TYPES,
  isInventoryActor, inventoryState, equippedIds, itemDefinition, itemKey, quantity, isStackable, canStack,
  weaponForCheck, reorderIds, orderedInventories
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
  state.sections.splice(state.sections.length - 1, 0, { id: foundry.utils.randomID(), name });
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
  const item = actor.items.get(state.equipped[kind][index]);
  if (isStackable(item)) return dropItem({ type: "Item", uuid: item.uuid }, itemLocation(actor, item.id, state, true));
  state.equipped[kind][index] = null;
  await saveState(actor, state);
}

export async function unequipGear(actor, itemId) {
  assertOwner(actor);
  const state = inventoryState(actor, config());
  const item = actor.items.get(itemId);
  if (isStackable(item)) return dropItem({ type: "Item", uuid: item.uuid }, itemLocation(actor, itemId, state, true));
  state.equipped.gear = state.equipped.gear.filter(id => id !== itemId);
  await saveState(actor, state);
}

export async function equipItem(item, actor = item?.parent, options = {}) {
  assertOwner(actor);
  if (actor.type !== "character") throw new Error("Wyposażenie wymaga postaci.");
  const settings = config();
  const state = inventoryState(actor, settings);
  if (item?.parent?.uuid === actor.uuid && equippedIds(state).has(item.id)) return item;
  const kind = itemDefinition(item, settings).kind;
  const index = kind === "gear" ? undefined : state.equipped[kind]?.indexOf(null);
  if (kind !== "gear" && !(index >= 0)) throw new Error("Brak wolnego slotu tej kategorii. Najpierw zdejmij wyposażony przedmiot.");
  return dropItem({ type: "Item", uuid: item.uuid }, { ...options, actorUuid: actor.uuid, kind, index });
}

export async function deleteInventoryItem(actor, itemId) {
  assertOwner(actor);
  const item = actor.items.get(itemId);
  if (!item || !PHYSICAL_TYPES.has(item.type)) throw new Error("Ten przedmiot nie jest już dostępny w ekwipunku.");
  await removeItem(actor, itemId);
  // inventoryState filters deleted IDs from both placements and equipment.
}

export async function moveSection(actor, sectionId, direction) {
  assertOwner(actor);
  if (sectionId === DEFAULT_SECTION) return;
  const state = inventoryState(actor, config());
  const custom = state.sections.filter(section => section.id !== DEFAULT_SECTION);
  const order = reorderIds(custom.map(section => section.id), sectionId, direction);
  state.sections = [...order.map(id => custom.find(section => section.id === id)), state.sections.at(-1)];
  await saveState(actor, state);
}

export async function moveInventory(actorId, direction, selectedActorId) {
  if (actorId === selectedActorId) return;
  const attached = game.user.getFlag(MODULE_ID, "inventoryActors") ?? [];
  const visible = orderedInventories(ownedActors(), attached, selectedActorId).filter(actor => actor.id !== selectedActorId);
  const order = reorderIds(visible.map(actor => actor.id), actorId, direction);
  if (attached.includes(selectedActorId)) order.push(selectedActorId);
  await game.user.setFlag(MODULE_ID, "inventoryActors", order);
}

function putAway(state, itemId) {
  for (const kind of EQUIPMENT_TYPES) {
    state.equipped[kind] = kind === "gear"
      ? state.equipped[kind].filter(id => id !== itemId)
      : state.equipped[kind].map(id => id === itemId ? null : id);
  }
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

function itemLocation(actor, itemId, state, storageOnly = false) {
  if (!storageOnly) {
    for (const kind of EQUIPMENT_TYPES) {
      const index = state.equipped[kind].indexOf(itemId);
      if (index >= 0) return { actorUuid: actor.uuid, kind, index };
    }
  }
  return { actorUuid: actor.uuid, sectionId: state.placements.find(p => p.itemId === itemId)?.sectionId ?? DEFAULT_SECTION };
}

function inLocation(item, target, state) {
  if (target.kind === "gear") return state.equipped.gear.includes(item.id);
  if (target.kind) return state.equipped[target.kind]?.[target.index] === item.id;
  return !equippedIds(state).has(item.id) && state.placements.find(p => p.itemId === item.id)?.sectionId === target.sectionId;
}

function validateTarget(destination, item, target, state, settings) {
  if (target.kind) {
    if (destination.type !== "character" || !EQUIPMENT_TYPES.includes(target.kind) || itemDefinition(item, settings).kind !== target.kind) {
      throw new Error("Przedmiot nie pasuje do tego slotu. Kategorię ustawia MG w konfiguracji ekwipunku.");
    }
    if (quantity(item) <= 0) throw new Error("Nie można wyposażyć przedmiotu o zerowej ilości.");
    if (target.kind !== "gear" && (!Number.isInteger(target.index) || target.index < 0 || target.index >= state.equipped[target.kind].length)) {
      throw new Error("Ten slot już nie istnieje.");
    }
  } else if (!state.sections.some(section => section.id === target.sectionId)) {
    throw new Error("Ta sekcja już nie istnieje.");
  }
}

function placeItem(state, itemId, target, homeSection = DEFAULT_SECTION) {
  const placement = state.placements.find(p => p.itemId === itemId);
  if (!target.kind) placement.sectionId = target.sectionId;
  else if (homeSection) placement.sectionId = homeSection;
  putAway(state, itemId);
  if (target.kind === "gear") state.equipped.gear.push(itemId);
  else if (target.kind) state.equipped[target.kind][target.index] = itemId;
}

async function setQuantity(item, value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Ilość musi być dodatnią liczbą całkowitą.");
  await item.update({ "system.quantity": value });
  const current = item.parent ? item.parent.items.get(item.id) : item;
  if (!current || quantity(current) !== value) throw new Error("Zmiana ilości przedmiotu została anulowana.");
}

async function restoreQuantity(item, value) {
  const current = item.parent?.items.get(item.id) ?? (!item.parent ? item : null);
  if (current && quantity(current) !== value) await setQuantity(current, value);
}

async function removeItem(actor, itemId) {
  const removed = await actor.deleteEmbeddedDocuments("Item", [itemId]);
  if (!removed.some(item => item.id === itemId) || actor.items.get(itemId)) throw new Error("Usunięcie przedmiotu zostało anulowane.");
}

async function consumeSource(item, amount, available, progress) {
  if (!item.parent) return; // World-directory items are copied as templates.
  const current = item.parent.items.get(item.id);
  if (!current || quantity(current) !== available) throw new Error("Ilość w źródłowym stosie zmieniła się. Spróbuj ponownie.");
  if (amount < available) {
    progress.sourceQuantityChanged = true;
    await setQuantity(current, available - amount);
  } else {
    try { await removeItem(item.parent, item.id); }
    catch (error) {
      // A lost response after deletion must not roll back an already completed move.
      if (item.parent.items.get(item.id)) throw error;
    }
  }
}

async function recoverTransfer(action) {
  try { await action(); }
  catch (error) {
    console.error(`${MODULE_ID} | Cofnięcie przeniesienia`, error);
    ui.notifications.error("Nie udało się w pełni cofnąć przeniesienia. Sprawdź ilości w obu ekwipunkach przed kolejną próbą.");
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
  const available = quantity(item);
  const amount = target.amount ?? available;
  if (target.expectedQuantity !== undefined && target.expectedQuantity !== available) throw new Error("Ilość w źródłowym stosie zmieniła się. Spróbuj ponownie.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > available) throw new Error("Nieprawidłowa liczba sztuk do przeniesienia.");
  if (isStackable(item) && !Number.isSafeInteger(amount)) throw new Error("Przenoś wyłącznie całe sztuki przedmiotów.");
  if (amount < available && !isStackable(item)) throw new Error("Ten typ przedmiotu nie obsługuje dzielenia na sztuki.");

  let merge = null;
  if (isStackable(item) && target.mergeItemId) {
    const candidate = destination.items.get(target.mergeItemId);
    if (!candidate) throw new Error("Docelowy stos już nie istnieje.");
    if (candidate.uuid !== item.uuid && itemKey(candidate) === itemKey(item)) {
      if (!canStack(item, candidate)) throw new Error("Te stosy mają różne dane przedmiotu i nie mogą zostać połączone.");
      merge = candidate;
      target = { ...target, kind: undefined, index: undefined, sectionId: undefined, ...itemLocation(destination, candidate.id, state) };
    }
  }
  validateTarget(destination, item, target, state, settings);
  if (!merge && isStackable(item)) {
    merge = destination.items.find(candidate => candidate.uuid !== item.uuid && canStack(item, candidate) && inLocation(candidate, target, state));
  }
  const sameActor = source?.uuid === destination.uuid;
  const occupied = target.kind && target.kind !== "gear" ? state.equipped[target.kind][target.index] : null;
  if (occupied && occupied !== merge?.id && !(sameActor && occupied === item.id && amount === available)) {
    throw new Error("Slot jest zajęty. Najpierw zdejmij wyposażenie przyciskiem ×.");
  }
  const progress = { sourceQuantityChanged: false };
  if (merge) {
    const previous = quantity(merge);
    if (!Number.isSafeInteger(previous + amount)) throw new Error("Docelowy stos ma zbyt dużą liczbę sztuk.");
    try {
      await setQuantity(merge, previous + amount);
      await consumeSource(item, amount, available, progress);
      return merge;
    } catch (error) {
      await recoverTransfer(async () => {
        if (progress.sourceQuantityChanged) await restoreQuantity(item, available);
        await restoreQuantity(merge, previous);
      });
      throw error;
    }
  }

  if (sameActor && amount === available) {
    const home = state.placements.find(p => p.itemId === item.id)?.sectionId;
    placeItem(state, item.id, target, home);
    await saveState(destination, state);
    if (!inLocation(item, target, inventoryState(destination, settings))) throw new Error("Zapis położenia przedmiotu został anulowany.");
    return item;
  }

  // Create first; remove the source only once the target item and placement are saved.
  const itemData = item.toObject();
  delete itemData._id;
  delete itemData.folder;
  if (isStackable(item)) itemData.system.quantity = amount;
  rebindWeaponSkills(itemData, source, destination);
  // CoC7's actor workflow imports weapon skills and reads character-only schema fields.
  // Skill references are already rebound above; the Item workflow keeps normal validation and hooks.
  const [created] = itemData.type === "weapon"
    ? await CONFIG.Item.documentClass.createDocuments([itemData], { parent: destination })
    : await destination.createEmbeddedDocuments("Item", [itemData]);
  if (!created) throw new Error("Nie udało się dodać przedmiotu do docelowego ekwipunku.");
  try {
    const latest = inventoryState(destination, settings);
    validateTarget(destination, created, target, latest, settings);
    if (target.kind && target.kind !== "gear" && latest.equipped[target.kind]?.[target.index]) throw new Error("Slot został zajęty podczas przenoszenia.");
    const home = sameActor ? state.placements.find(p => p.itemId === item.id)?.sectionId : DEFAULT_SECTION;
    placeItem(latest, created.id, target, home);
    await saveState(destination, latest);
    if (!inLocation(created, target, inventoryState(destination, settings))) throw new Error("Zapis położenia przedmiotu został anulowany.");
    await consumeSource(item, amount, available, progress);
    return created;
  } catch (error) {
    await recoverTransfer(async () => {
      if (progress.sourceQuantityChanged) await restoreQuantity(item, available);
      await removeItem(destination, created.id);
    });
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
      const weapon = weaponForCheck(actor, data, config());
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
      const weapon = weaponForCheck(this, data, config());
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
      const equipped = weaponForCheck(this, weapon, config());
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
