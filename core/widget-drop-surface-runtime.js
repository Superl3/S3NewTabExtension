export function createWidgetDropSurfaceRuntime(deps) {
  function tryContainerWidgetByDrop(instance, pointerEvent, { record = true } = {}) {
    if (!instance || !pointerEvent) {
      return false;
    }

    const targetContainerId = deps.containerDropTargetAtPoint(pointerEvent.clientX, pointerEvent.clientY, instance);
    if (!targetContainerId) {
      return false;
    }

    const insertIndex = deps.resolveContainerInsertIndexFromPointer(
      targetContainerId,
      pointerEvent.clientX,
      pointerEvent.clientY,
      {
        excludeWidgetId: instance.id,
        panelElement: pointerEvent?.panelElement
      }
    );

    if (deps.normalizeContainerId(instance.containerId) === targetContainerId) {
      return deps.reorderWidgetInContainerByIndex(instance.id, targetContainerId, insertIndex, {
        record,
        rerender: true,
        save: true
      });
    }

    const sourceBoardPage = deps.isBoardWidgetInstance(instance)
      ? deps.normalizeWidgetPage(instance.page, deps.currentLauncherPageCount(), deps.currentLauncherActivePage())
      : null;

    const moved = deps.setWidgetContainer(instance.id, targetContainerId, {
      record,
      rerender: false,
      save: false
    });
    if (!moved) {
      return false;
    }

    deps.reorderWidgetInContainerByIndex(instance.id, targetContainerId, insertIndex, {
      record: false,
      rerender: false,
      save: false
    });

    if (Number.isFinite(sourceBoardPage)) {
      deps.compactEmptyLauncherPagesForUseMode();
    }

    deps.renderBoard();
    deps.renderSettings();
    deps.queueSave();
    return true;
  }

  function tryDockWidgetByDrop(instance, pointerEvent, { record = true } = {}) {
    if (!instance || !pointerEvent || !deps.isDockDropPoint(pointerEvent.clientX, pointerEvent.clientY)) {
      return false;
    }
    if (!deps.isDockEligibleWidget(instance)) {
      return false;
    }

    const wasDocked = deps.isWidgetDocked(instance);
    const wasInContainer = deps.isWidgetInContainer(instance);
    const sourceBoardPage = !wasDocked && !wasInContainer
      ? deps.normalizeWidgetPage(instance.page, deps.currentLauncherPageCount(), deps.currentLauncherActivePage())
      : null;
    const targetSlot = deps.resolveDockDropSlotIndex(pointerEvent.clientX, pointerEvent.clientY, instance);
    if (targetSlot === null) {
      return false;
    }

    if (record) {
      if (wasDocked) {
        deps.recordHistorySnapshot("Move dock widget");
      } else if (wasInContainer) {
        deps.recordHistorySnapshot("Move widget from folder to dock");
      } else {
        deps.recordHistorySnapshot("Dock widget");
      }
    } else {
      deps.touchUserMutationClock();
    }

    const moved = deps.moveWidgetToDockSlot(instance, targetSlot, { record: false });
    if (!moved) {
      return false;
    }
    deps.renderDockWidgets();

    if (Number.isFinite(sourceBoardPage)) {
      deps.compactEmptyLauncherPagesForUseMode();
    }
    return true;
  }

  return {
    tryContainerWidgetByDrop,
    tryDockWidgetByDrop
  };
}
