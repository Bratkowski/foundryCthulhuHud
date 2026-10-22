import { isStackable, quantity } from "./inventory-model.js";

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function chooseTransferAmount(item) {
  const available = quantity(item);
  if (!isStackable(item) || available <= 1) return Promise.resolve(available);
  return new Promise(resolve => {
    new Dialog({
      title: "Ile sztuk przenieść?",
      content: `<form class="hud-transfer-form"><p><strong>${escapeHTML(item.name)}</strong></p><p>Dostępne: ${available} szt.</p><label>Liczba sztuk <input name="amount" type="number" min="1" max="${available}" step="1" value="1" required autofocus></label></form>`,
      buttons: {
        move: { label: "Przenieś", callback: html => {
          const amount = Number(html.find("[name='amount']").val());
          if (!Number.isSafeInteger(amount) || amount < 1 || amount > available) {
            ui.notifications.warn(`Podaj całkowitą liczbę sztuk od 1 do ${available}.`);
            resolve(null);
          } else resolve(amount);
        } },
        all: { label: "Cały stos", callback: () => resolve(available) },
        cancel: { label: "Anuluj", callback: () => resolve(null) }
      },
      default: "move",
      close: () => resolve(null)
    }, { classes: ["cthulhu-hud-window", "cthulhu-quantity-dialog"], width: 400 }).render(true);
  });
}
