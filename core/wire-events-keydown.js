function defaultIsHtmlInputElement(value) {
  return typeof HTMLInputElement !== "undefined" && value instanceof HTMLInputElement;
}

function defaultIsHtmlSelectElement(value) {
  return typeof HTMLSelectElement !== "undefined" && value instanceof HTMLSelectElement;
}

function defaultIsHtmlElement(value) {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}

export function wireKeydownEvents({
  windowObj,
  documentObj,
  elements,
  boardContextMenuState,
  isTextEditableTarget,
  undoLastChange,
  redoLastChange,
  closeBoardContextMenu,
  widgetTitleRenameState,
  isInsideWidgetTitleRenameOverlay,
  closeWidgetTitleRenameModal,
  applyWidgetTitleRenameModal,
  isAddWidgetModalOpen,
  isInsideAddWidgetModalOverlay,
  closeAddWidgetModal,
  applyAddWidgetModal,
  isDockSettingsModalOpen,
  isInsideDockSettingsModalOverlay,
  closeDockSettingsModal,
  applyDockSettingsModal,
  modalState,
  shortcutIconEditorState,
  closeShortcutIconEditor,
  isInsideModalOverlay,
  closeWidgetModal,
  isHtmlInputElement = defaultIsHtmlInputElement,
  isHtmlSelectElement = defaultIsHtmlSelectElement,
  isHtmlElement = defaultIsHtmlElement
} = {}) {
  if (!windowObj || !documentObj || !elements || !modalState) {
    return;
  }

  windowObj.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const withMod = event.ctrlKey || event.metaKey;
    const isTypingTarget = isTextEditableTarget?.(event.target);
    const isUndo = withMod && !event.altKey && !event.shiftKey && key === "z";
    const isRedo = withMod && !event.altKey && (key === "y" || (event.shiftKey && key === "z"));

    if ((isUndo || isRedo) && !isTypingTarget) {
      event.preventDefault();
      if (isUndo) {
        undoLastChange?.();
      } else {
        redoLastChange?.();
      }
      return;
    }

    if (boardContextMenuState?.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeBoardContextMenu?.();
      }
      return;
    }

    if (widgetTitleRenameState?.open) {
      if (!isInsideWidgetTitleRenameOverlay?.(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeWidgetTitleRenameModal?.();
        return;
      }

      if (event.key === "Enter" && isHtmlInputElement(event.target)) {
        event.preventDefault();
        applyWidgetTitleRenameModal?.();
        return;
      }
    }

    if (isAddWidgetModalOpen?.()) {
      if (!isInsideAddWidgetModalOverlay?.(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeAddWidgetModal?.();
        return;
      }

      if (event.key === "Enter" && isHtmlInputElement(event.target)) {
        event.preventDefault();
        applyAddWidgetModal?.();
        return;
      }
    }

    if (isDockSettingsModalOpen?.()) {
      if (!isInsideDockSettingsModalOverlay?.(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeDockSettingsModal?.(false);
        return;
      }

      if (
        event.key === "Enter" &&
        (isHtmlSelectElement(event.target) ||
          (isHtmlInputElement(event.target) && event.target.type !== "checkbox"))
      ) {
        event.preventDefault();
        applyDockSettingsModal?.();
        return;
      }

      return;
    }

    if (!modalState.open) {
      if (shortcutIconEditorState?.open && event.key === "Escape") {
        event.preventDefault();
        closeShortcutIconEditor?.();
      }
      return;
    }

    if (shortcutIconEditorState?.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeShortcutIconEditor?.();
      }
      return;
    }

    if (!isInsideModalOverlay?.(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeWidgetModal?.(false);
      return;
    }

    if (event.key === "Tab") {
      const focusable = elements.widgetModalOverlay?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || !focusable.length) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = documentObj.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        if (isHtmlElement(last) && typeof last.focus === "function") {
          last.focus();
        }
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        if (isHtmlElement(first) && typeof first.focus === "function") {
          first.focus();
        }
      }
    }
  });
}
