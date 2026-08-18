/**
 * Identity of a rendered widget card.
 *
 * `hydrate()` allocates fresh instance objects on every snapshot restore, so
 * comparing object references forces a full teardown of every card on undo,
 * preset load, and cross-tab sync. This signature captures only the fields that
 * genuinely require rebuilding the card DOM.
 *
 * Layout, title, and visual properties are deliberately excluded: those are
 * applied to an existing card by `refreshExistingCard()` via `applyLayout`,
 * `applyCardVisual`, and `applyCardStack`.
 */
export function widgetCardSignature(instance) {
  if (!instance || typeof instance !== "object") {
    return "";
  }

  return [
    instance.type ?? "",
    instance.viewMode ?? "",
    instance.surfaceMode ?? "",
    instance.containerId ?? "",
    Number(instance.page) || 0
  ].join("|");
}
