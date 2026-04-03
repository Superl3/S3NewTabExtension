export function applyGridLayoutRuntime({ commitFreeLayout = false, shouldSave = false } = {}, deps) {
  if (!deps.isGridLayoutMode()) {
    return;
  }

  deps.syncLauncherPagingState({ expandToFitInstances: true });
  if (commitFreeLayout) {
    deps.captureFreeLayouts();
  }

  const state = deps.getState();
  const items = state.instances.filter(
    (instance) => instance.enabled !== false && !deps.isWidgetDocked(instance) && !deps.isWidgetInContainer(instance)
  );

  if (!items.length) {
    deps.renderBoardViewport({ animate: false, dragging: false, dragOffsetX: 0 });
    return;
  }

  const metrics = deps.gridMetrics(items);

  const byPage = new Map();
  for (const instance of items) {
    const page = deps.normalizeWidgetPage(instance.page, state.ui.home.pageCount, 0);
    instance.page = page;
    if (!byPage.has(page)) {
      byPage.set(page, []);
    }
    byPage.get(page).push(instance);
  }

  for (const pageItems of byPage.values()) {
    for (let i = 0; i < pageItems.length; i += 1) {
      const instance = pageItems[i];
      const def = deps.widgetRegistry[instance.type];
      const defaultSize = deps.widgetDefaultGridSize(instance.type, def);
      const grid = deps.normalizeGridLayout(instance.gridLayout, {
        col: i % metrics.cols,
        row: Math.floor(i / metrics.cols),
        colSpan: defaultSize.colSpan,
        rowSpan: defaultSize.rowSpan
      });

      if (instance.type === "container") {
        grid.colSpan = 1;
        grid.rowSpan = 1;
      }

      grid.colSpan = deps.clamp(grid.colSpan, 1, metrics.cols);
      grid.rowSpan = deps.clamp(grid.rowSpan, 1, metrics.rows);
      grid.col = deps.clamp(grid.col, 0, Math.max(0, metrics.cols - grid.colSpan));
      grid.row = deps.clamp(grid.row, 0, Math.max(0, metrics.rows - grid.rowSpan));
      instance.gridLayout = grid;

      instance.layout.x = metrics.marginX + grid.col * (metrics.cellW + metrics.gapX);
      instance.layout.y = metrics.marginY + grid.row * (metrics.cellH + metrics.gapY);
      instance.layout.w = metrics.cellW * grid.colSpan + metrics.gapX * (grid.colSpan - 1);
      instance.layout.h = metrics.cellH * grid.rowSpan + metrics.gapY * (grid.rowSpan - 1);

      const rt = deps.runtimeMap.get(instance.id);
      if (rt?.card) {
        deps.applyLayout(rt.card, instance.layout, instance.page);
        if (instance.type === "container") {
          rt.controller?.refresh?.();
        }
      }
    }
  }

  deps.renderBoardViewport({ animate: false, dragging: false, dragOffsetX: 0 });

  if (shouldSave) {
    deps.queueSave();
  }
}
