// Preview sorting only within the grid where the drag began. Other drops retain
// the existing transfer/equipment workflow, including its quantity picker.
export class InventorySortPreview {
  start(tile, mergeableIds = new Set()) {
    this.clear();
    const grid = tile.closest(".hud-item-grid");
    if (!grid) return;
    this.grid = grid;
    this.tile = tile;
    this.source = tile.closest(".hud-gear-item") ?? tile;
    this.mergeableIds = mergeableIds;
  }

  clearPreview() {
    this.placeholder?.remove();
    this.placeholder = null;
    this.source?.classList.remove("hud-sort-source");
    this.mergeTarget?.classList.remove("hud-merge-target");
    this.mergeTarget = null;
  }

  clear() {
    this.clearPreview();
    this.grid?.classList.remove("is-dragover");
    this.grid = this.tile = this.source = null;
  }

  over(grid, x, y, target) {
    if (!this.grid) return;
    if (grid !== this.grid) { this.clearPreview(); return; }
    // The center of a compatible stack still means merge; its edges mean sort.
    const tile = target?.closest(".hud-item-tile");
    if (tile && tile !== this.tile && this.mergeableIds.has(tile.dataset.itemId)) {
      const rect = tile.getBoundingClientRect();
      const offset = (x - rect.left) / rect.width;
      if (offset > 0.25 && offset < 0.75 && y >= rect.top && y <= rect.bottom) {
        this.mergeTarget?.classList.remove("hud-merge-target");
        this.mergeTarget = tile;
        tile.classList.add("hud-merge-target");
        return;
      }
    }
    this.mergeTarget?.classList.remove("hud-merge-target");
    this.mergeTarget = null;
    if (!this.placeholder) {
      this.placeholder = document.createElement("div");
      this.placeholder.className = "hud-sort-placeholder";
      this.placeholder.setAttribute("aria-hidden", "true");
      grid.insertBefore(this.placeholder, this.source);
      this.source.classList.add("hud-sort-source");
    }
    const gap = this.placeholder.getBoundingClientRect();
    if (x >= gap.left && x <= gap.right && y >= gap.top && y <= gap.bottom) return;
    const children = [...grid.children].filter(child => child !== this.source && child !== this.placeholder && child.matches(".hud-item-tile, .hud-gear-item"));
    const before = children.find(child => {
      const rect = child.getBoundingClientRect();
      return y < rect.top || (y <= rect.bottom && x < rect.left + rect.width / 2);
    });
    grid.insertBefore(this.placeholder, before ?? null);
  }

  leave(grid, relatedTarget) {
    if (grid === this.grid && !grid.contains(relatedTarget)) this.clearPreview();
  }

  finish(grid) {
    let result = null;
    if (grid === this.grid && this.placeholder && !this.mergeTarget) {
      let next = this.placeholder.nextElementSibling;
      if (next === this.source) next = next.nextElementSibling;
      const nextTile = next?.matches(".hud-item-tile") ? next : next?.querySelector(".hud-item-tile");
      result = {
        uuid: this.tile.dataset.uuid, itemId: this.tile.dataset.itemId,
        actorUuid: grid.dataset.actorUuid, sectionId: grid.dataset.sectionId,
        kind: grid.dataset.kind, beforeItemId: nextTile?.dataset.itemId ?? null
      };
    }
    this.clear();
    return result;
  }
}
