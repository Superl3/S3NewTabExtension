export function createDockSettingsRuntime({
  state,
  elements,
  dockModalState,
  isOpen,
  setOpen,
  modalState,
  getAddWidgetModalOpen,
  shortcutIconEditorState,
  widgetTitleRenameState,
  closeWidgetModal,
  closeAddWidgetModal,
  closeShortcutIconEditor,
  closeWidgetTitleRenameModal,
  normalizeHomeLayout,
  normalizeDockShape,
  normalizeDockVisibility,
  normalizeDockLength,
  normalizeDockSize,
  defaultHomeLayout,
  patchHomeLayout,
  setModalInteractionLock,
  blurFocusedElementInOverlay,
  syncPersistentDock,
  renderSettings,
  createFormRow,
  createInputBySchema,
  settingsEventName,
  readFieldValue,
  requestAnimationFrameFn,
  commitPendingEditableState
} = {}) {
  function dockSettingsFields() {
    return [
      {
        key: "dockShape",
        label: "Dock shape",
        type: "select",
        options: [
          { value: "raised", label: "Raised tray" },
          { value: "flat", label: "Flat wrap" }
        ]
      },
      {
        key: "dockVisibility",
        label: "Dock visibility",
        type: "select",
        options: [
          { value: "fixed", label: "Fixed" },
          { value: "collapsible", label: "Collapsible (reveal on hover)" }
        ]
      },
      {
        key: "dockLength",
        label: "Dock length (units)",
        type: "number",
        min: 5,
        max: 14,
        step: 1
      },
      {
        key: "dockSize",
        label: "Dock size (px)",
        type: "number",
        min: 36,
        max: 72,
        step: 1
      }
    ];
  }

  function renderDockSettingsModal() {
    if (!isOpen?.() || !dockModalState?.draft || !elements?.dockSettingsModalBody) {
      return;
    }

    elements.dockSettingsModalBody.replaceChildren();
    for (const schema of dockSettingsFields()) {
      const row = createFormRow?.(schema.label);
      const input = createInputBySchema?.(schema, dockModalState.draft[schema.key]);
      input?.addEventListener?.(settingsEventName?.(schema), () => {
        dockModalState.draft[schema.key] = readFieldValue?.(input, schema);
      });
      row?.append?.(input);
      elements.dockSettingsModalBody.append?.(row);
    }
  }

  function openDockSettingsModal() {
    if (state?.mode !== "edit") {
      return;
    }
    if (!elements?.dockSettingsModalOverlay || !state?.ui?.home) {
      return;
    }

    if (modalState?.open) {
      closeWidgetModal?.(false);
    }
    if (getAddWidgetModalOpen?.()) {
      closeAddWidgetModal?.();
    }
    if (shortcutIconEditorState?.open) {
      closeShortcutIconEditor?.();
    }
    if (widgetTitleRenameState?.open) {
      closeWidgetTitleRenameModal?.();
    }

    const home = normalizeHomeLayout?.(state.ui.home);
    dockModalState.draft = {
      dockShape: normalizeDockShape?.(home.dockShape, "raised"),
      dockVisibility: normalizeDockVisibility?.(home.dockVisibility, "fixed"),
      dockLength: normalizeDockLength?.(home.dockLength, 6),
      dockSize: normalizeDockSize?.(home.dockSize, 44)
    };

    setOpen?.(true);
    renderDockSettingsModal();
    elements.dockSettingsModalOverlay.classList?.add?.("open");
    elements.dockSettingsModalOverlay.setAttribute?.("aria-hidden", "false");
    setModalInteractionLock?.(true);
    syncPersistentDock?.();

    requestAnimationFrameFn?.(() => {
      const firstInput = elements.dockSettingsModalBody?.querySelector?.("input, select, button");
      firstInput?.focus?.();
    });
  }

  function closeDockSettingsModal(rerender = false) {
    if (!isOpen?.()) {
      return;
    }

    setOpen?.(false);
    dockModalState.draft = null;
    blurFocusedElementInOverlay?.(elements?.dockSettingsModalOverlay);
    elements?.dockSettingsModalOverlay?.classList?.remove?.("open");
    elements?.dockSettingsModalOverlay?.setAttribute?.("aria-hidden", "true");
    elements?.dockSettingsModalBody?.replaceChildren?.();

    if (!modalState?.open && !getAddWidgetModalOpen?.() && !shortcutIconEditorState?.open && !widgetTitleRenameState?.open) {
      setModalInteractionLock?.(false);
    }

    if (rerender) {
      renderSettings?.();
    }
    syncPersistentDock?.();
  }

  function resetDockSettingsDraftToDefault() {
    if (!isOpen?.()) {
      return;
    }
    const defaults = defaultHomeLayout?.();
    dockModalState.draft = {
      dockShape: defaults.dockShape,
      dockVisibility: defaults.dockVisibility,
      dockLength: defaults.dockLength,
      dockSize: defaults.dockSize
    };
    renderDockSettingsModal();
  }

  function applyDockSettingsModal() {
    if (!isOpen?.() || !dockModalState?.draft) {
      return false;
    }

    commitPendingEditableState?.(elements?.dockSettingsModalBody, { includeDescendants: true });

    const patch = {
      dockShape: normalizeDockShape?.(dockModalState.draft.dockShape, "raised"),
      dockVisibility: normalizeDockVisibility?.(dockModalState.draft.dockVisibility, "fixed"),
      dockPosition: "bottom",
      dockLength: normalizeDockLength?.(dockModalState.draft.dockLength, 6),
      dockSize: normalizeDockSize?.(dockModalState.draft.dockSize, 44)
    };

    closeDockSettingsModal(false);
    patchHomeLayout?.(patch);
    return true;
  }

  return {
    dockSettingsFields,
    renderDockSettingsModal,
    openDockSettingsModal,
    closeDockSettingsModal,
    resetDockSettingsDraftToDefault,
    applyDockSettingsModal
  };
}
