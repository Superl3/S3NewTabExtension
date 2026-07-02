import { toNonNegativeNumberOrFallback } from "./utils/number.js";
import { hasOwn } from "./utils/object.js";

export function materializeHistorySnapshotRuntime(historySnapshotInput, deps) {
  const base = deps.buildSessionSnapshot();
  if (!deps.isStateObject(historySnapshotInput)) {
    return base;
  }

  const historySnapshot = historySnapshotInput;
  const merged = structuredClone(base);
  const nextId = Number(historySnapshot.nextId);
  if (Number.isFinite(nextId)) {
    merged.nextId = Math.max(1, Math.floor(nextId));
  }

  const historyUi = deps.isStateObject(historySnapshot.ui) ? historySnapshot.ui : {};

  if (deps.isStateObject(historyUi.theme)) {
    merged.ui.theme = structuredClone(historyUi.theme);
  }

  if (deps.isStateObject(historyUi.background)) {
    merged.ui.background = {
      ...merged.ui.background,
      ...structuredClone(deps.buildHistoryBackgroundSnapshot(historyUi.background))
    };
  }

  if (deps.isStateObject(historyUi.home)) {
    merged.ui.home = deps.normalizeHomeLayout({
      ...merged.ui.home,
      ...deps.buildHistoryHomeSnapshot(historyUi.home)
    });
    merged.ui.home.activePage = deps.normalizeActivePage(base.ui?.home?.activePage, merged.ui.home.pageCount, 0);
  }

  if (deps.isStateObject(historyUi.widgetCommonMaster)) {
    merged.ui.widgetCommonMaster = structuredClone(historyUi.widgetCommonMaster);
  }

  if (deps.isStateObject(historyUi.shortcuts)) {
    merged.ui.shortcuts = structuredClone(historyUi.shortcuts);
  }

  if (deps.isStateObject(historyUi.monday)) {
    merged.ui.monday = deps.normalizeMondayGlobalSettings(historyUi.monday);
  }

  if (hasOwn(historyUi, "defaultProfileSnapshot")) {
    merged.ui.defaultProfileSnapshot =
      historyUi.defaultProfileSnapshot === null ? null : structuredClone(historyUi.defaultProfileSnapshot);
  }

  if (hasOwn(historyUi, "defaultProfileUpdatedAt")) {
    merged.ui.defaultProfileUpdatedAt = toNonNegativeNumberOrFallback(historyUi.defaultProfileUpdatedAt);
  }

  if (Array.isArray(historySnapshot.presets)) {
    merged.presets = structuredClone(historySnapshot.presets);
  }

  if (Array.isArray(historySnapshot.instances)) {
    merged.instances = structuredClone(historySnapshot.instances);
  }

  if (merged.selectedWidgetId && !merged.instances.some((instance) => String(instance?.id || "") === merged.selectedWidgetId)) {
    merged.selectedWidgetId = "";
  }

  return merged;
}
