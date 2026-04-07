export function finalizeWidgetAddAction({
  added = false,
  addedInstanceId = "",
  isAddWidgetModalOpen,
  closeAddWidgetModal,
  openWidgetModal
} = {}) {
  if (added !== true) {
    return false;
  }

  if (isAddWidgetModalOpen?.()) {
    closeAddWidgetModal?.();
  }

  if (addedInstanceId) {
    openWidgetModal?.(addedInstanceId);
  }

  return true;
}
