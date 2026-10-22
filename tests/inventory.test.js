import assert from "node:assert/strict";
import {
  MODULE_ID, DEFAULT_SLOTS, capacity, defaultKind, itemKey, itemDefinition, inventoryState,
  inventorySummary, equipmentSummary, orderedInventories, validateConfig, equippedWeapon
} from "../scripts/inventory-model.js";
import {
  dropItem, addSection, removeSection, moveSection, moveInventory, unequip, unequipGear, worldCatalog, installWeaponGuard, editInventory
} from "../scripts/inventory-service.js";

class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
  filter(fn) { return [...this].filter(fn); }
  find(fn) { return [...this].find(fn); }
  map(fn) { return [...this].map(fn); }
}

let serial = 0;
class FakeActor {
  constructor(id, type = "character") {
    this.id = id;
    this.name = id;
    this.type = type;
    this.uuid = `Actor.${id}`;
    this.isOwner = true;
    this.items = new Collection();
    this.flags = {};
    this.system = { characteristics: { str: { value: 80 }, siz: { value: 80 } }, attribs: {} };
  }
  getFlag(module, key) { return structuredClone(this.flags[key]); }
  async setFlag(module, key, data) {
    if (this.failSave) throw new Error("save failed");
    this.flags[key] = structuredClone(data);
    return this;
  }
  async createEmbeddedDocuments(type, rows) {
    if (this.failCreate) throw new Error("create failed");
    return rows.map(row => makeItem(this, `copy${++serial}`, row.name, row.type, row.system));
  }
  async deleteEmbeddedDocuments(type, ids) {
    if (this.failDelete) throw new Error("delete failed");
    if (this.cancelDelete) return [];
    return ids.map(id => { const item = this.items.get(id); this.items.delete(id); return item; }).filter(Boolean);
  }
  weaponCheck(data, fastForward) { globalThis.calls.actor.push({ data, fastForward }); return "rolled"; }
  weaponRoll(weapon, attackerUuid) { globalThis.calls.roll.push({ weapon, attackerUuid }); return "rolled"; }
}

function makeItem(actor, id, name = "Rewolwer", type = "weapon", system = {}) {
  const item = {
    id, name, type, system, parent: actor, uuid: actor ? `${actor.uuid}.Item.${id}` : `Item.${id}`,
    isOwner: true, testUserPermission: () => true,
    toObject() { return { _id: id, name, type, system: structuredClone(system) }; }
  };
  if (actor) actor.items.set(id, item);
  else game.items.set(id, item);
  return item;
}

function fixture() {
  const settings = { slots: { ...DEFAULT_SLOTS }, catalog: [] };
  const a = new FakeActor("A");
  const b = new FakeActor("B", "vehicle");
  const userFlags = {};
  globalThis.calls = { actor: [], macro: [], roll: [], warnings: [] };
  globalThis.game = {
    actors: new Collection([[a.id, a], [b.id, b]]), items: new Collection(), scenes: new Collection(),
    settings: { get: () => settings },
    user: {
      isGM: true, character: a,
      getFlag: (module, key) => structuredClone(userFlags[key]),
      async setFlag(module, key, value) { userFlags[key] = structuredClone(value); return this; }
    },
    CoC7: { macros: { weaponCheck(data, event) {
      calls.macro.push(data);
      return game.user.character.weaponCheck(data, event.shiftKey);
    } } }
  };
  globalThis.ui = { notifications: { warn: message => calls.warnings.push(message), error: () => {} } };
  globalThis.CONFIG = { Actor: { documentClass: FakeActor } };
  globalThis.ChatMessage = { getSpeaker: () => ({ actor: a.id }), getSpeakerActor: speaker => game.actors.get(speaker.actor) };
  globalThis.foundry = { utils: { randomID: () => `section${++serial}`, mergeObject: (a, b) => ({ ...a, ...b }) } };
  globalThis.fromUuid = async uuid => {
    for (const actor of game.actors) {
      if (actor.uuid === uuid) return actor;
      const item = actor.items.find(item => item.uuid === uuid);
      if (item) return item;
    }
    return game.items.find(item => item.uuid === uuid);
  };
  return { a, b, settings };
}

async function equip(actor, item, kind = "weapon", index = 0) {
  await dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: actor.uuid, kind, index });
}

