function launcherPageWidgetCounts(getState, pageCount, { isBoardWidgetInstance, normalizeWidgetPage }) {
  const state = getState();
  const counts = Array.from({ length: Math.max(1, pageCount) }, () => 0);
  for (const instance of state.instances || []) {
    if (!isBoardWidgetInstance(instance)) {
      continue;
    }
    const page = normalizeWidgetPage(instance.page, pageCount, 0);
    counts[page] += 1;
  }
  return counts;
}

export function createLauncherPageRuntime(deps) {
  function compactEmptyLauncherPagesForUseMode() {
    const state = deps.getState();
    if (!state?.ui?.home || state.mode !== "use") {
      return false;
    }

    const home = deps.syncLauncherPagingState({ expandToFitInstances: true });
    const pageCount = home.pageCount;
    if (pageCount <= 1) {
      return false;
    }

    const counts = launcherPageWidgetCounts(deps.getState, pageCount, {
      isBoardWidgetInstance: deps.isBoardWidgetInstance,
      normalizeWidgetPage: deps.normalizeWidgetPage
    });
    const homePage = deps.normalizeActivePage(home.homePage, pageCount, 0);
    const manualPages = deps.normalizeLauncherPageIndexList(home.manualPages, pageCount);
    const keptPagesSet = new Set([homePage, ...manualPages]);
    for (let page = 0; page < counts.length; page += 1) {
      if (counts[page] > 0) {
        keptPagesSet.add(page);
      }
    }

    const keptPages = Array.from(keptPagesSet).sort((left, right) => left - right);
    const targetPageCount = Math.max(1, keptPages.length);

    if (targetPageCount === pageCount) {
      home.homePage = homePage;
      home.manualPages = manualPages;
      state.ui.home = home;
      return false;
    }

    const remap = new Map();
    keptPages.forEach((oldPage, nextPage) => {
      remap.set(oldPage, nextPage);
    });

    for (const instance of state.instances || []) {
      if (!deps.isBoardWidgetInstance(instance)) {
        continue;
      }
      const oldPage = deps.normalizeWidgetPage(instance.page, pageCount, 0);
      const nextPage = remap.get(oldPage);
      if (Number.isFinite(nextPage)) {
        instance.page = nextPage;
      }
    }

    const activePage = deps.normalizeActivePage(home.activePage, pageCount, homePage);
    const nextActiveOldPage = deps.resolvePageTowardHomeDirection(keptPages, activePage, homePage);
    const nextHomeOldPage = deps.resolvePageTowardHomeDirection(keptPages, homePage, homePage);

    home.pageCount = targetPageCount;
    home.homePage = deps.normalizeActivePage(remap.get(nextHomeOldPage), home.pageCount, 0);
    home.activePage = deps.normalizeActivePage(remap.get(nextActiveOldPage), home.pageCount, home.homePage);
    home.manualPages = deps.remapLauncherPageIndexList(manualPages, remap, home.pageCount);
    state.ui.home = home;
    return true;
  }

  function deleteLauncherPageAt(pageIndex) {
    const state = deps.getState();
    if (state.mode !== "edit") {
      return false;
    }

    const home = deps.syncLauncherPagingState({ expandToFitInstances: true });
    const pageCount = home.pageCount;
    if (pageCount <= 1) {
      return false;
    }

    const targetPage = deps.normalizeWidgetPage(pageIndex, pageCount, 0);
    const homePageBefore = deps.normalizeActivePage(home.homePage, pageCount, 0);
    const activePageBefore = deps.normalizeActivePage(home.activePage, pageCount, homePageBefore);
    const keptOldPages = [];
    for (let page = 0; page < pageCount; page += 1) {
      if (page !== targetPage) {
        keptOldPages.push(page);
      }
    }
    const nextActiveOldPage = deps.resolvePageTowardHomeDirection(keptOldPages, activePageBefore, homePageBefore);
    const nextHomeOldPage = deps.resolvePageTowardHomeDirection(keptOldPages, homePageBefore, homePageBefore);

    deps.recordHistorySnapshot("Delete launcher page");

    for (const instance of state.instances || []) {
      if (!deps.isBoardWidgetInstance(instance)) {
        continue;
      }
      const page = deps.normalizeWidgetPage(instance.page, pageCount, 0);
      if (page === targetPage) {
        instance.page = deps.remapPageForDeletion(page, targetPage, pageCount - 1);
        continue;
      }
      if (page > targetPage) {
        instance.page = page - 1;
      }
    }

    home.pageCount = deps.normalizePageCount(pageCount - 1, pageCount - 1);
    home.homePage = deps.normalizeActivePage(
      deps.remapPageForDeletion(nextHomeOldPage, targetPage, home.pageCount),
      home.pageCount,
      0
    );
    home.activePage = deps.normalizeActivePage(
      deps.remapPageForDeletion(nextActiveOldPage, targetPage, home.pageCount),
      home.pageCount,
      home.homePage
    );
    home.manualPages = deps.shiftLauncherPageIndexListOnDelete(home.manualPages, targetPage, home.pageCount);
    state.ui.home = home;

    deps.clearPendingPlaceholderDrop({ clearVirtualPage: true });
    deps.refreshBoardCardsAfterLauncherPageMutation({ animate: true });
    deps.queueSave();
    return true;
  }

  function queuePlaceholderPageDrop(instanceId, payload = {}, placeholderPage = null) {
    if (!deps.isLauncherPlaceholderPolicyActive()) {
      return false;
    }

    const home = deps.syncLauncherPagingState({ expandToFitInstances: true });
    const pageCount = home.pageCount;
    const targetPlaceholder = Number.isFinite(Number(placeholderPage))
      ? Math.floor(Number(placeholderPage))
      : Math.floor(Number(payload?.page));

    if (!deps.isPlaceholderLauncherPage(targetPlaceholder, pageCount)) {
      return false;
    }

    const instance = deps.instanceById(instanceId);
    if (!instance) {
      return false;
    }

    deps.launcherPageUiState.pendingPlaceholderDrop = {
      widgetId: instance.id,
      placeholderPage: targetPlaceholder,
      clientX: Number.isFinite(payload?.clientX) ? payload.clientX : null,
      clientY: Number.isFinite(payload?.clientY) ? payload.clientY : null
    };
    deps.launcherPageUiState.virtualPage = targetPlaceholder;
    deps.renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
    return true;
  }

  function materializePendingPlaceholderPage() {
    const pending = deps.launcherPageUiState.pendingPlaceholderDrop;
    if (!pending) {
      return false;
    }

    const instance = deps.instanceById(pending.widgetId);
    if (!instance) {
      deps.clearPendingPlaceholderDrop({ clearVirtualPage: true });
      deps.renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
      return false;
    }

    const state = deps.getState();
    const home = deps.syncLauncherPagingState({ expandToFitInstances: true });
    const oldPageCount = home.pageCount;
    if (oldPageCount >= deps.maxLauncherPages) {
      return false;
    }

    const addLeft = pending.placeholderPage < 0;
    const homePageBefore = deps.normalizeActivePage(home.homePage, oldPageCount, 0);
    const manualPagesBefore = deps.normalizeLauncherPageIndexList(home.manualPages, oldPageCount);

    deps.recordHistorySnapshot("Create launcher page by drop");

    if (addLeft) {
      for (const entry of state.instances || []) {
        if (!deps.isBoardWidgetInstance(entry)) {
          continue;
        }
        entry.page = deps.normalizeWidgetPage(entry.page, oldPageCount, 0) + 1;
      }
    }

    home.pageCount = deps.normalizePageCount(oldPageCount + 1, oldPageCount + 1);
    const targetPage = addLeft ? 0 : oldPageCount;
    home.activePage = targetPage;
    home.homePage = addLeft ? deps.normalizeWidgetPage(homePageBefore + 1, home.pageCount, 1) : homePageBefore;
    home.manualPages = addLeft
      ? deps.normalizeLauncherPageIndexList(manualPagesBefore.map((page) => page + 1), home.pageCount)
      : deps.normalizeLauncherPageIndexList(manualPagesBefore, home.pageCount);
    state.ui.home = home;

    if (deps.isWidgetDocked(instance)) {
      instance.dockOrder = null;
    }
    if (deps.isWidgetInContainer(instance)) {
      instance.containerId = "";
    }
    deps.normalizeDockedWidgetOrders(state.instances);
    deps.normalizeContainerAssignments(state.instances);

    const projection = deps.projectWidgetBoardDropLayout(
      instance,
      {
        clientX: pending.clientX,
        clientY: pending.clientY,
        page: targetPage
      },
      { pageFallback: targetPage }
    );

    if (projection) {
      instance.page = projection.page;
      instance.layout = {
        ...instance.layout,
        ...projection.layout
      };
      if (projection.gridLayout) {
        instance.gridLayout = projection.gridLayout;
      }
    } else {
      instance.page = targetPage;
    }

    state.selectedWidgetId = instance.id;
    deps.clearPendingPlaceholderDrop({ clearVirtualPage: true });
    deps.renderBoard();
    deps.queueSave();
    return true;
  }

  function materializeLauncherPlaceholderPage(placeholderPage) {
    if (!deps.isLauncherPlaceholderPolicyActive()) {
      return false;
    }

    const state = deps.getState();
    const home = deps.syncLauncherPagingState({ expandToFitInstances: true });
    const oldPageCount = home.pageCount;
    const targetPlaceholder = Number.isFinite(Number(placeholderPage))
      ? Math.floor(Number(placeholderPage))
      : oldPageCount;

    if (!deps.isPlaceholderLauncherPage(targetPlaceholder, oldPageCount) || oldPageCount >= deps.maxLauncherPages) {
      return false;
    }

    const addLeft = targetPlaceholder < 0;
    const homePageBefore = deps.normalizeActivePage(home.homePage, oldPageCount, 0);
    const manualPagesBefore = deps.normalizeLauncherPageIndexList(home.manualPages, oldPageCount);

    deps.recordHistorySnapshot("Create empty launcher page");

    if (addLeft) {
      for (const entry of state.instances || []) {
        if (!deps.isBoardWidgetInstance(entry)) {
          continue;
        }
        entry.page = deps.normalizeWidgetPage(entry.page, oldPageCount, 0) + 1;
      }
    }

    home.pageCount = deps.normalizePageCount(oldPageCount + 1, oldPageCount + 1);
    const createdPage = addLeft ? 0 : oldPageCount;
    home.activePage = createdPage;
    home.homePage = addLeft ? deps.normalizeWidgetPage(homePageBefore + 1, home.pageCount, 1) : homePageBefore;
    home.manualPages = deps.shiftLauncherPageIndexListOnInsert(manualPagesBefore, {
      addLeft,
      pageCount: home.pageCount,
      insertedPage: createdPage
    });
    state.ui.home = home;

    deps.launcherPageUiState.virtualPage = null;
    deps.clearPendingPlaceholderDrop();
    deps.renderBoard();
    deps.queueSave();
    return true;
  }

  return {
    compactEmptyLauncherPagesForUseMode,
    deleteLauncherPageAt,
    queuePlaceholderPageDrop,
    materializePendingPlaceholderPage,
    materializeLauncherPlaceholderPage
  };
}
