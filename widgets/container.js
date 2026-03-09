function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeCount(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), min, max);
  }
  return clamp(Math.round(num), min, max);
}

function normalizeTitleAlign(value, fallback = "center") {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }
  return fallback;
}

function isUrlIcon(value) {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("chrome-extension://")
  );
}

function normalizeFolderConfig(config) {
  const raw = config && typeof config === "object" ? config : {};
  return {
    expanded: raw.expanded === true,
    expandedCols: normalizeCount(raw.expandedCols, 4, 1, 16),
    expandedRows: normalizeCount(raw.expandedRows, 3, 1, 16),
    icon: normalizeText(raw.icon),
    useGlobalIconSize: raw.useGlobalIconSize !== false,
    iconSizePercent: normalizeCount(raw.iconSizePercent, 100, 40, 220)
  };
}

function resolveWidgetPadding(widget) {
  const fallback = clamp(Math.round(Number(widget?.contentPadding) || 10), 0, 48);
  const top = clamp(Math.round(Number(widget?.contentPaddingTop) || fallback), 0, 48);
  const right = clamp(Math.round(Number(widget?.contentPaddingRight) || fallback), 0, 48);
  const bottom = clamp(Math.round(Number(widget?.contentPaddingBottom) || fallback), 0, 48);
  const left = clamp(Math.round(Number(widget?.contentPaddingLeft) || fallback), 0, 48);
  return { top, right, bottom, left };
}

function applyEmbeddedCardVisual(card, widget) {
  const edgeRoundness = clamp(Math.round(Number(widget?.edgeRoundness) || 12), 0, 40);
  const transparency = clamp(Number(widget?.transparency) || 0.94, 0, 1);
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

function pointInsideRect(x, y, rect) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !rect) {
    return false;
  }
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
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
      const panelZ = Number.isFinite(cardZ) ? Math.max(2, Math.round(cardZ) + 1) : 2;

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
      if (typeof releaseWidgetFromContainerByDrop !== "function") {
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

        const updateGhost = (clientX, clientY) => {
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
        };

        updateGhost(event.clientX, event.clientY);

        const finish = (endEvent, { cancelled = false } = {}) => {
          const dropX = Number.isFinite(endEvent?.clientX) ? endEvent.clientX : event.clientX;
          const dropY = Number.isFinite(endEvent?.clientY) ? endEvent.clientY : event.clientY;
          const inside = pointInsideRect(dropX, dropY, panel.getBoundingClientRect());

          panel.classList.remove("is-drag-out-active");
          card.classList.remove("widget-folder-item-dragging");
          if (previewSession) {
            previewSession.dispose();
          } else {
            ghost.remove();
          }

          if (!cancelled && !inside) {
            releaseWidgetFromContainerByDrop(child.id, {
              sourceContainerId: folder.id,
              clientX: dropX,
              clientY: dropY
            });
          }
        };

        if (typeof startPointerDragSession === "function") {
          startPointerDragSession({
            sourceEvent: event,
            captureTarget: card,
            onMove: (moveEvent) => {
              updateGhost(moveEvent.clientX, moveEvent.clientY);
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
      destroy() {
        document.removeEventListener("click", handleDocumentClick, true);
        destroyEmbeddedChildren();
        unregisterDropTarget();
        panel.remove();
      }
    };
  }
};
