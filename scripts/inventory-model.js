export const MODULE_ID = "cthulhu-hud";
export const DEFAULT_SECTION = "carried";
export const PHYSICAL_TYPES = new Set(["item", "weapon", "armor", "book"]);
export const SLOT_TYPES = ["weapon", "knife", "armor"];
export const EQUIPMENT_TYPES = [...SLOT_TYPES, "gear"];
export const DEFAULT_SLOTS = { weapon: 4, knife: 1, armor: 1 };

export function isInventoryActor(actor) {
  return ["character", "vehicle"].includes(actor?.type);
}

export function itemKey(item) {
  return `${item.type}:${item.name.normalize("NFKC").trim().toLocaleLowerCase("pl")}`;
}

export function defaultKind(item) {
  if (item.type === "armor") return "armor";
  if (item.type !== "weapon") return "gear";
  return /(?:^|[^\p{L}])(knife|dagger|nóż|sztylet)(?=$|[^\p{L}])/iu.test(item.name) ? "knife" : "weapon";
}

export function quantity(item) {
  const value = item.system?.quantity;
  if (value === undefined || value === null || value === "") return 1;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 1;
}

// CoC7 generic items have a quantity field; weapons, armor and books do not.
export function isStackable(item) {
  return item?.type === "item" && Number.isSafeInteger(item.system?.quantity) && item.system.quantity > 0;
}

function sortedData(value) {
  if (Array.isArray(value)) return Array.from(value, sortedData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedData(value[key])]));
  }
  return value;
}

function stackSignature(item) {
  const data = item.toObject();
  for (const key of ["_id", "sort", "folder", "ownership", "_stats"]) delete data[key];
  delete data.system.quantity;
  return JSON.stringify(sortedData(data));
}

export function canStack(first, second) {
  return isStackable(first) && isStackable(second) && stackSignature(first) === stackSignature(second);
}

export function itemDefinition(item, config) {
  return config.catalog.find(row => row.key === itemKey(item)) ?? {
    key: itemKey(item), name: item.name, type: item.type, weight: null, kind: defaultKind(item)
  };
}

export function capacity(actor) {
  if (actor.type !== "character") return null;
  const traits = actor.system?.characteristics;
  const str = traits?.str?.value;
  const siz = traits?.siz?.value;
  if (str == null || siz == null || !Number.isFinite(Number(str)) || !Number.isFinite(Number(siz))) return null;
  return Math.max(0, 0.35 * (0.7 * Number(str) + 0.3 * Number(siz)));
}

export function inventoryState(actor, config) {
  const stored = actor.getFlag(MODULE_ID, "inventory") ?? {};
  const sections = [];
  for (const section of stored.sections ?? []) {
    if (typeof section.id === "string" && section.id !== DEFAULT_SECTION && typeof section.name === "string" && !sections.some(s => s.id === section.id)) {
      sections.push({ id: section.id, name: section.name });
    }
  }
  sections.push({ id: DEFAULT_SECTION, name: "Ekwipunek ogólny" });
  const items = actor.items.filter(item => PHYSICAL_TYPES.has(item.type));
  const sectionIds = new Set(sections.map(s => s.id));
  const placements = items.map(item => ({
    itemId: item.id,
    sectionId: (stored.placements ?? []).find(p => p.itemId === item.id && sectionIds.has(p.sectionId))?.sectionId ?? DEFAULT_SECTION
  }));
  const used = new Set();
  const equipped = {};
  for (const kind of SLOT_TYPES) {
    equipped[kind] = Array.from({ length: config.slots[kind] }, (_, index) => {
      const id = stored.equipped?.[kind]?.[index];
      const item = items.find(i => i.id === id);
      if (actor.type !== "character" || !item || used.has(id) || quantity(item) <= 0 || itemDefinition(item, config).kind !== kind) return null;
      used.add(id);
      return id;
    });
  }
  equipped.gear = Array.from(stored.equipped?.gear ?? []).filter(id => {
    const item = items.find(i => i.id === id);
    if (actor.type !== "character" || !item || used.has(id) || quantity(item) <= 0 || itemDefinition(item, config).kind !== "gear") return false;
    used.add(id);
    return true;
  });
  return { sections, placements, equipped };
}

