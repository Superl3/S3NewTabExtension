export function wireWindowLifecycleEvents({
  elements,
  documentObj,
  windowObj,
  closeBoardContextMenu,
  applyEditDockPosition,
  updateBoardBounds,
  syncPersistentDock,
  flushPendingSave
} = {}) {
  if (!elements || !documentObj || !windowObj) {
    return;
  }

  windowObj.addEventListener("resize", () => {
    closeBoardContextMenu?.();
    if (elements.editDock?.classList.contains("is-positioned")) {
      const left = Number.parseFloat(elements.editDock.style.left) || 0;
      const top = Number.parseFloat(elements.editDock.style.top) || 0;
      applyEditDockPosition?.(left, top);
    }
    updateBoardBounds?.();
    syncPersistentDock?.();
  });

  const flushStateOnLifecycleEvent = () => {
    flushPendingSave?.({ allowWithoutUserMutation: true });
  };

  documentObj.addEventListener("visibilitychange", () => {
    if (documentObj.visibilityState === "hidden") {
      flushStateOnLifecycleEvent();
    }
  });

  windowObj.addEventListener("pagehide", () => {
    flushStateOnLifecycleEvent();
  });

  windowObj.addEventListener("beforeunload", () => {
    flushStateOnLifecycleEvent();
  });

  windowObj.addEventListener("blur", () => {
    closeBoardContextMenu?.();
  });
}
