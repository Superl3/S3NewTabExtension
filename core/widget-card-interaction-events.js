export function attachWidgetCardInteractionEvents({
  head,
  title,
  card,
  dragBtn,
  paddingHandleTopRight,
  paddingHandleBottomLeft,
  instance,
  isEditMode,
  hasPointerEvent,
  startDrag,
  scheduleLongPressDrag,
  startPaddingDrag,
  openWidgetTitleRenameModal
} = {}) {
  if (!instance) {
    return;
  }

  head?.addEventListener("pointerdown", (event) => {
    if (instance.type === "container") {
      return;
    }
    if (instance.viewMode === "headless") {
      return;
    }
    if (!isEditMode?.()) {
      return;
    }
    startDrag?.({ event, target: event.target, fromHandleButton: false });
  });

  head?.addEventListener("mousedown", (event) => {
    if (hasPointerEvent?.()) {
      return;
    }
    if (instance.type === "container") {
      return;
    }
    if (instance.viewMode === "headless") {
      return;
    }
    if (!isEditMode?.()) {
      return;
    }
    startDrag?.({ event, target: event.target, fromHandleButton: false });
  });

  title?.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openWidgetTitleRenameModal?.(instance.id);
  });

  card?.addEventListener(
    "pointerdown",
    (event) => {
      if (isEditMode?.()) {
        return;
      }
      scheduleLongPressDrag?.(event, event.target);
    },
    true
  );

  card?.addEventListener(
    "mousedown",
    (event) => {
      if (hasPointerEvent?.()) {
        return;
      }
      if (isEditMode?.()) {
        return;
      }
      scheduleLongPressDrag?.(event, event.target);
    },
    true
  );

  dragBtn?.addEventListener("pointerdown", (event) => {
    startDrag?.({ event, target: event.target, fromHandleButton: true });
  });

  dragBtn?.addEventListener("mousedown", (event) => {
    if (hasPointerEvent?.()) {
      return;
    }
    startDrag?.({ event, target: event.target, fromHandleButton: true });
  });

  paddingHandleTopRight?.addEventListener("pointerdown", (event) => {
    startPaddingDrag?.(event, "topRight");
  });

  paddingHandleBottomLeft?.addEventListener("pointerdown", (event) => {
    startPaddingDrag?.(event, "bottomLeft");
  });
}