export function equippedIds(state) {
  return new Set(EQUIPMENT_TYPES.flatMap(kind => state.equipped[kind]).filter(Boolean));
}

export function inventorySummary(actor, config, { equippedOnly = false } = {}) {
  const equipped = equippedOnly ? equippedIds(inventoryState(actor, config)) : null;
  let weight = 0;
  let unknown = 0;
  let count = 0;
  for (const item of actor.items.filter(i => PHYSICAL_TYPES.has(i.type) && quantity(i) > 0 && (!equipped || equipped.has(i.id)))) {
    const definition = itemDefinition(item, config);
    count += quantity(item);
    if (definition.weight == null) unknown++;
    else weight += definition.weight * quantity(item);
  }
  const limit = capacity(actor);
  return { weight, unknown, count, limit, overloaded: limit !== null && weight > limit };
}

export function equipmentSummary(actor, config) {
  return inventorySummary(actor, config, { equippedOnly: true });
}

export function reorderIds(ids, id, direction) {
  const result = [...ids];
  const index = result.indexOf(id);
  const offset = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const next = index + offset;
  if (index >= 0 && offset && next >= 0 && next < result.length) {
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

export function orderedInventories(actors, attachedIds, selectedActorId) {
  const byId = new Map(actors.map(actor => [actor.id, actor]));
  const ids = [...new Set(attachedIds)].filter(id => byId.has(id) && id !== selectedActorId);
  if (byId.has(selectedActorId)) ids.push(selectedActorId);
  return ids.map(id => byId.get(id));
}

// Validate the entire import before changing any world setting.
export function validateConfig(data) {
  if (!data || !Array.isArray(data.catalog) || !data.slots) throw new Error("Nieprawidłowy format konfiguracji.");
  const slots = {};
  for (const kind of SLOT_TYPES) {
    const value = data.slots[kind];
    if (!Number.isInteger(value) || value < 0 || value > 50) throw new Error("Liczba slotów musi być liczbą całkowitą od 0 do 50.");
    slots[kind] = value;
  }
  const keys = new Set();
  const catalog = data.catalog.map(row => {
    if (!row || typeof row.name !== "string" || !row.name.trim() || !PHYSICAL_TYPES.has(row.type)) throw new Error("Nieprawidłowy przedmiot na liście wag.");
    const key = itemKey(row);
    if (keys.has(key)) throw new Error(`Powtórzony przedmiot: ${row.name}`);
    keys.add(key);
    if (row.weight !== null && (typeof row.weight !== "number" || !Number.isFinite(row.weight) || row.weight < 0)) {
      throw new Error(`Nieprawidłowa waga: ${row.name}`);
    }
    if (!["gear", ...SLOT_TYPES].includes(row.kind) || (row.type !== "weapon" && ["knife", "weapon"].includes(row.kind))) {
      throw new Error(`Nieprawidłowa kategoria wyposażenia: ${row.name}`);
    }
    return { key, name: row.name, type: row.type, weight: row.weight, kind: row.kind };
  });
  return { slots, catalog };
}

export function resolveWeapon(actor, data) {
  if (!actor || !data) return null;
  const weapons = actor.items.filter(item => item.type === "weapon");
  if (data.uuid) {
    const exact = weapons.find(item => item.uuid === data.uuid);
    if (exact) return exact;
    // An embedded UUID identifies a particular copy; never substitute a namesake.
    if (data.uuid.includes("Actor.") && data.uuid.includes(".Item.")) return null;
  }
  if (data.id) return weapons.find(item => item.id === data.id) ?? null;
  const matches = weapons.filter(item => item.name === data.name);
  return matches.length === 1 ? matches[0] : null;
}

export function equippedWeapon(actor, data, config) {
  const item = resolveWeapon(actor, data);
  if (!item || quantity(item) <= 0) return null;
  const state = inventoryState(actor, config);
  return [...state.equipped.weapon, ...state.equipped.knife].includes(item.id) ? item : null;
}

export function weaponForCheck(actor, data, config) {
  const item = resolveWeapon(actor, data);
  if (item?.name === "Punch" && quantity(item) > 0) return item;
  return equippedWeapon(actor, data, config);
}
