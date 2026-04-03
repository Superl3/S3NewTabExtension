export function startWidgetPaddingDragSession({
  event,
  corner,
  instance,
  isEditMode,
  setSelected,
  widgetPaddingFallback,
  resolveWidgetPadding,
  normalizeContentPadding,
  projectContentPaddingFromDrag,
  hasContentPaddingChanged,
  recordHistorySnapshot,
  runtimeMap,
  applyCardVisual,
  modalState,
  renderSettings,
  queueSave,
  setLastDragEndAt,
  eventTarget
} = {}) {
  if (!instance || !eventTarget) {
    return false;
  }
  if (!isEditMode?.()) {
    return false;
  }
  if (event?.button !== 0) {
    return false;
  }

  event.stopPropagation();
  event.preventDefault();
  setSelected?.(instance.id);

  const startX = event.clientX;
  const startY = event.clientY;
  const fallbackPadding = widgetPaddingFallback?.(instance.type);
  const startPadding = resolveWidgetPadding?.(instance);
  instance.contentPaddingTop = startPadding.top;
  instance.contentPaddingRight = startPadding.right;
  instance.contentPaddingBottom = startPadding.bottom;
  instance.contentPaddingLeft = startPadding.left;
  let changed = false;
  let recorded = false;

  const move = (moveEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;

    const nextPadding = projectContentPaddingFromDrag(
      {
        corner,
        proportional: moveEvent.shiftKey,
        dx,
        dy,
        startPadding,
        fallbackPadding
      },
      { normalizePadding: normalizeContentPadding }
    );

    const currentPadding = {
      top: normalizeContentPadding(instance.contentPaddingTop, fallbackPadding),
      right: normalizeContentPadding(instance.contentPaddingRight, fallbackPadding),
      bottom: normalizeContentPadding(instance.contentPaddingBottom, fallbackPadding),
      left: normalizeContentPadding(instance.contentPaddingLeft, fallbackPadding)
    };

    if (!hasContentPaddingChanged(currentPadding, nextPadding)) {
      return;
    }

    if (!recorded) {
      recordHistorySnapshot?.("Adjust content padding");
      recorded = true;
    }

    changed = true;
    instance.contentPaddingTop = nextPadding.top;
    instance.contentPaddingRight = nextPadding.right;
    instance.contentPaddingBottom = nextPadding.bottom;
    instance.contentPaddingLeft = nextPadding.left;
    instance.contentPaddingTopRight = nextPadding.topRight;
    instance.contentPaddingBottomLeft = nextPadding.bottomLeft;
    instance.contentPadding = nextPadding.all;

    const rt = runtimeMap?.get?.(instance.id);
    if (rt?.card) {
      applyCardVisual?.(rt.card, instance);
    }

    if (modalState?.open && modalState.widgetId === instance.id && modalState.draft) {
      modalState.draft.contentPaddingTop = instance.contentPaddingTop;
      modalState.draft.contentPaddingRight = instance.contentPaddingRight;
      modalState.draft.contentPaddingBottom = instance.contentPaddingBottom;
      modalState.draft.contentPaddingLeft = instance.contentPaddingLeft;
      modalState.draft.contentPaddingTopRight = instance.contentPaddingTopRight;
      modalState.draft.contentPaddingBottomLeft = instance.contentPaddingBottomLeft;
      modalState.draft.contentPadding = instance.contentPadding;
    }
  };

  const up = () => {
    eventTarget.removeEventListener("pointermove", move);
    eventTarget.removeEventListener("pointerup", up);
    if (!changed) {
      return;
    }
    setLastDragEndAt?.(Date.now());
    renderSettings?.();
    queueSave?.();
  };

  eventTarget.addEventListener("pointermove", move);
  eventTarget.addEventListener("pointerup", up);
  return true;
}
