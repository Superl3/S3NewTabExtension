import { arrayOrEmpty } from "./utils/array.js";
import { createDockWidgetShell } from "./dock-widget-shell.js";
import { mountDockWidgetRuntime } from "./dock-widget-runtime-mount.js";
import { startDockWidgetDragSession } from "./dock-widget-drag-session.js";

export function renderDockWidgetsView({
  strip,
  instances,
  homeState,
  dockUiState,
  destroyDockEmbeddedControllers,
  normalizeDockedWidgetOrders,
  onNormalizationChanged,
  buildDockConfig,
  isHorizontalDock,
  dockedInstances,
  normalizeDockActiveId,
  normalizeDockOrder,
  widgetRegistry,
  normalizeText,
  applyCardVisual,
  runtimeMount = {},
  dragSession = {},
  setDockActiveId,
  applyDockActiveVisual,
  isEditMode,
  openWidgetSettings,
  syncDockOverflowState,
  documentObj = null
} = {}) {
  if (!strip) {
    return;
  }

  const doc = documentObj || (typeof document !== "undefined" ? document : null);
  if (!doc) {
    return;
  }

  destroyDockEmbeddedControllers?.();
  strip.replaceChildren();
  const changedByNormalization = normalizeDockedWidgetOrders?.(instances, homeState);
  if (changedByNormalization) {
    onNormalizationChanged?.();
  }
  const config = buildDockConfig?.(homeState);
  const horizontalDock = isHorizontalDock?.(config);
  const items = arrayOrEmpty(dockedInstances?.());
  strip.classList.toggle("is-empty", items.length === 0);

  if (!items.length) {
    if (dockUiState) {
      dockUiState.activeId = "";
    }
    syncDockOverflowState?.();
    return;
  }

  const activeId = normalizeDockActiveId?.(items);
  if (dockUiState) {
    dockUiState.activeId = activeId;
  }

  for (const item of items) {
    const slotIndex = normalizeDockOrder?.(item.dockOrder, null);
    if (slotIndex === null || slotIndex < 0 || slotIndex >= config.lengthUnits) {
      continue;
    }

    const label = normalizeText?.(item.title, widgetRegistry?.[item.type]?.title || "Widget");

    const { card, slot } = createDockWidgetShell({
      item,
      slotIndex,
      horizontalDock,
      label,
      documentObj: doc
    });

    applyCardVisual?.(card, item);

    mountDockWidgetRuntime({
      item,
      slot,
      label: normalizeText?.(label),
      widgetRegistry,
      runtimeDeps: runtimeMount.runtimeDeps,
      documentObj: doc,
      onControllerMounted: runtimeMount.onControllerMounted
    });

    card.addEventListener(
      "pointerdown",
      (event) => {
        startDockWidgetDragSession({
          ...dragSession,
          event,
          card,
          item
        });
      },
      true
    );

    card.addEventListener("click", () => {
      if (card.dataset.suppressClick === "true") {
        card.dataset.suppressClick = "false";
        return;
      }
      setDockActiveId?.(item.id, { rerender: false });
      applyDockActiveVisual?.(item.id);
      if (isEditMode?.()) {
        openWidgetSettings?.(item.id);
      }
    });

    strip.append(card);
  }

  applyDockActiveVisual?.(activeId);
  syncDockOverflowState?.();
}
