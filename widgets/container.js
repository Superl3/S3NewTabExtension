import { DROP_SILHOUETTE_Z_INDEX, resolveFolderPanelZIndex } from "../core/drag-layering.js";
import { pointInsideRect } from "../core/utils/geometry.js";
import { clamp, clampRoundedTruthyNumberOrFallback, clampTruthyNumberOrFallback, normalizeIntegerInRange } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import { normalizeTitleAlign } from "../core/widget-common-style.js";
import { isUrlIcon } from "./shared/linkUrls.js";

function normalizeFolderConfig(config) {
  const raw = config && typeof config === "object" ? config : {};
  return {
    expanded: raw.expanded === true,
    expandedCols: normalizeIntegerInRange(raw.expandedCols, 4, 1, 16),
    expandedRows: normalizeIntegerInRange(raw.expandedRows, 3, 1, 16),
    icon: normalizeText(raw.icon),
    useGlobalIconSize: raw.useGlobalIconSize !== false,
    iconSizePercent: normalizeIntegerInRange(raw.iconSizePercent, 100, 40, 220)
  };
}

function resolveWidgetPadding(widget) {
  const fallback = clampRoundedTruthyNumberOrFallback(widget?.contentPadding, 10, 0, 48);
  const top = clampRoundedTruthyNumberOrFallback(widget?.contentPaddingTop, fallback, 0, 48);
  const right = clampRoundedTruthyNumberOrFallback(widget?.contentPaddingRight, fallback, 0, 48);
  const bottom = clampRoundedTruthyNumberOrFallback(widget?.contentPaddingBottom, fallback, 0, 48);
  const left = clampRoundedTruthyNumberOrFallback(widget?.contentPaddingLeft, fallback, 0, 48);
  return { top, right, bottom, left };
}

