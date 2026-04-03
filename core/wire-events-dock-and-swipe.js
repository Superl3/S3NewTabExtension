export function wireDockAndSwipeEvents({
  elements,
  windowObj,
  requestAnimationFrameFn,
  dockDragState,
  applyEditDockPosition,
  beginBoardSwipe,
  moveBoardSwipe,
  endBoardSwipe
} = {}) {
  if (!elements || !windowObj || !dockDragState) {
    return;
  }

  if (elements.editDock) {
    requestAnimationFrameFn?.(() => {
      applyEditDockPosition?.(windowObj.innerWidth / 2 - 170, 10);
    });
  }

  elements.editDockGrip?.addEventListener("pointerdown", (event) => {
    if (!elements.editDock) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = elements.editDock.getBoundingClientRect();
    dockDragState.active = true;
    dockDragState.pointerId = event.pointerId;
    dockDragState.startX = event.clientX;
    dockDragState.startY = event.clientY;
    dockDragState.startLeft = rect.left;
    dockDragState.startTop = rect.top;
    elements.editDock.classList.add("is-dragging");
    elements.editDockGrip.setPointerCapture?.(event.pointerId);
  });

  windowObj.addEventListener("pointermove", (event) => {
    if (!dockDragState.active || event.pointerId !== dockDragState.pointerId) {
      return;
    }
    const nextLeft = dockDragState.startLeft + (event.clientX - dockDragState.startX);
    const nextTop = dockDragState.startTop + (event.clientY - dockDragState.startY);
    applyEditDockPosition?.(nextLeft, nextTop);
  });

  windowObj.addEventListener("pointerup", (event) => {
    if (!dockDragState.active || event.pointerId !== dockDragState.pointerId) {
      return;
    }
    dockDragState.active = false;
    dockDragState.pointerId = null;
    elements.editDock?.classList.remove("is-dragging");
  });

  windowObj.addEventListener("pointercancel", (event) => {
    if (!dockDragState.active || event.pointerId !== dockDragState.pointerId) {
      return;
    }
    dockDragState.active = false;
    dockDragState.pointerId = null;
    elements.editDock?.classList.remove("is-dragging");
  });

  elements.workspace?.addEventListener(
    "pointerdown",
    (event) => {
      beginBoardSwipe?.(event);
    },
    true
  );

  windowObj.addEventListener("pointermove", (event) => {
    moveBoardSwipe?.(event);
  });

  windowObj.addEventListener("pointerup", (event) => {
    endBoardSwipe?.(event, { cancelled: false });
  });

  windowObj.addEventListener("pointercancel", (event) => {
    endBoardSwipe?.(event, { cancelled: true });
  });
}
