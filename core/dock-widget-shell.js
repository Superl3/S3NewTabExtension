export function createDockWidgetShell({
  item,
  slotIndex,
  horizontalDock,
  label,
  documentObj = document
} = {}) {
  const card = documentObj.createElement("article");
  card.className = "dock-widget-item widget-card widget-folder-item-card";
  card.dataset.widgetId = item.id;
  card.dataset.widgetType = item.type;
  card.dataset.dockSlot = String(slotIndex);
  card.style.gridColumnStart = horizontalDock ? String(slotIndex + 1) : "1";
  card.style.gridRowStart = horizontalDock ? "1" : String(slotIndex + 1);
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", label);
  card.title = label;

  const shell = documentObj.createElement("div");
  shell.className = "widget-shell";

  const body = documentObj.createElement("section");
  body.className = "widget-body";

  const host = documentObj.createElement("div");
  host.className = "widget-content-host";

  const slot = documentObj.createElement("div");
  slot.className = "widget-content-slot dock-widget-content";

  host.append(slot);
  body.append(host);
  shell.append(body);
  card.append(shell);

  return { card, slot };
}
