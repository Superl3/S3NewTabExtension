import { snapToHalfGridTrack } from "./utils/grid.js";

export function projectWidgetBoardDropLayoutRuntime(instance, payload = {}, { pageFallback = null } = {}, deps) {
  const viewportRect = deps.getLauncherViewportRect();
  const board = deps.elements.board;
  if (!instance || !viewportRect || !deps.isHtmlElement(board)) {
    return null;
  }

  const boardWidth = Math.max(1, Math.floor(board.clientWidth || viewportRect.width));
  const boardHeight = Math.max(1, Math.floor(board.clientHeight || viewportRect.height));

  const pageCount = deps.currentLauncherPageCount();
  const activePage = deps.currentLauncherActivePage();
  const defaultPage = Number.isFinite(pageFallback) ? pageFallback : activePage;
  const page = deps.normalizeWidgetPage(payload?.page, pageCount, defaultPage);

  const pointerX = Number.isFinite(payload?.clientX) ? payload.clientX : viewportRect.left + boardWidth / 2;
  const pointerY = Number.isFinite(payload?.clientY) ? payload.clientY : viewportRect.top + boardHeight / 2;
  const dragOffsetX = Number(payload?.dragOffsetX);
  const dragOffsetY = Number(payload?.dragOffsetY);

  if (deps.isGridLayoutMode()) {
    const metrics = deps.gridMetrics();
    const def = deps.widgetRegistry[instance.type];
    const fallback = deps.widgetDefaultGridSize(instance.type, def);
    const grid = deps.normalizeGridLayout(instance.gridLayout, {
      col: 0,
      row: 0,
      colSpan: fallback.colSpan,
      rowSpan: fallback.rowSpan
    });

    const spanWidth = metrics.cellW * grid.colSpan + metrics.gapX * (grid.colSpan - 1);
    const spanHeight = metrics.cellH * grid.rowSpan + metrics.gapY * (grid.rowSpan - 1);
    const stepX = Math.max(1, metrics.cellW + metrics.gapX);
    const stepY = Math.max(1, metrics.cellH + metrics.gapY);
    const anchorOffsetX = Number.isFinite(dragOffsetX) ? deps.clamp(dragOffsetX, 0, spanWidth) : spanWidth / 2;
    const anchorOffsetY = Number.isFinite(dragOffsetY) ? deps.clamp(dragOffsetY, 0, spanHeight) : spanHeight / 2;
    const localX = deps.clamp(pointerX - viewportRect.left - anchorOffsetX, 0, Math.max(0, boardWidth - spanWidth));
    const localY = deps.clamp(pointerY - viewportRect.top - anchorOffsetY, 0, Math.max(0, boardHeight - spanHeight));

    grid.col = deps.clamp(
      snapToHalfGridTrack((localX - metrics.marginX) / stepX),
      0,
      Math.max(0, metrics.cols - grid.colSpan)
    );
    grid.row = deps.clamp(
      snapToHalfGridTrack((localY - metrics.marginY) / stepY),
      0,
      Math.max(0, metrics.rows - grid.rowSpan)
    );

    return {
      page,
      gridLayout: grid,
      layout: {
        x: metrics.marginX + grid.col * stepX,
        y: metrics.marginY + grid.row * stepY,
        w: spanWidth,
        h: spanHeight
      }
    };
  }

  const maxW = Math.max(80, boardWidth);
  const maxH = Math.max(80, boardHeight);
  const width = deps.clamp(Number(instance.layout.w) || 320, 80, maxW);
  const height = deps.clamp(Number(instance.layout.h) || 220, 80, maxH);
  const maxX = Math.max(0, boardWidth - width);
  const maxY = Math.max(0, boardHeight - height);
  const anchorOffsetX = Number.isFinite(dragOffsetX) ? deps.clamp(dragOffsetX, 0, width) : width / 2;
  const anchorOffsetY = Number.isFinite(dragOffsetY) ? deps.clamp(dragOffsetY, 0, height) : height / 2;
  const nextX = deps.clamp(pointerX - viewportRect.left - anchorOffsetX, 0, maxX);
  const nextY = deps.clamp(pointerY - viewportRect.top - anchorOffsetY, 0, maxY);

  return {
    page,
    gridLayout: null,
    layout: {
      x: Math.round(nextX / deps.snap) * deps.snap,
      y: Math.round(nextY / deps.snap) * deps.snap,
      w: width,
      h: height
    }
  };
}
