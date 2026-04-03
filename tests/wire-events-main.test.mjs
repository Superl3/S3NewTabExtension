import test from "node:test";
import assert from "node:assert/strict";

import { wireAppEvents } from "../core/wire-events-main.js";

function createSpy() {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
  };
  fn.calls = calls;
  return fn;
}

test("wireAppEvents delegates to all wire modules", () => {
  const dockSpy = createSpy();
  const settingsSpy = createSpy();
  const widgetSpy = createSpy();
  const lifecycleSpy = createSpy();
  const overlaysSpy = createSpy();
  const guardsSpy = createSpy();
  const keydownSpy = createSpy();
  const onBoardWheelNavigate = () => {};

  wireAppEvents({
    wireDockAndSwipeEvents: dockSpy,
    wireSettingsAndModeEvents: settingsSpy,
    wireWidgetControlEvents: widgetSpy,
    wireWindowLifecycleEvents: lifecycleSpy,
    wireOverlayControlEvents: overlaysSpy,
    wireDocumentGuardEvents: guardsSpy,
    wireKeydownEvents: keydownSpy,
    elements: {},
    state: {},
    getRuntimeSettingsPanelOpen: () => false,
    setRuntimeSettingsPanelOpen: () => {},
    syncSettingsPanelVisibility: () => {},
    refreshBackgroundNow: () => {},
    currentLauncherPageCount: () => 1,
    currentLauncherViewportPage: () => 0,
    isPlaceholderLauncherPage: () => false,
    setActiveLauncherPage: () => {},
    currentLauncherActivePage: () => 0,
    compactEmptyLauncherPagesForUseMode: () => {},
    setBodyMode: () => {},
    setSelected: () => {},
    refreshAllWidgets: () => {},
    updateBoardBounds: () => {},
    requestAnimationFrameFn: () => {},
    setTimeoutFn: () => {},
    boardPageTransitionMs: 260,
    resolveHomeAnchorTargetPage: () => 0,
    showAddWidgetToast: () => {},
    setLauncherHomePage: () => {},
    isDockSettingsModalOpen: () => false,
    closeDockSettingsModal: () => {},
    openDockSettingsModal: () => {},
    onDockStripKeyDown: () => {},
    onDockStripWheel: () => {},
    syncDockOverflowState: () => {},
    renderSettings: () => {},
    isAddWidgetModalOpen: () => false,
    syncAddWidgetSizeInputs: () => {},
    openAddWidgetModal: () => {},
    closeBoardContextMenu: () => {},
    queueSave: () => {},
    closeAddWidgetModal: () => {},
    applyAddWidgetModal: () => {},
    windowConfirm: () => true,
    resetState: () => {},
    undoLastChange: () => {},
    redoLastChange: () => {},
    documentObj: {},
    windowObj: {},
    applyEditDockPosition: () => {},
    syncPersistentDock: () => {},
    flushPendingSave: () => {},
    modalState: {},
    getLastDragEndAt: () => 0,
    closeWidgetModal: () => {},
    closeWidgetTitleRenameModal: () => {},
    applyWidgetTitleRenameModal: () => {},
    applyDockSettingsModal: () => {},
    resetDockSettingsDraftToDefault: () => {},
    applyWidgetModal: () => {},
    closeShortcutIconEditor: () => {},
    applyShortcutIconEditor: () => {},
    resetShortcutIconEditorSource: () => {},
    shortcutEditorRefreshPreview: () => {},
    shortcutIconEditorState: {},
    normalizeText: (value) => String(value || ""),
    loadImageIntoShortcutEditor: () => {},
    boardContextMenuState: {},
    isInsideBoardContextMenu: () => false,
    blockOutsideModalEvent: () => {},
    isTextEditableTarget: () => false,
    canOpenBoardContextMenuFromTarget: () => false,
    openBoardContextMenu: () => {},
    widgetTitleRenameState: {},
    isInsideWidgetTitleRenameOverlay: () => false,
    isInsideAddWidgetModalOverlay: () => false,
    isInsideDockSettingsModalOverlay: () => false,
    isInsideModalOverlay: () => false,
    isHtmlInputElement: () => false,
    isHtmlSelectElement: () => false,
    isHtmlElement: () => false,
    dockDragState: {},
    beginBoardSwipe: () => {},
    moveBoardSwipe: () => {},
    endBoardSwipe: () => {},
    onBoardWheelNavigate
  });

  assert.equal(dockSpy.calls.length, 1);
  assert.equal(settingsSpy.calls.length, 1);
  assert.equal(widgetSpy.calls.length, 1);
  assert.equal(lifecycleSpy.calls.length, 1);
  assert.equal(overlaysSpy.calls.length, 1);
  assert.equal(guardsSpy.calls.length, 1);
  assert.equal(keydownSpy.calls.length, 1);
  assert.equal(dockSpy.calls[0][0].onBoardWheelNavigate, onBoardWheelNavigate);
});
