export function wireDocumentGuardEvents({
  documentObj,
  boardContextMenuState,
  isInsideBoardContextMenu,
  closeBoardContextMenu,
  blockOutsideModalEvent,
  isTextEditableTarget,
  canOpenBoardContextMenuFromTarget,
  openBoardContextMenu
} = {}) {
  if (!documentObj || !boardContextMenuState) {
    return;
  }

  documentObj.addEventListener(
    "pointerdown",
    (event) => {
      if (!boardContextMenuState.open) {
        return;
      }
      if (isInsideBoardContextMenu?.(event.target)) {
        return;
      }
      closeBoardContextMenu?.();
    },
    true
  );

  documentObj.addEventListener("pointerdown", blockOutsideModalEvent, true);
  documentObj.addEventListener("wheel", blockOutsideModalEvent, { capture: true, passive: false });
  documentObj.addEventListener("touchmove", blockOutsideModalEvent, { capture: true, passive: false });

  documentObj.addEventListener(
    "dragstart",
    (event) => {
      if (isTextEditableTarget?.(event.target)) {
        return;
      }
      event.preventDefault();
    },
    true
  );

  documentObj.addEventListener(
    "contextmenu",
    (event) => {
      const opened = canOpenBoardContextMenuFromTarget?.(event.target)
        ? Boolean(openBoardContextMenu?.(event.clientX, event.clientY))
        : false;
      if (!opened) {
        closeBoardContextMenu?.();
      }
      event.preventDefault();
    },
    true
  );

  documentObj.addEventListener(
    "selectstart",
    (event) => {
      if (isTextEditableTarget?.(event.target)) {
        return;
      }
      event.preventDefault();
    },
    true
  );

  documentObj.addEventListener(
    "dblclick",
    (event) => {
      if (isTextEditableTarget?.(event.target)) {
        return;
      }
      event.preventDefault();
    },
    true
  );
}
