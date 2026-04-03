export function moveWidgetToDockSlotRuntime(instance, targetSlot, { record = true } = {}, deps) {
  const state = deps.getState();
  if (!instance || !state || !Number.isFinite(targetSlot)) {
    return false;
  }

  const config = deps.buildDockConfig(state?.ui?.home);
  const slotCount = Math.max(1, config.lengthUnits);
  const clampedSlot = deps.clamp(Math.floor(targetSlot), 0, slotCount - 1);

  if (!deps.isDockEligibleWidget(instance)) {
    return false;
  }

  const previousSlot = deps.normalizeDockOrder(instance.dockOrder, null);
  const occupied = deps.dockSlotOccupants({ excludeWidgetId: instance.id });
  const occupant = occupied.get(clampedSlot) || null;

  if (previousSlot === clampedSlot && !deps.isWidgetInContainer(instance)) {
    return false;
  }

  if (occupant && previousSlot !== null && previousSlot >= 0 && previousSlot < slotCount) {
    occupant.dockOrder = previousSlot;
  } else if (occupant) {
    const fallback = deps.firstAvailableDockSlot({ excludeWidgetId: instance.id });
    if (fallback === null) {
      return false;
    }
    occupant.dockOrder = fallback;
  }

  if (record) {
    deps.recordHistorySnapshot("Dock widget");
  } else {
    deps.touchUserMutationClock();
  }

  if (deps.isWidgetInContainer(instance)) {
    deps.setWidgetContainer(instance.id, "", {
      record: false,
      rerender: false,
      save: false
    });
  }

  instance.dockOrder = clampedSlot;
  deps.normalizeDockedWidgetOrders(state.instances, state?.ui?.home);
  deps.setDockActiveId(instance.id, { rerender: false });

  if (state.selectedWidgetId === instance.id) {
    state.selectedWidgetId = "";
  }
  if (deps.modalState.open && deps.modalState.widgetId === instance.id) {
    deps.closeWidgetModal(false);
  }

  return true;
}
