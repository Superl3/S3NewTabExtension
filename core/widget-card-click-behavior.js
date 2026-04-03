const DRAG_CLICK_SUPPRESSION_MS = 280;
const INTERACTIVE_SELECTOR = "button, input, textarea, select, a, [contenteditable='true']";

export function isWithinDragClickSuppressionWindow(lastDragEndAt, {
  now = Date.now(),
  thresholdMs = DRAG_CLICK_SUPPRESSION_MS
} = {}) {
  const dragEndAt = Number(lastDragEndAt) || 0;
  return now - dragEndAt <= thresholdMs;
}

export function attachWidgetCardClickBehavior({
  card,
  instance,
  isEditMode,
  getLastDragEndAt,
  setSelected,
  openWidgetModal,
  toggleContainerExpanded
} = {}) {
  if (!card || !instance) {
    return;
  }

  const isSuppressed = () => {
    const dragEndAt = typeof getLastDragEndAt === "function" ? getLastDragEndAt() : 0;
    return isWithinDragClickSuppressionWindow(dragEndAt);
  };

  card.addEventListener(
    "click",
    (event) => {
      if (!isSuppressed()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  card.addEventListener("click", (event) => {
    if (instance.type === "container") {
      if (isSuppressed()) {
        return;
      }
      if (event?.target?.closest?.(INTERACTIVE_SELECTOR)) {
        return;
      }

      if (isEditMode?.()) {
        setSelected?.(instance.id);
      }

      event.preventDefault();
      event.stopPropagation();
      toggleContainerExpanded?.(instance.id);
      return;
    }

    if (!isEditMode?.()) {
      return;
    }

    setSelected?.(instance.id);
    if (instance.type === "shortcut" && event?.target?.closest?.(".shortcut-tile")) {
      event.preventDefault();
      event.stopPropagation();
      openWidgetModal?.(instance.id);
      return;
    }

    if (instance.type === "aiChat" && event?.target?.closest?.(".ai-chat-widget")) {
      if (event?.target?.closest?.("form, input, textarea, button, a, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openWidgetModal?.(instance.id);
    }
  });
}
