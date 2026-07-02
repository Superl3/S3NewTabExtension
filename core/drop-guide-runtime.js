import { clampRoundedTruthyNumberOrFallback, toTruthyNumberOrFallback } from "./utils/number.js";

export function createDropGuideRuntime({
  elements,
  dragGuideUiState,
  containerDropUiState,
  state,
  widgetPageOffsetX,
  resolveDockDropSlotIndex,
  dockSlotRectRelativeToHost,
  normalizeContainerId,
  instanceById,
  normalizeText,
  resolveContainerSpan,
  resolveContainerInsertIndexFromPointer,
  clamp,
  resolveWidgetSpanInContainer,
  cssPixelValue,
  containerDropTargetAtPoint,
  isDockDropPoint,
  setContainerDropTargetActive,
  setDockDropTargetActive,
  isGridLayoutMode,
  windowObj = typeof window !== "undefined" ? window : null
} = {}) {
  const isElement = (value) => {
    if (typeof HTMLElement !== "undefined") {
      return value instanceof HTMLElement;
    }
    return Boolean(value && typeof value === "object" && value.classList && value.style);
  };

  function clearWidgetDropGuideHost(host) {
    if (!isElement(host)) {
      return;
    }
    host.classList.remove("is-drop-guide-active");
    host.removeAttribute("data-drop-guide-mode");
    host.style.removeProperty("--drop-guide-left");
    host.style.removeProperty("--drop-guide-top");
    host.style.removeProperty("--drop-guide-width");
    host.style.removeProperty("--drop-guide-height");
    host.style.removeProperty("--drop-guide-radius");
  }

  function clearWidgetDropGuide() {
    if (!dragGuideUiState?.host) {
      return;
    }
    clearWidgetDropGuideHost(dragGuideUiState.host);
    dragGuideUiState.host = null;
  }

  function applyWidgetDropGuide(host, { mode = "full", rect = null, borderRadius = null } = {}) {
    if (!isElement(host)) {
      clearWidgetDropGuide();
      return;
    }

    if (dragGuideUiState.host && dragGuideUiState.host !== host) {
      clearWidgetDropGuideHost(dragGuideUiState.host);
    }

    const hasSlotRect =
      mode === "slot" &&
      rect &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.w) &&
      Number.isFinite(rect.h);

    host.classList.add("is-drop-guide-active");
    host.dataset.dropGuideMode = hasSlotRect ? "slot" : "full";

    if (hasSlotRect) {
      host.style.setProperty("--drop-guide-left", `${Math.round(rect.x)}px`);
      host.style.setProperty("--drop-guide-top", `${Math.round(rect.y)}px`);
      host.style.setProperty("--drop-guide-width", `${Math.max(1, Math.round(rect.w))}px`);
      host.style.setProperty("--drop-guide-height", `${Math.max(1, Math.round(rect.h))}px`);
    } else {
      host.style.removeProperty("--drop-guide-left");
      host.style.removeProperty("--drop-guide-top");
      host.style.removeProperty("--drop-guide-width");
      host.style.removeProperty("--drop-guide-height");
    }

    if (Number.isFinite(borderRadius)) {
      host.style.setProperty("--drop-guide-radius", `${Math.max(0, Math.round(borderRadius))}px`);
    } else {
      host.style.removeProperty("--drop-guide-radius");
    }

    dragGuideUiState.host = host;
  }

  function boardPageDropGuideRect(page) {
    const board = elements?.board;
    if (!isElement(board)) {
      return null;
    }
    return {
      x: widgetPageOffsetX?.(page) || 0,
      y: 0,
      w: Math.max(1, Math.round(board.clientWidth || 1)),
      h: Math.max(1, Math.round(board.clientHeight || 1))
    };
  }

  function projectedBoardSlotRect(layout, page = 0) {
    if (!layout) {
      return null;
    }
    const pageOffsetX = toTruthyNumberOrFallback(widgetPageOffsetX?.(page), 0);
    return {
      x: Math.round(toTruthyNumberOrFallback(layout.x, 0) + pageOffsetX),
      y: Math.round(toTruthyNumberOrFallback(layout.y, 0)),
      w: clampRoundedTruthyNumberOrFallback(layout.w, 1, 1, Number.POSITIVE_INFINITY),
      h: clampRoundedTruthyNumberOrFallback(layout.h, 1, 1, Number.POSITIVE_INFINITY)
    };
  }

  function dockDropGuideSlotRect(draggedInstance, clientX, clientY) {
    const slotIndex = resolveDockDropSlotIndex?.(clientX, clientY, draggedInstance);
    if (slotIndex === null || slotIndex === undefined) {
      return null;
    }
    return dockSlotRectRelativeToHost?.(slotIndex) || null;
  }

  function containerDropGuideSlotRect(containerId, draggedInstance, host, pointer = {}) {
    if (!isElement(host) || !host.classList.contains("widget-folder-panel") || !draggedInstance) {
      return null;
    }

    const body = host.querySelector(".widget-folder-panel-body");
    if (!isElement(body)) {
      return null;
    }

    const targetContainerId = normalizeContainerId?.(containerId);
    if (!targetContainerId) {
      return null;
    }

    const containerInstance = instanceById?.(targetContainerId);
    if (!containerInstance || containerInstance.type !== "container") {
      return null;
    }

    const draggedId = normalizeText?.(draggedInstance.id);
    if (!draggedId) {
      return null;
    }

    const containerSpan = resolveContainerSpan?.(containerInstance) || { cols: 1, rows: 1 };
    const cols = Math.max(1, Math.floor(containerSpan.cols || 1));
    const rows = Math.max(1, Math.floor(containerSpan.rows || 1));
    const occupancy = Array.from({ length: rows }, () => Array(cols).fill(false));

    const siblingIds = [];
    const siblingIdSet = new Set();
    const pushSiblingId = (value) => {
      const id = normalizeText?.(value);
      if (!id || id === draggedId || siblingIdSet.has(id)) {
        return;
      }
      siblingIdSet.add(id);
      siblingIds.push(id);
    };

    const panelCards = Array.from(body.querySelectorAll(".widget-folder-item-card[data-widget-id]"));
    for (const card of panelCards) {
      pushSiblingId(card?.dataset?.widgetId);
    }

    if (!siblingIds.length) {
      for (const item of state?.instances || []) {
        if (!item || item.enabled === false || item.type === "container") {
          continue;
        }
        if (normalizeContainerId?.(item.containerId) !== targetContainerId) {
          continue;
        }
        pushSiblingId(item.id);
      }
    }

    const insertIndex = resolveContainerInsertIndexFromPointer?.(
      targetContainerId,
      pointer?.clientX,
      pointer?.clientY,
      {
        excludeWidgetId: draggedId,
        panelElement: body
      }
    );
    const clampedInsertIndex = clamp?.(Math.round(Number(insertIndex) || 0), 0, siblingIds.length) ?? 0;

    const orderedIds = siblingIds.slice();
    orderedIds.splice(clampedInsertIndex, 0, draggedId);

    const orderedWidgets = [];
    for (const widgetId of orderedIds) {
      const widget = instanceById?.(widgetId);
      if (!widget || widget.enabled === false || widget.type === "container") {
        continue;
      }
      if (normalizeText?.(widget.id) !== draggedId && normalizeContainerId?.(widget.containerId) !== targetContainerId) {
        continue;
      }
      orderedWidgets.push(widget);
    }

    const canFit = (row, col, rowSpan, colSpan) => {
      if (row < 0 || col < 0 || row + rowSpan > rows || col + colSpan > cols) {
        return false;
      }
      for (let y = row; y < row + rowSpan; y += 1) {
        for (let x = col; x < col + colSpan; x += 1) {
          if (occupancy[y][x]) {
            return false;
          }
        }
      }
      return true;
    };

    const occupy = (row, col, rowSpan, colSpan) => {
      for (let y = row; y < row + rowSpan; y += 1) {
        for (let x = col; x < col + colSpan; x += 1) {
          occupancy[y][x] = true;
        }
      }
    };

    let targetPlacement = null;

    for (const item of orderedWidgets) {
      const itemId = normalizeText?.(item.id);
      const span = resolveWidgetSpanInContainer?.(item, containerSpan) || { cols: 1, rows: 1 };
      const colSpan = clamp?.(Math.round(span.cols || 1), 1, cols) ?? 1;
      const rowSpan = clamp?.(Math.round(span.rows || 1), 1, rows) ?? 1;

      let placed = null;
      for (let row = 0; row < rows && !placed; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (!canFit(row, col, rowSpan, colSpan)) {
            continue;
          }
          placed = { row, col };
          break;
        }
      }

      if (!placed) {
        continue;
      }

      occupy(placed.row, placed.col, rowSpan, colSpan);

      if (itemId === draggedId) {
        targetPlacement = {
          row: placed.row,
          col: placed.col,
          rowSpan,
          colSpan
        };
        break;
      }
    }

    if (!targetPlacement) {
      return null;
    }

    const hostRect = host.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const bodyStyle = windowObj?.getComputedStyle?.(body);
    const gapX = cssPixelValue?.(bodyStyle?.columnGap, cssPixelValue?.(bodyStyle?.gap, 0) ?? 0) ?? 0;
    const gapY = cssPixelValue?.(bodyStyle?.rowGap, cssPixelValue?.(bodyStyle?.gap, 0) ?? 0) ?? 0;
    const padLeft = cssPixelValue?.(bodyStyle?.paddingLeft, 0) ?? 0;
    const padRight = cssPixelValue?.(bodyStyle?.paddingRight, 0) ?? 0;
    const padTop = cssPixelValue?.(bodyStyle?.paddingTop, 0) ?? 0;
    const padBottom = cssPixelValue?.(bodyStyle?.paddingBottom, 0) ?? 0;

    const usableWidth = Math.max(1, bodyRect.width - padLeft - padRight - gapX * Math.max(0, cols - 1));
    const usableHeight = Math.max(1, bodyRect.height - padTop - padBottom - gapY * Math.max(0, rows - 1));
    const cellW = usableWidth / cols;
    const cellH = usableHeight / rows;
    if (!Number.isFinite(cellW) || !Number.isFinite(cellH) || cellW <= 0 || cellH <= 0) {
      return null;
    }

    const bodyLocalLeft = bodyRect.left - hostRect.left;
    const bodyLocalTop = bodyRect.top - hostRect.top;

    return {
      x: Math.round(bodyLocalLeft + padLeft + targetPlacement.col * (cellW + gapX)),
      y: Math.round(bodyLocalTop + padTop + targetPlacement.row * (cellH + gapY)),
      w: Math.max(1, Math.round(cellW * targetPlacement.colSpan + gapX * Math.max(0, targetPlacement.colSpan - 1))),
      h: Math.max(1, Math.round(cellH * targetPlacement.rowSpan + gapY * Math.max(0, targetPlacement.rowSpan - 1))),
      borderRadius: 10
    };
  }

  function updateWidgetDragGuideAtPointer(
    draggedInstance,
    clientX,
    clientY,
    { boardLayout = null, boardPage = null, showGuide = true } = {}
  ) {
    if (!draggedInstance || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return {
        containerDropTargetId: "",
        dockDropActive: false
      };
    }

    const containerDropTargetId = containerDropTargetAtPoint?.(clientX, clientY, draggedInstance) || "";
    const dockDropActive = !containerDropTargetId && Boolean(isDockDropPoint?.(clientX, clientY));

    setContainerDropTargetActive?.(containerDropTargetId);
    setDockDropTargetActive?.(dockDropActive);

    if (!showGuide) {
      clearWidgetDropGuide();
      return {
        containerDropTargetId,
        dockDropActive
      };
    }

    const freeMode = !isGridLayoutMode?.();

    if (containerDropTargetId) {
      const entry = containerDropUiState?.targets?.get?.(containerDropTargetId);
      const host = entry?.element;
      if (isElement(host)) {
        if (freeMode) {
          applyWidgetDropGuide(host, { mode: "full" });
        } else {
          const rect = containerDropGuideSlotRect(containerDropTargetId, draggedInstance, host, {
            clientX,
            clientY
          });
          if (rect) {
            applyWidgetDropGuide(host, {
              mode: "slot",
              rect,
              borderRadius: rect.borderRadius
            });
          } else {
            applyWidgetDropGuide(host, { mode: "full" });
          }
        }
      } else {
        clearWidgetDropGuide();
      }

      return {
        containerDropTargetId,
        dockDropActive
      };
    }

    if (dockDropActive) {
      const host = elements?.persistentDockBody ?? elements?.persistentDock;
      if (!isElement(host)) {
        clearWidgetDropGuide();
      } else if (freeMode) {
        applyWidgetDropGuide(host, { mode: "full" });
      } else {
        const rect = dockDropGuideSlotRect(draggedInstance, clientX, clientY);
        if (rect) {
          applyWidgetDropGuide(host, {
            mode: "slot",
            rect,
            borderRadius: rect.borderRadius
          });
        } else {
          applyWidgetDropGuide(host, { mode: "full" });
        }
      }

      return {
        containerDropTargetId,
        dockDropActive
      };
    }

    const board = elements?.board;
    if (!isElement(board)) {
      clearWidgetDropGuide();
      return {
        containerDropTargetId,
        dockDropActive
      };
    }

    const resolvedBoardPage = Number.isFinite(boardPage) ? boardPage : draggedInstance.page;

    if (freeMode) {
      const rect = boardPageDropGuideRect(resolvedBoardPage);
      if (rect) {
        applyWidgetDropGuide(board, {
          mode: "full",
          rect,
          borderRadius: 14
        });
      } else {
        applyWidgetDropGuide(board, { mode: "full" });
      }
    } else {
      const fallbackLayout = {
        x: toTruthyNumberOrFallback(draggedInstance.layout?.x, 0),
        y: toTruthyNumberOrFallback(draggedInstance.layout?.y, 0),
        w: toTruthyNumberOrFallback(draggedInstance.layout?.w, 1),
        h: toTruthyNumberOrFallback(draggedInstance.layout?.h, 1)
      };
      const rect = projectedBoardSlotRect(boardLayout || fallbackLayout, resolvedBoardPage);
      if (rect) {
        applyWidgetDropGuide(board, {
          mode: "slot",
          rect,
          borderRadius: 12
        });
      } else {
        clearWidgetDropGuide();
      }
    }

    return {
      containerDropTargetId,
      dockDropActive
    };
  }

  function clearWidgetDragGuideState() {
    setDockDropTargetActive?.(false);
    setContainerDropTargetActive?.("");
    clearWidgetDropGuide();
  }

  return {
    clearWidgetDropGuideHost,
    clearWidgetDropGuide,
    applyWidgetDropGuide,
    boardPageDropGuideRect,
    projectedBoardSlotRect,
    dockDropGuideSlotRect,
    containerDropGuideSlotRect,
    updateWidgetDragGuideAtPointer,
    clearWidgetDragGuideState
  };
}
