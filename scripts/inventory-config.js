import { MODULE_ID, SLOT_TYPES, validateConfig } from "./inventory-model.js";
import { config, worldCatalog, reportError } from "./inventory-service.js";

export class InventoryConfig extends FormApplication {
  constructor(...args) {
    super(...args);
    this.draft = { slots: { ...config().slots }, catalog: worldCatalog() };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "cthulhu-inventory-config", title: "Cthulhu HUD — konfiguracja ekwipunku",
      template: "modules/cthulhu-hud/templates/inventory-config.html",
      width: 740, height: 680, resizable: true, closeOnSubmit: false,
      classes: ["cthulhu-inventory-config"], scrollY: [".inventory-catalog"]
    });
  }

  getData() {
    const labels = { gear: "Przedmiot", weapon: "Broń", knife: "Nóż", armor: "Pancerz" };
    return {
      slots: SLOT_TYPES.map(kind => ({ kind, label: labels[kind], value: this.draft.slots[kind] })),
      rows: this.draft.catalog.map((row, index) => ({
        ...row, index, hasWeight: row.weight !== null,
        kinds: Object.entries(labels).filter(([kind]) => row.type === "weapon" || !["knife", "weapon"].includes(kind))
          .map(([kind, label]) => ({ kind, label, selected: row.kind === kind }))
      }))
    };
  }

  readForm() {
    const slots = Object.fromEntries(SLOT_TYPES.map(kind => [kind, Number(this.form.querySelector(`[name="slots.${kind}"]`).value)]));
    const catalog = this.draft.catalog.map((row, index) => {
      const value = this.form.querySelector(`[name="weight.${index}"]`).value.trim().replace(",", ".");
      return {
        ...row, weight: value === "" ? null : Number(value),
        kind: this.form.querySelector(`[name="kind.${index}"]`).value
      };
    });
    return validateConfig({ slots, catalog });
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-action='search']").on("input", event => {
      const query = event.currentTarget.value.trim().toLocaleLowerCase("pl");
      html.find(".inventory-catalog-row").each((_, row) => { row.hidden = !row.dataset.search.includes(query); });
    });
    html.find("[data-action='export']").on("click", () => {
      try {
        const payload = { module: MODULE_ID, version: 1, unit: "kg", ...this.readForm() };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "cthulhu-hud-weights.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) { reportError(error); }
    });
    html.find("[data-action='import']").on("click", () => {
      html.find("[data-action='import-file']")[0].click();
    });
    html.find("[data-action='import-file']").on("change", async event => {
      try {
        if (!game.user.isGM) throw new Error("Konfigurację świata może zmieniać tylko MG.");
        const file = event.currentTarget.files[0];
        if (!file) return;
        const data = JSON.parse(await file.text());
        if (data.module !== MODULE_ID || data.version !== 1 || data.unit !== "kg") throw new Error("To nie jest obsługiwany plik wag Cthulhu HUD (wersja 1, kg).");
        const imported = validateConfig(data);
        const current = this.readForm();
        const rows = new Map(current.catalog.map(row => [row.key, row]));
        for (const row of imported.catalog) rows.set(row.key, row);
        this.draft = { slots: imported.slots, catalog: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "pl")) };
        this.render(false);
        ui.notifications.info("Wczytano wagi do formularza. Kliknij Zapisz, aby zastosować je w świecie.");
      } catch (error) { reportError(error); }
      finally { event.currentTarget.value = ""; }
    });
  }

  async _updateObject() {
    try {
      if (!game.user.isGM) throw new Error("Konfigurację świata może zmieniać tylko MG.");
      const data = this.readForm();
      await game.settings.set(MODULE_ID, "inventoryConfig", data);
      this.draft = data;
      ui.notifications.info("Zapisano konfigurację ekwipunku.");
    } catch (error) { reportError(error); }
  }
}