function applyEmbeddedCardVisual(card, widget) {
  const edgeRoundness = clampRoundedTruthyNumberOrFallback(widget?.edgeRoundness, 12, 0, 40);
  const transparency = clampTruthyNumberOrFallback(widget?.transparency, 0.94, 0, 1);
  const surfaceTransparent = widget?.surfaceMode === "transparent";
  const isHeadless = widget?.viewMode === "headless";
  const padding = resolveWidgetPadding(widget);
  const titleAlign = normalizeTitleAlign(widget?.titleAlign, "center");

  card.classList.toggle("headless", isHeadless);
  card.classList.toggle("surface-transparent", surfaceTransparent);
  card.dataset.titleAlign = titleAlign;
  card.style.setProperty("--widget-edge-roundness", `${edgeRoundness}px`);
  card.style.setProperty("--widget-opacity", String(surfaceTransparent ? 0 : transparency));
  card.style.setProperty("--widget-title-align", titleAlign);
  card.style.setProperty(
    "--widget-content-padding",
    `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
  );
  card.style.setProperty("--widget-pad-top", `${padding.top}px`);
  card.style.setProperty("--widget-pad-right", `${padding.right}px`);
  card.style.setProperty("--widget-pad-bottom", `${padding.bottom}px`);
  card.style.setProperty("--widget-pad-left", `${padding.left}px`);
  card.dataset.contentFill = widget?.contentFillParent ? "true" : "false";
  card.dataset.widgetThemeMode =
    widget?.widgetThemeMode === "light" || widget?.widgetThemeMode === "dark" ? widget.widgetThemeMode : "inherit";

  if (widget?.useCustomColors) {
    card.style.setProperty("--widget-custom-text", normalizeText(widget.customTextColor, "#1F2226"));
    card.style.setProperty("--widget-custom-accent", normalizeText(widget.customAccentColor, "#1F4F9F"));
    card.style.setProperty("--widget-custom-surface", normalizeText(widget.customSurfaceColor, "#FFFAF2"));
  } else {
    card.style.removeProperty("--widget-custom-text");
    card.style.removeProperty("--widget-custom-accent");
    card.style.removeProperty("--widget-custom-surface");
  }
}

export const containerWidget = {
  type: "container",
  title: "Widget Folder",
  defaultConfig: {
    expanded: false,
    expandedCols: 4,
    expandedRows: 3,
    icon: "",
    useGlobalIconSize: true,
    iconSizePercent: 100
  },
  defaultGridSize: {
    w: 1,
    h: 1
  },
  defaultLayout: {
    x: 240,
    y: 140,
    w: 120,
    h: 120
  },
  settingsSchema: [
    {
      key: "icon",
      label: "Folder icon (emoji or image URL)",
      type: "text",
      placeholder: "📁 or https://example.com/icon.png"
    },
    {
      key: "iconEditor",
      label: "Icon editor",
      type: "shortcut-icon-editor",
      helpText: "Draw or import an image and apply it as folder icon."
    },
    {
      key: "useGlobalIconSize",
      label: "Use global icon size",
      type: "checkbox"
    },
    {
      key: "iconSizePercent",
      label: "Icon size (%)",
      type: "number",
      min: 40,
      max: 220,
      step: 5
    },
    {
      key: "expandedCols",
      label: "Expanded columns",
      type: "number",
      min: 1,
      max: 16,
      step: 1
    },
    {
      key: "expandedRows",
      label: "Expanded rows",
      type: "number",
      min: 1,
      max: 16,
      step: 1
    }
  ],
  create({
    container,
    getConfig,
    getUi,
    getWidget,
    getAllWidgets,
    getWidgetDefinition,
    patchWidgetConfigById,
    setWidgetContainer,
    isEditMode,
    openWidgetSettingsById,
    getGridMetrics,
    getWidgetRuntimeCard,
    registerContainerDropTarget,
    unregisterContainerDropTarget,
    releaseWidgetFromContainerByDrop,
    reorderWidgetInContainerByIndex,
    resolveContainerInsertIndexFromPointer,
    tryContainerWidgetByDrop,
    tryDockWidgetByDrop,
    projectWidgetBoardDropLayout,
    createWidgetDropSilhouette,
    updateCrossSurfaceDropIndicators,
    updateWidgetDragGuideAtPointer,
    clearWidgetDragGuideState,
    renderBoardViewport,
    setActiveLauncherPage,
    currentLauncherActivePage,
    currentLauncherPageCount,
    createDragPreviewSession,
    createWidgetDragPreview,
    positionWidgetDragPreview,
    startPointerDragSession
  }) {
    const root = document.createElement("section");
    root.className = "widget-folder";

    const tile = document.createElement("div");
    tile.className = "shortcut-tile widget-folder-tile";

    const icon = document.createElement("span");
    icon.className = "shortcut-icon widget-folder-icon";

    const iconVisual = document.createElement("span");
    iconVisual.className = "widget-folder-icon-visual";

    const countBadge = document.createElement("span");
    countBadge.className = "widget-folder-count";
    icon.append(iconVisual, countBadge);

    const label = document.createElement("span");
    label.className = "shortcut-label widget-folder-label";

    tile.append(icon, label);
    root.append(tile);
    container.append(root);

    const panel = document.createElement("section");
    panel.className = "widget-folder-panel";

    const panelHead = document.createElement("header");
    panelHead.className = "widget-folder-panel-head";

    const panelTitleWrap = document.createElement("div");
    panelTitleWrap.className = "widget-folder-panel-title-wrap";

    const panelTitle = document.createElement("h4");
    panelTitle.className = "widget-folder-panel-title";

    panelTitleWrap.append(panelTitle);
    panelHead.append(panelTitleWrap);

    const panelBody = document.createElement("div");
    panelBody.className = "widget-folder-panel-body";

    panel.append(panelHead, panelBody);
    const boardHost = container.closest(".board") || document.body;
    boardHost.append(panel);

    const childControllers = new Map();
    const dragCleanupByWidgetId = new Map();
    let registeredDropTargetId = "";

    function getCurrentFolder() {
      return typeof getWidget === "function" ? getWidget() : null;
    }

    function listAllWidgets() {
      const list = typeof getAllWidgets === "function" ? getAllWidgets() : [];
      return Array.isArray(list) ? list : [];
    }

    function findFolderCard(folderId) {
      return (
        (typeof getWidgetRuntimeCard === "function" ? getWidgetRuntimeCard(folderId) : null) ||
        document.querySelector(`.widget-card[data-widget-id="${folderId}"]`)
      );
    }

    function listContainedWidgets(folderId) {
      return listAllWidgets().filter((item) => {
        if (!item || item.enabled === false) {
          return false;
        }
        if (item.type === "container") {
          return false;
        }
        return normalizeText(item.containerId) === folderId;
      });
    }

    function unregisterDropTarget() {
      if (!registeredDropTargetId) {
        return;
      }
      unregisterContainerDropTarget?.(registeredDropTargetId);
      registeredDropTargetId = "";
      panel.classList.remove("is-drop-target");
      tile.classList.remove("is-drop-target");
    }

    function setPanelExpanded(folderId, expanded) {
      panel.classList.toggle("open", expanded);

      if (!folderId) {
        unregisterDropTarget();
        return;
      }

      unregisterDropTarget();
      if (expanded) {
        registerContainerDropTarget?.(folderId, panel, { acceptCollapsed: false });
      } else {
        registerContainerDropTarget?.(folderId, tile, { acceptCollapsed: true });
      }
      registeredDropTargetId = folderId;
    }

    function resolveExpandedSpan(folder, cfg, metrics) {
      const fallbackCols = clamp(Math.round(cfg.expandedCols), 1, 16);
      const fallbackRows = clamp(Math.round(cfg.expandedRows), 1, 16);

      if (!metrics || !folder?.gridLayout) {
        return { cols: fallbackCols, rows: fallbackRows };
      }

      const col = clamp(Math.floor(Number(folder.gridLayout.col) || 0), 0, Math.max(0, metrics.cols - 1));
      const row = clamp(Math.floor(Number(folder.gridLayout.row) || 0), 0, Math.max(0, metrics.rows - 1));
      const maxCols = Math.max(1, metrics.cols - col);
      const maxRows = Math.max(1, metrics.rows - row);

      return {
        cols: clamp(fallbackCols, 1, maxCols),
        rows: clamp(fallbackRows, 1, maxRows)
      };
    }

    function measureExpandedSize(cfg, folder = null) {
      const metrics = typeof getGridMetrics === "function" ? getGridMetrics() : null;
      const span = resolveExpandedSpan(folder, cfg, metrics);
      if (metrics && Number.isFinite(metrics.cellW) && Number.isFinite(metrics.cellH)) {
        return {
          width: metrics.cellW * span.cols + metrics.gapX * (span.cols - 1),
          height: metrics.cellH * span.rows + metrics.gapY * (span.rows - 1)
        };
      }
      return {
        width: span.cols * 220,
        height: span.rows * 180
      };
    }

    function resolveChildSpan(child, panelSpan) {
      const cols = clamp(Math.round(Number(child?.gridLayout?.colSpan) || 1), 1, Math.max(1, panelSpan.cols));
      const rows = clamp(Math.round(Number(child?.gridLayout?.rowSpan) || 1), 1, Math.max(1, panelSpan.rows));
      return { cols, rows };
    }

    function positionPanel(folder, cfg) {
      const card = findFolderCard(folder.id);
      if (!(card instanceof HTMLElement)) {
        return;
      }

      const anchor = card.getBoundingClientRect();
      const hostRect = boardHost.getBoundingClientRect();
      const panelSize = measureExpandedSize(cfg, folder);
      const width = Math.max(1, Math.round(panelSize.width));
      const height = Math.max(1, Math.round(panelSize.height));

      const left = Math.round(anchor.left - hostRect.left);
      const top = Math.round(anchor.top - hostRect.top);
      const cardZ = Number(card.style.zIndex || window.getComputedStyle(card).zIndex);
      const panelZ = resolveFolderPanelZIndex(cardZ);

      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.zIndex = String(panelZ);
    }

    function destroyEmbeddedChildren() {
      for (const entry of childControllers.values()) {
        entry?.destroy?.();
      }
      childControllers.clear();

      for (const cleanup of dragCleanupByWidgetId.values()) {
        cleanup?.();
      }
      dragCleanupByWidgetId.clear();

      panelBody.replaceChildren();
    }

    function bindDragOut(card, child) {
      if (
        typeof releaseWidgetFromContainerByDrop !== "function" ||
        typeof reorderWidgetInContainerByIndex !== "function"
      ) {
        return () => {};
      }

      const onPointerDown = (event) => {
        if (event.button !== 0) {
          return;
        }
        if (event.target.closest("button, input, textarea, select, [contenteditable='true']")) {
          return;
        }

        const folder = getCurrentFolder();
        if (!folder?.id) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const previewSession =
          typeof createDragPreviewSession === "function"
            ? createDragPreviewSession(child, {
              sourceCard: card,
              pointerEvent: event,
              pointerX: event.clientX,
              pointerY: event.clientY
            })
            : null;

        const ghost =
          previewSession?.preview ||
          (typeof createWidgetDragPreview === "function"
            ? createWidgetDragPreview(child, {
              sourceCard: card,
              pointerEvent: event,
              pointerX: event.clientX,
              pointerY: event.clientY
            })
            : null);
        if (!(ghost instanceof HTMLElement)) {
          return;
        }

        card.classList.add("widget-folder-item-dragging");
        card.classList.add("widget-drag-active");
        card.classList.add("widget-drag-origin-hidden");
        const sourceCard =
          typeof getWidgetRuntimeCard === "function"
            ? getWidgetRuntimeCard(child.id)
            : document.querySelector(`.widget-card[data-widget-id="${child.id}"]`);
        sourceCard?.classList.add("widget-drag-active");
        sourceCard?.classList.add("widget-drag-origin-hidden");

        const sourceForSilhouette = sourceCard instanceof HTMLElement ? sourceCard : card;
        const dropSilhouette =
          typeof createWidgetDropSilhouette === "function"
            ? createWidgetDropSilhouette(sourceForSilhouette)
            : (() => {
              if (typeof document !== "undefined" && typeof window !== "undefined") {
                const board = document.querySelector(".board");
                if (!(board instanceof HTMLElement)) {
                  return null;
                }
                const silhouette = document.createElement("div");
                silhouette.className = "widget-drop-silhouette";
                silhouette.style.position = "fixed";
                silhouette.style.zIndex = String(DROP_SILHOUETTE_Z_INDEX);
                const source = sourceForSilhouette;
                const borderRadius = normalizeText(window.getComputedStyle(source).borderRadius);
                if (borderRadius) {
                  silhouette.style.borderRadius = borderRadius;
                }
                document.body.append(silhouette);
                return silhouette;
              }

              return null;
            })();
        let lastPointerX = event.clientX;
        let lastPointerY = event.clientY;
        let dragReleasePage =
          typeof currentLauncherActivePage === "function" ? currentLauncherActivePage() : Number(child.page) || 0;
        const pageSwitchThreshold = 42;
        const pageSwitchHoldMs = 280;
        const pageSwitchCooldownMs = 190;
        let lastPageSwitchAt = 0;
        let pendingPageSwitchDirection = 0;
        let pendingPageSwitchSince = 0;
        let pendingPageSwitchTimer = 0;
        let dragSessionActive = true;

        const boardElement = document.querySelector(".board");
        const workspaceElement = document.querySelector(".workspace");
        const edgeDirectionFromPointer = (clientX) => {
          if (!Number.isFinite(clientX)) {
            return 0;
          }

          const viewportHost = workspaceElement instanceof HTMLElement ? workspaceElement : boardElement;
          if (!(viewportHost instanceof HTMLElement)) {
            return 0;
          }

          const rect = viewportHost.getBoundingClientRect();
          if (rect.width < pageSwitchThreshold * 2) {
            return 0;
          }
          if (clientX <= rect.left + pageSwitchThreshold) {
            return -1;
          }
          if (clientX >= rect.right - pageSwitchThreshold) {
            return 1;
          }
          return 0;
        };

        const resetPendingPageSwitch = () => {
          pendingPageSwitchDirection = 0;
          pendingPageSwitchSince = 0;
          if (pendingPageSwitchTimer) {
            window.clearTimeout(pendingPageSwitchTimer);
            pendingPageSwitchTimer = 0;
          }
        };

        const commitPageSwitch = (direction) => {
          if (!direction) {
            return false;
          }

          const now = performance.now();
          if (now - lastPageSwitchAt < pageSwitchCooldownMs) {
            return false;
          }
          if (typeof currentLauncherPageCount !== "function") {
            return false;
          }

          const pageCount = currentLauncherPageCount();
          const nextPage = dragReleasePage + direction;
          if (nextPage < 0 || nextPage >= pageCount) {
            return false;
          }

          dragReleasePage = nextPage;
          lastPageSwitchAt = now;
          if (typeof setActiveLauncherPage === "function") {
            setActiveLauncherPage(nextPage, { shouldSave: false, animate: true });
          } else if (typeof renderBoardViewport === "function") {
            renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
          }
          return true;
        };

        const schedulePageSwitch = () => {
          const direction = edgeDirectionFromPointer(lastPointerX);
          if (!direction) {
            resetPendingPageSwitch();
            return false;
          }

          if (direction === pendingPageSwitchDirection && pendingPageSwitchTimer) {
            return false;
          }

          resetPendingPageSwitch();
          pendingPageSwitchDirection = direction;
          pendingPageSwitchSince = performance.now();
          pendingPageSwitchTimer = window.setTimeout(() => {
            pendingPageSwitchTimer = 0;
            const currentDirection = edgeDirectionFromPointer(lastPointerX);
            if (currentDirection !== direction) {
              resetPendingPageSwitch();
              return;
            }

            const switched = commitPageSwitch(direction);
            if (switched) {
              schedulePageSwitch();
              return;
            }

            resetPendingPageSwitch();
          }, pageSwitchHoldMs);

          return false;
        };

        const updateGhost = (clientX, clientY) => {
          if (!dragSessionActive) {
            return;
          }
          lastPointerX = clientX;
          lastPointerY = clientY;
          if (previewSession) {
            previewSession.update(clientX, clientY);
          } else if (typeof positionWidgetDragPreview === "function") {
            positionWidgetDragPreview(ghost, clientX, clientY);
          } else {
            ghost.style.left = `${Math.round(clientX + 12)}px`;
            ghost.style.top = `${Math.round(clientY + 12)}px`;
          }
          const inside = pointInsideRect(clientX, clientY, panel.getBoundingClientRect());
          panel.classList.toggle("is-drag-out-active", !inside);

          if (!inside) {
            schedulePageSwitch();
          }

          const projection =
            typeof projectWidgetBoardDropLayout === "function"
              ? projectWidgetBoardDropLayout(child, {
                clientX,
                clientY,
                page: dragReleasePage
              })
              : null;

          if (typeof updateCrossSurfaceDropIndicators === "function") {
            updateCrossSurfaceDropIndicators(child, clientX, clientY, {
              silhouette: dropSilhouette,
              boardProjection: projection
            });
          }
        };

        let queuedMove = null;
        let moveRafId = 0;

        const flushQueuedMove = () => {
          if (!dragSessionActive) {
            queuedMove = null;
            return;
          }
          if (!queuedMove) {
            return;
          }
          const payload = queuedMove;
          queuedMove = null;
          updateGhost(payload.clientX, payload.clientY);
        };

        const scheduleGhostMove = (clientX, clientY) => {
          if (!dragSessionActive) {
            return;
          }
          queuedMove = { clientX, clientY };
          if (moveRafId) {
            return;
          }
          moveRafId = requestAnimationFrame(() => {
            moveRafId = 0;
            flushQueuedMove();
          });
        };

        if (typeof clearWidgetDragGuideState === "function") {
          clearWidgetDragGuideState();
        }
        updateGhost(event.clientX, event.clientY);

        const finish = (endEvent, { cancelled = false } = {}) => {
          if (!dragSessionActive) {
            return;
          }
          dragSessionActive = false;
          resetPendingPageSwitch();
          if (moveRafId) {
            cancelAnimationFrame(moveRafId);
            moveRafId = 0;
          }
          const queued = queuedMove;
          queuedMove = null;
          if (Number.isFinite(queued?.clientX) && Number.isFinite(queued?.clientY)) {
            lastPointerX = queued.clientX;
            lastPointerY = queued.clientY;
          }
          const dropX = Number.isFinite(endEvent?.clientX) ? endEvent.clientX : lastPointerX;
          const dropY = Number.isFinite(endEvent?.clientY) ? endEvent.clientY : lastPointerY;
          const inside = pointInsideRect(dropX, dropY, panel.getBoundingClientRect());

          panel.classList.remove("is-drag-out-active");
          card.classList.remove("widget-folder-item-dragging");
          card.classList.remove("widget-drag-active");
          card.classList.remove("widget-drag-origin-hidden");
          sourceCard?.classList.remove("widget-drag-active");
          sourceCard?.classList.remove("widget-drag-origin-hidden");

          if (typeof updateCrossSurfaceDropIndicators === "function") {
            updateCrossSurfaceDropIndicators(child, Number.NaN, Number.NaN, {
              silhouette: dropSilhouette,
              boardProjection: null,
              suppressSurfaceTargets: true
            });
          }

          if (typeof clearWidgetDragGuideState === "function") {
            clearWidgetDragGuideState();
          }

          dropSilhouette?.classList.remove("is-visible");
          dropSilhouette?.remove();
          if (previewSession) {
            previewSession.dispose();
          } else {
            ghost.remove();
          }

          if (cancelled) {
            return;
          }

          if (inside) {
            const insertIndex =
              typeof resolveContainerInsertIndexFromPointer === "function"
                ? resolveContainerInsertIndexFromPointer(folder.id, dropX, dropY, {
                  excludeWidgetId: child.id,
                  panelElement: panelBody
                })
                : 0;
            reorderWidgetInContainerByIndex(child.id, folder.id, insertIndex);
            return;
          }

          const dropEvent = {
            clientX: dropX,
            clientY: dropY
          };

          if (typeof tryContainerWidgetByDrop === "function" && tryContainerWidgetByDrop(child, dropEvent, { record: true })) {
            return;
          }

          releaseWidgetFromContainerByDrop(child.id, {
            sourceContainerId: folder.id,
            clientX: dropX,
            clientY: dropY,
            page: dragReleasePage
          });
        };

        if (typeof startPointerDragSession === "function") {
          startPointerDragSession({
            sourceEvent: event,
            captureTarget: card,
            onMove: (moveEvent) => {
              scheduleGhostMove(moveEvent.clientX, moveEvent.clientY);
            },
            onEnd: (endEvent, details = {}) => {
              finish(endEvent, details);
            }
          });
          return;
        }

        const move = (moveEvent) => {
          updateGhost(moveEvent.clientX, moveEvent.clientY);
        };
        const legacyFinish = (endEvent) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", legacyFinish);
          window.removeEventListener("pointercancel", legacyFinish);
          finish(endEvent, { cancelled: endEvent?.type === "pointercancel" });
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", legacyFinish);
        window.addEventListener("pointercancel", legacyFinish);
      };

      card.addEventListener("pointerdown", onPointerDown, true);
      return () => {
        card.removeEventListener("pointerdown", onPointerDown, true);
      };
    }

    function createEmbeddedChildCard(child, panelSpan) {
      const def = typeof getWidgetDefinition === "function" ? getWidgetDefinition(child.type) : null;
      if (!def || typeof def.create !== "function") {
        return null;
      }

      const card = document.createElement("article");
      card.className = "widget-card widget-folder-item-card";
      card.dataset.widgetId = child.id;
      card.dataset.widgetType = child.type;

      const childSpan = resolveChildSpan(child, panelSpan);
      card.style.gridColumn = `span ${childSpan.cols}`;
      card.style.gridRow = `span ${childSpan.rows}`;
      card.style.width = "auto";
      card.style.height = "auto";
      applyEmbeddedCardVisual(card, child);

      const shell = document.createElement("div");
      shell.className = "widget-shell";

      const body = document.createElement("section");
      body.className = "widget-body";

      const host = document.createElement("div");
      host.className = "widget-content-host";

      const slot = document.createElement("div");
      slot.className = "widget-content-slot";
      host.append(slot);
      body.append(host);

      const floatingTitle = document.createElement("div");
      floatingTitle.className = "widget-folder-item-floating-title";
      floatingTitle.textContent = normalizeText(child.title, def.title || "Widget");
      if (child.type === "shortcut") {
        floatingTitle.classList.add("is-hidden");
      }

      shell.append(body);
      card.append(shell, floatingTitle);

      const controller = def.create({
        container: slot,
        getConfig: () => child.config,
        getUi,
        getWidget: () => child,
        getAllWidgets,
        getWidgetDefinition,
        patchConfig: (patch, options = {}) => {
          if (typeof patchWidgetConfigById === "function") {
            patchWidgetConfigById(child.id, patch, options);
          }
        },
        patchWidgetConfigById,
        setWidgetContainer,
        getGridMetrics,
        getWidgetRuntimeCard,
        registerContainerDropTarget,
        unregisterContainerDropTarget,
        releaseWidgetFromContainerByDrop,
        reorderWidgetInContainerByIndex,
        resolveContainerInsertIndexFromPointer,
        tryContainerWidgetByDrop,
        tryDockWidgetByDrop,
        projectWidgetBoardDropLayout,
        updateCrossSurfaceDropIndicators,
        renderBoardViewport,
        setActiveLauncherPage,
        currentLauncherActivePage,
        currentLauncherPageCount,
        startPointerDragSession,
        isEditMode,
        openSettings: () => {
          openWidgetSettingsById?.(child.id);
        },
        openWidgetSettingsById
      });

      const dragCleanup = bindDragOut(card, child);

      return {
        card,
        dragCleanup,
        destroy() {
          controller?.destroy?.();
        },
        refresh() {
          applyEmbeddedCardVisual(card, child);
          controller?.refresh?.();
        }
      };
    }

    function renderPanel(folder, cfg, items) {
      positionPanel(folder, cfg);
      panelTitle.textContent = normalizeText(folder?.title, "Widget Folder");
      panelTitle.style.textAlign = normalizeTitleAlign(folder?.titleAlign, "center");
      const metrics = typeof getGridMetrics === "function" ? getGridMetrics() : null;
      const panelSpan = resolveExpandedSpan(folder, cfg, metrics);
      panelBody.style.setProperty("--folder-grid-cols", String(panelSpan.cols));
      panelBody.style.setProperty("--folder-grid-rows", String(panelSpan.rows));

      destroyEmbeddedChildren();

      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "widget-folder-empty";
        empty.textContent = "Folder is empty.";
        panelBody.append(empty);
        return;
      }

      for (const child of items) {
        const embedded = createEmbeddedChildCard(child, panelSpan);
        if (!embedded) {
          continue;
        }
        childControllers.set(child.id, embedded);
        dragCleanupByWidgetId.set(child.id, embedded.dragCleanup);
        panelBody.append(embedded.card);
      }
    }

    function handleDocumentClick(event) {
      const folder = getCurrentFolder();
      if (!folder?.id) {
        return;
      }

      const cfg = normalizeFolderConfig(getConfig());
      if (!cfg.expanded) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (panel.contains(target)) {
        return;
      }

      const card = findFolderCard(folder.id);
      if (card instanceof HTMLElement && card.contains(target)) {
        return;
      }

      if (document.querySelector(".widget-card.widget-drag-active")) {
        return;
      }

      patchWidgetConfigById?.(folder.id, { expanded: false }, { record: false });
    }

    function render() {
      const folder = getCurrentFolder();
      if (!folder) {
        return;
      }

      const cfg = normalizeFolderConfig(getConfig());
      const items = listContainedWidgets(folder.id);
      const ui = typeof getUi === "function" ? getUi() : null;
      const globalSize = Number(ui?.shortcuts?.iconSizePercent);
      const localSize = Number(cfg.iconSizePercent);
      const fallbackSize = Number.isFinite(globalSize) ? globalSize : 100;
      const effectiveSize = cfg.useGlobalIconSize ? fallbackSize : Number.isFinite(localSize) ? localSize : fallbackSize;
      const clampedSize = clamp(effectiveSize, 40, 220);

      label.textContent = normalizeText(folder.title, "Widget Folder");
      countBadge.textContent = String(items.length);
      countBadge.hidden = items.length <= 0;
      tile.style.setProperty("--shortcut-scale", `${clampedSize / 100}`);

      const iconValue = normalizeText(cfg.icon);
      iconVisual.replaceChildren();
      if (iconValue) {
        if (isUrlIcon(iconValue)) {
          const img = document.createElement("img");
          img.src = iconValue;
          img.alt = "";
          iconVisual.append(img);
        } else {
          iconVisual.textContent = iconValue;
        }
      } else {
        iconVisual.innerHTML = '<svg class="icon"><use href="#i-folder-mini"></use></svg>';
      }

      root.classList.toggle("is-expanded", cfg.expanded);

      if (!cfg.expanded) {
        setPanelExpanded(folder.id, false);
        destroyEmbeddedChildren();
        return;
      }

      setPanelExpanded(folder.id, true);
      renderPanel(folder, cfg, items);
      for (const entry of childControllers.values()) {
        entry?.refresh?.();
      }
    }

    document.addEventListener("click", handleDocumentClick, true);
    render();

    return {
      refresh: render,
      refreshPosition() {
        const folder = getCurrentFolder();
        if (!folder) {
          return;
        }
        const cfg = normalizeFolderConfig(getConfig());
        if (cfg.expanded) {
          positionPanel(folder, cfg);
        }
      },
      destroy() {
        document.removeEventListener("click", handleDocumentClick, true);
        destroyEmbeddedChildren();
        unregisterDropTarget();
        panel.remove();
      }
    };
  }
};
