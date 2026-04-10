export function createWidgetStateRuntime(deps) {
  function setWidgetContainer(instanceId, containerId, { record = true, rerender = true, save = true } = {}) {
    const state = deps.getState();
    const instance = deps.instanceById(instanceId);
    if (!instance || instance.type === "container") {
      return false;
    }

    const previousContainerId = deps.normalizeContainerId(instance.containerId);
    const requestedContainerId = deps.normalizeContainerId(containerId);
    let nextContainerId = "";

    if (requestedContainerId) {
      const target = deps.instanceById(requestedContainerId);
      if (target && target.type === "container" && target.id !== instance.id) {
        nextContainerId = target.id;
      }
    }

    if (previousContainerId === nextContainerId) {
      return false;
    }

    if (nextContainerId && !deps.canPlaceWidgetInContainer(instance.id, nextContainerId)) {
      return false;
    }

    if (record) {
      deps.recordHistorySnapshot(nextContainerId ? "Move widget to folder" : "Move widget out of folder");
    } else {
      deps.touchUserMutationClock();
    }

    instance.containerId = nextContainerId;
    if (nextContainerId) {
      instance.dockOrder = null;
      deps.appendWidgetToContainerOrder(instance.id, nextContainerId);
      if (state.selectedWidgetId === instance.id) {
        state.selectedWidgetId = "";
      }
    }

    deps.normalizeContainerAssignments(state.instances);

    if (rerender) {
      deps.renderBoard();
      deps.renderSettings();
    } else {
      deps.refreshWidgetsByType("container");
    }

    if (save) {
      deps.queueSave();
    }
    return true;
  }

  function releaseWidgetFromContainerByDrop(widgetId, payload = {}) {
    const state = deps.getState();
    const instance = deps.instanceById(widgetId);
    if (!instance || instance.type === "container") {
      return false;
    }

    const currentContainerId = deps.normalizeContainerId(instance.containerId);
    if (!currentContainerId) {
      return false;
    }

    const boardRect = deps.elements.board?.getBoundingClientRect();
    if (!boardRect) {
      return false;
    }

    const sourceContainer = deps.instanceById(currentContainerId);
    const releasePage = deps.normalizeWidgetPage(
      payload?.page,
      deps.currentLauncherPageCount(),
      deps.normalizeWidgetPage(sourceContainer?.page, deps.currentLauncherPageCount(), deps.currentLauncherActivePage())
    );

    const requestedPage = Number.isFinite(Number(payload?.page)) ? Math.floor(Number(payload.page)) : releasePage;
    if (deps.isLauncherPlaceholderPolicyActive() && deps.isPlaceholderLauncherPage(requestedPage, deps.currentLauncherPageCount())) {
      return deps.commitPlaceholderPageDrop(widgetId, payload, requestedPage);
    }

    deps.recordHistorySnapshot("Move widget out of folder");
    deps.clearPendingPlaceholderDrop({ clearVirtualPage: true });

    setWidgetContainer(widgetId, "", { record: false, rerender: false, save: false });

    instance.page = releasePage;
    state.ui.home.activePage = releasePage;

    const projection = deps.projectWidgetBoardDropLayout(instance, payload, { pageFallback: releasePage });
    if (!projection) {
      return false;
    }

    instance.page = projection.page;
    instance.layout = {
      ...instance.layout,
      ...projection.layout
    };
    if (projection.gridLayout) {
      instance.gridLayout = projection.gridLayout;
    }

    state.selectedWidgetId = instance.id;
    deps.renderBoard();
    deps.queueSave();
    return true;
  }

  function releaseWidgetFromDockByDrop(widgetId, payload = {}) {
    const state = deps.getState();
    const instance = deps.instanceById(widgetId);
    if (!instance || instance.type === "container" || !deps.isWidgetDocked(instance)) {
      return false;
    }

    const boardRect = deps.elements.board?.getBoundingClientRect();
    if (!boardRect) {
      return false;
    }

    const requestedPage = Number.isFinite(Number(payload?.page)) ? Math.floor(Number(payload.page)) : deps.currentLauncherActivePage();
    if (deps.isLauncherPlaceholderPolicyActive() && deps.isPlaceholderLauncherPage(requestedPage, deps.currentLauncherPageCount())) {
      return deps.commitPlaceholderPageDrop(widgetId, payload, requestedPage);
    }

    deps.recordHistorySnapshot("Undock widget");
    deps.clearPendingPlaceholderDrop({ clearVirtualPage: true });

    instance.dockOrder = null;
    instance.containerId = "";
    deps.normalizeDockedWidgetOrders(state.instances);

    const releasePage = deps.normalizeWidgetPage(payload?.page, deps.currentLauncherPageCount(), deps.currentLauncherActivePage());
    instance.page = releasePage;
    state.ui.home.activePage = releasePage;

    const projection = deps.projectWidgetBoardDropLayout(instance, payload, { pageFallback: releasePage });
    if (!projection) {
      return false;
    }

    instance.page = projection.page;
    instance.layout = {
      ...instance.layout,
      ...projection.layout
    };
    if (projection.gridLayout) {
      instance.gridLayout = projection.gridLayout;
    }

    state.selectedWidgetId = instance.id;
    deps.renderBoard();
    deps.queueSave();
    return true;
  }

  function patchWidgetLayout(instanceId, layoutPatch, options = {}) {
    const instance = deps.instanceById(instanceId);
    if (!instance) {
      return;
    }

    const nextLayout = {
      ...instance.layout,
      ...layoutPatch
    };

    if (instance.type === "container") {
      const unit = deps.containerUnitLayoutSize();
      nextLayout.w = unit.w;
      nextLayout.h = unit.h;
    }

    const changed =
      nextLayout.x !== instance.layout.x ||
      nextLayout.y !== instance.layout.y ||
      nextLayout.w !== instance.layout.w ||
      nextLayout.h !== instance.layout.h;
    if (!changed) {
      return;
    }

    if (options.record !== false) {
      deps.recordHistorySnapshot(options.label || "Move widget");
    }

    instance.layout = nextLayout;
    const rt = deps.runtimeMap.get(instanceId);
    if (rt) {
      deps.applyLayout(rt.card, instance.layout, instance.page);
      if (instance.type === "container") {
        rt.controller?.refresh?.();
      }
    }

    deps.updateBoardBounds();
    deps.renderSettings();
    deps.queueSave();
  }

  function removeWidget(instanceId) {
    const state = deps.getState();
    const index = state.instances.findIndex((item) => item.id === instanceId);
    if (index < 0) {
      return;
    }

    const removed = state.instances[index];
    deps.recordHistorySnapshot("Remove widget");
    deps.runtimeMap.get(instanceId)?.controller?.destroy?.();
    deps.runtimeMap.get(instanceId)?.card?.remove?.();
    deps.runtimeMap.delete(instanceId);

    if (removed?.type === "container") {
      for (const instance of state.instances) {
        if (instance?.id === removed.id || instance?.type === "container") {
          continue;
        }
        if (deps.normalizeContainerId(instance.containerId) === removed.id) {
          instance.containerId = "";
        }
      }
    }

    state.instances.splice(index, 1);
    deps.normalizeDockedWidgetOrders(state.instances);
    deps.normalizeContainerAssignments(state.instances);

    const removedBoardPage = deps.isBoardWidgetInstance(removed)
      ? deps.normalizeWidgetPage(removed.page, deps.currentLauncherPageCount(), deps.currentLauncherActivePage())
      : null;

    if (state.selectedWidgetId === instanceId) {
      state.selectedWidgetId = "";
    }

    if (deps.modalState.open && deps.modalState.widgetId === instanceId) {
      deps.closeWidgetModal(false);
    }

    const compacted = Number.isFinite(removedBoardPage) ? deps.compactEmptyLauncherPagesForUseMode() : false;

    deps.renderDockWidgets();
    deps.renderSettings();
    if (compacted || removed?.type === "container" || deps.isWidgetInContainer(removed)) {
      deps.renderBoard();
    } else {
      deps.updateBoardBounds();
      deps.refreshWidgetsByType("container");
    }
    deps.queueSave();
  }

  return {
    setWidgetContainer,
    releaseWidgetFromContainerByDrop,
    releaseWidgetFromDockByDrop,
    patchWidgetLayout,
    removeWidget
  };
}