const cases = [
  ["capacity uses STR and SIZ and does not assign a character limit to vehicles", ({ a, b }) => {
    assert.equal(capacity(a), 20);
    a.system.characteristics.str.value = 40;
    assert.equal(capacity(a), 13);
    a.system.characteristics.siz.value = null;
    assert.equal(capacity(a), null);
    assert.equal(capacity(b), null);
  }],
  ["physical inventory excludes skills and multiplies weight by quantity", ({ a, settings }) => {
    const item = makeItem(a, "gear", "Amunicja", "item", { quantity: 12 });
    settings.catalog.push({ ...itemDefinition(item, settings), weight: 0.2 });
    makeItem(a, "skill", "Unik", "skill");
    makeItem(a, "unknown", "Latarka", "item");
    makeItem(a, "empty", "Puste", "item", { quantity: 0 });
    const summary = inventorySummary(a, settings);
    assert.ok(Math.abs(summary.weight - 2.4) < 1e-10);
    assert.equal(summary.unknown, 1);
    assert.equal(inventoryState(a, settings).placements.length, 3);
  }],
  ["zero weight is known and equipment does not count twice", async ({ a, settings }) => {
    const item = makeItem(a, "w");
    settings.catalog.push({ ...itemDefinition(item, settings), weight: 0 });
    await equip(a, item);
    assert.equal(inventorySummary(a, settings).weight, 0);
    assert.equal(inventorySummary(a, settings).unknown, 0);
    settings.catalog[0].weight = 21;
    assert.equal(inventorySummary(a, settings).weight, 21);
    assert.equal(inventorySummary(a, settings).overloaded, true);
  }],
  ["Polish and English knife names receive knife slots", () => {
    assert.equal(defaultKind({ type: "weapon", name: "Nóż kuchenny" }), "knife");
    assert.equal(defaultKind({ type: "weapon", name: "Fighting Knife" }), "knife");
    assert.equal(defaultKind({ type: "weapon", name: "Rewolwer" }), "weapon");
  }],
  ["new sections and deleted sections preserve every physical item", async ({ a, settings }) => {
    const item = makeItem(a, "bag", "Latarka", "item");
    await addSection(a, "Plecak");
    const section = inventoryState(a, settings).sections.find(section => section.id !== "carried");
    await dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: a.uuid, sectionId: section.id });
    assert.equal(inventoryState(a, settings).placements[0].sectionId, section.id);
    await removeSection(a, section.id);
    assert.equal(inventoryState(a, settings).placements[0].sectionId, "carried");
    assert.equal(a.items.size, 1);
  }],
  ["four weapon slots enforce capacity, kind, occupied slots and duplicate assignments", async ({ a, settings }) => {
    const weapons = Array.from({ length: 5 }, (_, i) => makeItem(a, `w${i}`));
    for (let i = 0; i < 4; i++) await equip(a, weapons[i], "weapon", i);
    await assert.rejects(equip(a, weapons[4], "weapon", 4));
    await assert.rejects(equip(a, weapons[4], "weapon", 0));
    await assert.rejects(equip(a, weapons[4], "knife", 0));
    await unequip(a, "weapon", 1);
    await equip(a, weapons[0], "weapon", 1);
    assert.deepEqual(inventoryState(a, settings).equipped.weapon, [null, "w0", "w2", "w3"]);
  }],
  ["general gear has an unlimited equipment area and each item is equipped only once", async ({ a, settings }) => {
    const items = Array.from({ length: 8 }, (_, i) => makeItem(a, `gear${i}`, `Przedmiot ${i}`, "item"));
    for (const item of items) await equip(a, item, "gear");
    await equip(a, items[0], "gear");
    const state = inventoryState(a, settings);
    assert.equal(state.equipped.gear.length, 8);
    assert.equal(new Set(state.equipped.gear).size, 8);
    assert.equal(state.equipped.weapon.filter(Boolean).length, 0);
    await unequipGear(a, items[3].id);
    assert.equal(inventoryState(a, settings).equipped.gear.includes(items[3].id), false);
    assert.equal(a.items.size, 8);
  }],
  ["character burden counts only equipped stacks and weapons, excluding storage and vehicles", async ({ a, b, settings }) => {
    const gear = makeItem(a, "ammo", "Amunicja", "item", { quantity: 3 });
    const weapon = makeItem(a, "weapon", "Pistolet");
    const stored = makeItem(a, "heavy", "Ciężka skrzynia", "item");
    makeItem(a, "unknown", "Nieznany przedmiot", "item");
    const cargo = makeItem(b, "cargo", "Ładunek", "item");
    for (const [item, weight] of [[gear, 0.5], [weapon, 2], [stored, 1000], [cargo, 40]]) {
      settings.catalog.push({ ...itemDefinition(item, settings), weight });
    }
    await equip(a, gear, "gear");
    await equip(a, weapon);
    let summary = equipmentSummary(a, settings);
    assert.equal(summary.weight, 3.5);
    assert.equal(summary.count, 4);
    assert.equal(summary.unknown, 0);
    assert.equal(summary.overloaded, false);
    assert.equal(inventorySummary(a, settings).weight, 1003.5);
    assert.equal(inventorySummary(b, settings).weight, 40);
    await unequip(a, "weapon", 0);
    summary = equipmentSummary(a, settings);
    assert.equal(summary.weight, 1.5);
    assert.equal(summary.count, 3);
    await equip(a, stored, "gear");
    assert.equal(equipmentSummary(a, settings).overloaded, true);
  }],
  ["only equipped unknown weights make carried weight incomplete; zero is known", async ({ a, settings }) => {
    const unknown = makeItem(a, "unknownGear", "Latarka", "item");
    const zero = makeItem(a, "zeroGear", "Kartka", "item");
    settings.catalog.push({ ...itemDefinition(zero, settings), weight: 0 });
    assert.equal(equipmentSummary(a, settings).unknown, 0);
    await equip(a, zero, "gear");
    assert.equal(equipmentSummary(a, settings).unknown, 0);
    await equip(a, unknown, "gear");
    assert.equal(equipmentSummary(a, settings).unknown, 1);
    assert.equal(equipmentSummary(a, settings).count, 2);
  }],
  ["putting general gear away removes it from carried weight and preserves its section", async ({ a, settings }) => {
    const item = makeItem(a, "torch", "Latarka", "item", { quantity: 2 });
    settings.catalog.push({ ...itemDefinition(item, settings), weight: 0.3 });
    await addSection(a, "Szafka");
    const section = inventoryState(a, settings).sections[0];
    await equip(a, item, "gear");
    assert.equal(equipmentSummary(a, settings).weight, 0.6);
    await dropItem({ type: "Item", uuid: item.uuid, fromSlot: true }, { actorUuid: a.uuid, sectionId: section.id });
    assert.equal(equipmentSummary(a, settings).weight, 0);
    assert.equal(inventoryState(a, settings).placements[0].sectionId, section.id);
    assert.equal(a.items.size, 1);
  }],
  ["vehicle gear can be transferred directly into carried equipment, with rollback on failure", async ({ a, b, settings }) => {
    const item = makeItem(b, "vehicleTorch", "Latarka", "item", { quantity: 2 });
    settings.catalog.push({ ...itemDefinition(item, settings), weight: 0.5 });
    b.failDelete = true;
    await assert.rejects(dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: a.uuid, kind: "gear" }));
    assert.equal(a.items.size, 0);
    assert.equal(b.items.size, 1);
    assert.equal(equipmentSummary(a, settings).weight, 0);
    b.failDelete = false;
    await dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: a.uuid, kind: "gear" });
    assert.equal(b.items.size, 0);
    assert.equal(equipmentSummary(a, settings).weight, 1);
    assert.equal(inventoryState(a, settings).equipped.gear.length, 1);
  }],
  ["general gear sanitation rejects stale, duplicate, empty and weapon IDs", ({ a, settings }) => {
    const gear = makeItem(a, "validGear", "Latarka", "item");
    const weapon = makeItem(a, "wrongGear", "Pistolet");
    makeItem(a, "emptyGear", "Pusta paczka", "item", { quantity: 0 });
    a.flags.inventory = { equipped: { gear: [gear.id, gear.id, "deleted", "emptyGear", weapon.id] } };
    assert.deepEqual(inventoryState(a, settings).equipped.gear, [gear.id]);
    assert.equal(equippedWeapon(a, { uuid: weapon.uuid }, settings), null);
  }],
  ["section arrows persist order while the legacy general inventory remains last", async ({ a, settings }) => {
    a.flags.inventory = { sections: [{ id: "carried", name: "Ekwipunek" }, { id: "first", name: "Plecak" }, { id: "second", name: "Szafka" }] };
    makeItem(a, "stored");
    assert.deepEqual(inventoryState(a, settings).sections.map(s => s.id), ["first", "second", "carried"]);
    await moveSection(a, "second", "up");
    assert.deepEqual(inventoryState(a, settings).sections.map(s => s.id), ["second", "first", "carried"]);
    await moveSection(a, "first", "down");
    await moveSection(a, "carried", "up");
    assert.deepEqual(inventoryState(a, settings).sections.map(s => s.id), ["second", "first", "carried"]);
    await addSection(a, "Nowa sekcja");
    assert.equal(inventoryState(a, settings).sections.at(-1).id, "carried");
    assert.equal(inventoryState(a, settings).placements[0].sectionId, "carried");
    assert.equal(a.items.size, 1);
  }],
  ["actor and vehicle arrows persist each user's order, keeping the selected inventory last", async ({ a, b }) => {
    const c = new FakeActor("C");
    const d = new FakeActor("D", "vehicle");
    game.actors.set(c.id, c);
    game.actors.set(d.id, d);
    await game.user.setFlag(MODULE_ID, "inventoryActors", [b.id, c.id, d.id, a.id]);
    const order = () => orderedInventories([...game.actors].filter(actor => actor.isOwner), game.user.getFlag(MODULE_ID, "inventoryActors"), a.id).map(actor => actor.id);
    assert.deepEqual(order(), ["B", "C", "D", "A"]);
    await moveInventory(c.id, "up", a.id);
    assert.deepEqual(order(), ["C", "B", "D", "A"]);
    await moveInventory(d.id, "down", a.id);
    await moveInventory(a.id, "up", a.id);
    assert.deepEqual(order(), ["C", "B", "D", "A"]);
    await moveInventory(c.id, "down", a.id);
    assert.deepEqual(order(), ["B", "C", "D", "A"]);
    b.isOwner = false;
    assert.deepEqual(order(), ["C", "D", "A"]);
  }],
  ["knife and armor have independent configurable slots", async ({ a, settings }) => {
    const knife = makeItem(a, "knife", "Nóż");
    const armor = makeItem(a, "armor", "Kamizelka", "armor");
    await equip(a, knife, "knife");
    await equip(a, armor, "armor");
    assert.equal(equippedWeapon(a, { uuid: knife.uuid }, settings)?.id, knife.id);
    settings.slots.knife = 0;
    assert.equal(equippedWeapon(a, { uuid: knife.uuid }, settings), null);
    assert.equal(inventoryState(a, settings).equipped.armor[0], armor.id);
  }],
  ["putting a slot tile into a bag unequips it", async ({ a, settings }) => {
    const item = makeItem(a, "w");
    await equip(a, item);
    await dropItem({ type: "Item", uuid: item.uuid, fromSlot: true }, { actorUuid: a.uuid, sectionId: "carried" });
    assert.equal(equippedWeapon(a, { uuid: item.uuid }, settings), null);
    assert.equal(a.items.size, 1);
  }],
  ["transfer moves the whole stack and updates both actor inventories", async ({ a, b, settings }) => {
    const item = makeItem(a, "w", "Rewolwer", "weapon", { quantity: 2 });
    await equip(a, item);
    await dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: b.uuid, sectionId: "carried" });
    assert.equal(a.items.size, 0);
    assert.equal(b.items.size, 1);
    assert.equal([...b.items][0].system.quantity, 2);
    assert.equal(equippedWeapon(a, { uuid: item.uuid }, settings), null);
  }],
  ["transfer is rolled back when source deletion fails or is cancelled", async ({ a, b }) => {
    const item = makeItem(a, "w");
    a.failDelete = true;
    await assert.rejects(dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: b.uuid, sectionId: "carried" }));
    assert.equal(a.items.size, 1);
    assert.equal(b.items.size, 0);
    a.failDelete = false;
    a.cancelDelete = true;
    await assert.rejects(dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: b.uuid, sectionId: "carried" }));
    assert.equal(a.items.size, 1);
    assert.equal(b.items.size, 0);
  }],
  ["transferred weapons use destination skill IDs and keep skill names through vehicle storage", async ({ a, b }) => {
    makeItem(a, "sourceSkill", "Pistolety", "skill");
    const weapon = makeItem(a, "w", "Rewolwer", "weapon", { skill: { main: { id: "sourceSkill", name: "Pistolety" } } });
    await dropItem({ type: "Item", uuid: weapon.uuid }, { actorUuid: b.uuid, sectionId: "carried" });
    const stored = [...b.items][0];
    assert.equal(stored.system.skill.main.id, "");
    assert.equal(stored.system.skill.main.name, "Pistolety");
    await dropItem({ type: "Item", uuid: stored.uuid }, { actorUuid: a.uuid, sectionId: "carried" });
    const returned = a.items.find(item => item.type === "weapon");
    assert.equal(returned.system.skill.main.id, "sourceSkill");
    makeItem(b, "destinationSkill", "Pistolety", "skill");
    await dropItem({ type: "Item", uuid: returned.uuid }, { actorUuid: b.uuid, sectionId: "carried" });
    assert.equal(b.items.find(item => item.type === "weapon").system.skill.main.id, "destinationSkill");
  }],
  ["transfer preserves source when target creation or flag save fails", async ({ a, b }) => {
    const item = makeItem(a, "w");
    b.failCreate = true;
    await assert.rejects(dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: b.uuid, sectionId: "carried" }));
    b.failCreate = false;
    b.failSave = true;
    await assert.rejects(dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: b.uuid, sectionId: "carried" }));
    assert.equal(a.items.size, 1);
    assert.equal(b.items.size, 0);
  }],
  ["ownership is required for both transfer endpoints", async ({ a, b }) => {
    const item = makeItem(a, "w");
    a.isOwner = false;
    await assert.rejects(dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: b.uuid, sectionId: "carried" }));
    a.isOwner = true;
    b.isOwner = false;
    await assert.rejects(dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: b.uuid, sectionId: "carried" }));
    assert.equal(a.items.size, 1);
    assert.equal(b.items.size, 0);
  }],
  ["world item drops copy a template without deleting it", async ({ a }) => {
    const item = makeItem(null, "world", "Latarka", "item");
    await dropItem({ type: "Item", uuid: item.uuid }, { actorUuid: a.uuid, sectionId: "carried" });
    assert.equal(a.items.size, 1);
    assert.equal(game.items.size, 1);
  }],
  ["empty stacks, wrong document types and stale sections are rejected", async ({ a }) => {
    const empty = makeItem(a, "w", "Rewolwer", "weapon", { quantity: 0 });
    await assert.rejects(equip(a, empty));
    await assert.rejects(dropItem({ type: "Actor", uuid: a.uuid }, { actorUuid: a.uuid, sectionId: "carried" }));
    await assert.rejects(dropItem({ type: "Item", uuid: empty.uuid }, { actorUuid: a.uuid, sectionId: "deleted" }));
  }],
  ["stale flags and duplicated slots never authorize a missing or reclassified weapon", async ({ a, settings }) => {
    const item = makeItem(a, "w");
    a.flags.inventory = { equipped: { weapon: ["w", "w", "deleted"] } };
    assert.deepEqual(inventoryState(a, settings).equipped.weapon, ["w", null, null, null]);
    settings.catalog.push({ ...itemDefinition(item, settings), kind: "gear" });
    assert.equal(equippedWeapon(a, { uuid: item.uuid }, settings), null);
  }],
  ["macro guard blocks before original code and allows equipped exact UUID with modifiers", async ({ a }) => {
    const item = makeItem(a, "w");
    installWeaponGuard();
    installWeaponGuard();
    const event = { shiftKey: true, preventDefault() {} };
    assert.equal(game.CoC7.macros.weaponCheck({ uuid: item.uuid, name: item.name }, event), false);
    assert.equal(calls.macro.length, 0);
    assert.equal(calls.actor.length, 0);
    await equip(a, item);
    assert.equal(game.CoC7.macros.weaponCheck({ uuid: item.uuid, name: item.name }, event), "rolled");
    assert.equal(calls.macro.length, 1);
    assert.equal(calls.actor.length, 1);
    assert.equal(calls.actor[0].fastForward, true);
    await unequip(a, "weapon", 0);
    assert.equal(a.weaponCheck({ uuid: item.uuid }), false);
    assert.equal(calls.actor.length, 1);
  }],
  ["a stale or foreign embedded UUID cannot substitute a same-name equipped copy", async ({ a, b, settings }) => {
    const local = makeItem(a, "local");
    const remote = makeItem(b, "remote");
    await equip(a, local);
    assert.equal(equippedWeapon(a, { uuid: remote.uuid, name: local.name }, settings), null);
    assert.equal(equippedWeapon(a, { uuid: "Actor.A.Item.deleted", name: local.name }, settings), null);
    assert.equal(equippedWeapon(a, { uuid: "Item.template", name: local.name }, settings)?.id, local.id);
    makeItem(a, "duplicate");
    assert.equal(equippedWeapon(a, { name: local.name }, settings), null);
  }],
  ["CoC7 8.16 sheet weaponRoll is blocked before chat creation until equipped", async ({ a }) => {
    const weapon = makeItem(a, "sheetWeapon");
    installWeaponGuard();
    installWeaponGuard();
    assert.equal(a.weaponRoll(weapon, a.uuid), false);
    assert.equal(calls.roll.length, 0);
    assert.match(calls.warnings.at(-1), /nie jest wyposażona/);
    await equip(a, weapon);
    assert.equal(a.weaponRoll(weapon, a.uuid), "rolled");
    assert.equal(calls.roll.length, 1);
    assert.equal(calls.roll[0].weapon, weapon);
    assert.equal(calls.roll[0].attackerUuid, a.uuid);
    await unequip(a, "weapon", 0);
    assert.equal(a.weaponRoll(weapon, a.uuid), false);
    assert.equal(calls.roll.length, 1);
  }],
  ["Punch alone bypasses equipment checks for macros, actor checks and sheet attacks", ({ a, settings }) => {
    const punch = makeItem(a, "unarmedPunch", "Punch");
    installWeaponGuard();
    const event = { shiftKey: true, preventDefault() {} };
    assert.equal(game.CoC7.macros.weaponCheck({ uuid: punch.uuid, name: punch.name }, event), "rolled");
    assert.equal(game.CoC7.macros.weaponCheck({ name: "Punch" }, event), "rolled");
    assert.equal(a.weaponCheck({ uuid: punch.uuid }), "rolled");
    assert.equal(a.weaponRoll(punch, a.uuid), "rolled");
    assert.equal(calls.macro.length, 2);
    assert.equal(calls.actor[0].fastForward, true);
    assert.equal(calls.roll.length, 1);
    assert.equal(calls.warnings.length, 0);
    assert.equal(equippedWeapon(a, { uuid: punch.uuid }, settings), null);
    assert.equal(equipmentSummary(a, settings).count, 0);
  }],
  ["Punch exception does not allow other names, spoofed macro names or stale UUIDs", ({ a }) => {
    installWeaponGuard();
    for (const name of ["punch", "PUNCH", "Punch (unarmed)", "Kick", "Bite", "Rewolwer"]) {
      const weapon = makeItem(a, `other${a.items.size}`, name);
      assert.equal(a.weaponCheck({ uuid: weapon.uuid, name: "Punch" }), false);
      assert.equal(a.weaponRoll(weapon, a.uuid), false);
    }
    const punch = makeItem(a, "punch", "Punch");
    const event = { shiftKey: false, preventDefault() {} };
    assert.equal(game.CoC7.macros.weaponCheck({ uuid: "Actor.A.Item.deleted", name: punch.name }, event), false);
    assert.equal(calls.macro.length, 0);
    assert.equal(calls.actor.length, 0);
    assert.equal(calls.roll.length, 0);
  }],
  ["sheet guards still install when the macro API is unavailable", async () => {
    class ActorWithoutMacro extends FakeActor {
      weaponCheck() { throw new Error("Unequipped weaponCheck must not run"); }
      weaponRoll() { throw new Error("Unequipped weaponRoll must not run"); }
    }
    const actor = new ActorWithoutMacro("NoMacro");
    const item = makeItem(actor, "w");
    CONFIG.Actor.documentClass = ActorWithoutMacro;
    delete game.CoC7;
    installWeaponGuard();
    assert.equal(actor.weaponCheck({ uuid: item.uuid }), false);
    assert.equal(actor.weaponRoll(item, actor.uuid), false);
  }],
  ["sheet attacks support knife slots and preserve vehicle behavior", async ({ a, b }) => {
    const knife = makeItem(a, "knifeSheet", "Nóż");
    const mounted = makeItem(b, "mounted");
    installWeaponGuard();
    assert.equal(a.weaponRoll(knife, a.uuid), false);
    await equip(a, knife, "knife");
    assert.equal(a.weaponRoll(knife, a.uuid), "rolled");
    assert.equal(b.weaponRoll(mounted, b.uuid), "rolled");
    assert.equal(calls.roll.length, 2);
  }],
  ["world catalog shares definitions by normalized name and type and includes embedded items", ({ a, settings }) => {
    const item = makeItem(a, "w");
    makeItem(null, "template", " REWOLWER ");
    makeItem(null, "gear", "Rewolwer", "item");
    settings.catalog.push({ ...itemDefinition(item, settings), weight: 0.8 });
    const rows = worldCatalog();
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.key === itemKey(item)).weight, 0.8);
  }],
  ["JSON round trip preserves zero, unknown, fractions and slot counts", ({ settings }) => {
    settings.catalog = [
      { name: "Rewolwer", type: "weapon", kind: "weapon", weight: 0.8 },
      { name: "Kartka", type: "item", kind: "gear", weight: 0 },
      { name: "Książka", type: "book", kind: "gear", weight: null }
    ];
    const validated = validateConfig(settings);
    assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(validated))), validated);
    assert.equal(validated.catalog[1].weight, 0);
    assert.equal(validated.catalog[2].weight, null);
  }],
  ["import rejects malformed weights, duplicate entries, slot limits and invalid categories", ({ settings }) => {
    const base = { name: "A", type: "item", kind: "gear", weight: 1 };
    for (const weight of [-1, Infinity, NaN, "1", undefined]) {
      assert.throws(() => validateConfig({ ...settings, catalog: [{ ...base, weight }] }));
    }
    assert.throws(() => validateConfig({ ...settings, catalog: [base, { ...base, name: " a " }] }));
    assert.throws(() => validateConfig({ ...settings, slots: { ...settings.slots, weapon: 51 } }));
    assert.throws(() => validateConfig({ ...settings, catalog: [{ ...base, kind: "knife" }] }));
  }],
  ["queued changes preserve order and a failed edit does not block later edits", async () => {
    const order = [];
    const first = editInventory(async () => { order.push(1); throw new Error("expected"); });
    const second = editInventory(async () => { order.push(2); });
    await assert.rejects(first);
    await second;
    assert.deepEqual(order, [1, 2]);
  }],
  ["HUD registers token controls in V12 and V13, refreshes inventory and reads configuration", async ({ a, settings }) => {
    const handlers = new Map();
    const menus = {};
    const documents = [];
    globalThis.Hooks = {
      once(name, callback) { handlers.set(name, callback); },
      on(name, callback) { handlers.set(name, callback); }
    };
    class FakeApplication {
      constructor() { this.element = [{ classList: { toggle() {} } }]; documents.push(this); }
      static get defaultOptions() { return {}; }
      activateListeners() {}
      render() { this.rendered = true; this.renders = (this.renders ?? 0) + 1; return this; }
      close() { this.rendered = false; }
    }
    globalThis.Application = FakeApplication;
    globalThis.FormApplication = FakeApplication;
    globalThis.loadTemplates = async names => names;
    game.settings.register = () => {};
    game.settings.registerMenu = (module, key, menu) => { menus[key] = menu; };
    game.settings.set = async (module, key, value) => { settings.slots = value.slots; settings.catalog = value.catalog; };
    ui.notifications.info = () => {};
    await import("../main.js");
    handlers.get("init")();
    await handlers.get("ready")();
    const controls = { tokens: { tools: {} }, notes: { tools: {} } };
    handlers.get("getSceneControlButtons")(controls);
    assert.ok(controls.tokens.tools.CthulhuPlayerHud);
    assert.deepEqual(controls.notes.tools, {});
    controls.tokens.tools.CthulhuPlayerHud.onChange();
    const hud = documents[0];
    let data = await hud.getData();
    assert.equal(data.actors.length, 1);
    assert.equal(data.inventories.length, 1);
    assert.equal(data.equipment[0].slots.length, 4);
    assert.equal(data.availableInventories[0].id, "B");
    const item = makeItem(a, "fresh", "Latarka", "item");
    const before = hud.renders;
    handlers.get("createItem")(item);
    assert.equal(hud.renders, before + 1);
    data = await hud.getData();
    assert.equal(data.inventories[0].sections[0].items[0].name, "Latarka");
    const legacy = [{ name: "token", tools: [] }, { name: "notes", tools: [] }];
    handlers.get("getSceneControlButtons")(legacy);
    assert.equal(legacy[0].tools[0].name, "CthulhuPlayerHud");
    assert.equal(legacy[1].tools.length, 0);

    // Read the browser drag data synchronously, before the native event protects it.
    await addSection(a, "Plecak");
    const sectionId = inventoryState(a, settings).sections.find(section => section.id !== "carried").id;
    const listeners = new Map();
    const html = { find(selector) {
      return { on(event, callback) { listeners.set(`${selector}:${event}`, callback); return this; } };
    } };
    hud.activateListeners(html);
    let readable = true;
    listeners.get(".hud-drop-zone:drop")({
      preventDefault() {}, stopPropagation() {},
      currentTarget: { dataset: { actorUuid: a.uuid, sectionId }, classList: { remove() {} } },
      originalEvent: { dataTransfer: { getData: () => readable ? JSON.stringify({ type: "Item", uuid: item.uuid }) : "" } }
    });
    readable = false;
    await editInventory(async () => {});
    assert.equal(inventoryState(a, settings).placements[0].sectionId, sectionId);

    const form = new menus.inventory.type();
    const formData = form.getData();
    assert.equal(formData.rows.length, 1);
    const values = { "slots.weapon": "2", "slots.knife": "1", "slots.armor": "1", "weight.0": "0,25", "kind.0": "gear" };
    form.form = { querySelector(selector) { return { value: values[selector.match(/name="([^"]+)"/)[1]] }; } };
    assert.equal(form.readForm().catalog[0].weight, 0.25);
    await form._updateObject();
    assert.equal(settings.slots.weapon, 2);
    assert.equal(settings.catalog[0].weight, 0.25);

    let chooserClicks = 0;
    const fileInput = { click() { chooserClicks++; } };
    const configListeners = new Map();
    form.activateListeners({ find(selector) {
      return { 0: fileInput, on(event, callback) { configListeners.set(`${selector}:${event}`, callback); return this; } };
    } });
    configListeners.get("[data-action='import']:click")();
    assert.equal(chooserClicks, 1);
    const imported = { module: MODULE_ID, version: 1, unit: "kg", slots: { weapon: 3, knife: 2, armor: 1 }, catalog: [{ name: "Latarka", type: "item", kind: "gear", weight: 0 }] };
    const input = { value: "weights.json", files: [{ text: async () => JSON.stringify(imported) }] };
    await configListeners.get("[data-action='import-file']:change")({ currentTarget: input });
    assert.equal(input.value, "");
    assert.equal(form.draft.catalog[0].weight, 0);
    assert.equal(form.draft.slots.weapon, 3);
    assert.equal(settings.slots.weapon, 2); // Import changes the draft until Save.

    await equip(a, item, "gear");
    await game.user.setFlag(MODULE_ID, "inventoryActors", ["B"]);
    data = await hud.getData();
    assert.equal(data.equippedSummary.weight, "0,25");
    assert.equal(data.equippedSummary.count, 1);
    assert.equal(data.equippedGear[0].id, item.id);
    assert.equal(data.equippedGear[0].totalWeight, "0,25");
    assert.equal(data.equippedGear[0].equipped, true);
    assert.deepEqual(data.inventories.map(inventory => inventory.actorId), ["B", "A"]);
    assert.equal(data.inventories.at(-1).isGeneral, true);
    assert.equal(data.inventories.at(-1).sections.at(-1).id, "carried");
  }]
];

export async function runInventoryTests() {
  const results = [];
  for (const [name, run] of cases) {
    try { await run(fixture()); results.push({ name, passed: true }); }
    catch (error) { throw new Error(`FAIL: ${name}`, { cause: error }); }
  }
  return results;
}
