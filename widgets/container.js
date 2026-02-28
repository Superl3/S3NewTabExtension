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

  card.classList.toggle("headless", isHeadless);
  card.classList.toggle("surface-transparent", surfaceTransparent);
  card.style.setProperty("--widget-edge-roundness", `${edgeRoundness}px`);
  card.style.setProperty("--widget-opacity", String(surfaceTransparent ? 0 : transparency));
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

function createDragGhost(label) {
  const ghost = document.createElement("div");
  ghost.className = "widget-folder-drag-ghost";
  ghost.textContent = normalizeText(label, "Widget");
  document.body.append(ghost);
  return ghost;
}

function createSettingsButton(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn widget-folder-item-settings";
  button.title = "Widget setting";
  button.innerHTML = '<svg class="icon"><use href="#i-settings"></use></svg>';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.();
  });
  return button;
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
    releaseWidgetFromContainerByDrop
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
    panel.hidden = true;

    const panelHead = document.createElement("header");
    panelHead.className = "widget-folder-panel-head";

    const panelTitleWrap = document.createElement("div");
    panelTitleWrap.className = "widget-folder-panel-title-wrap";

    const panelTitle = document.createElement("h4");
    panelTitle.className = "widget-folder-panel-title";

    const panelMeta = document.createElement("p");
    panelMeta.className = "widget-folder-panel-meta";

    panelTitleWrap.append(panelTitle, panelMeta);
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

    function measureExpandedSize(cfg) {
      const metrics = typeof getGridMetrics === "function" ? getGridMetrics() : null;
      if (metrics && Number.isFinite(metrics.cellW) && Number.isFinite(metrics.cellH)) {
        return {
          width: metrics.cellW * cfg.expandedCols + metrics.gapX * (cfg.expandedCols - 1),
          height: metrics.cellH * cfg.expandedRows + metrics.gapY * (cfg.expandedRows - 1)
        };
      }
      return {
        width: cfg.expandedCols * 220,
        height: cfg.expandedRows * 180
      };
    }

    function positionPanel(folder, cfg) {
      const card = findFolderCard(folder.id);
      if (!(card instanceof HTMLElement)) {
        return;
      }

      const anchor = card.getBoundingClientRect();
      const hostRect = boardHost.getBoundingClientRect();
      const panelSize = measureExpandedSize(cfg);

      const margin = 8;
      const maxWidth = Math.max(280, hostRect.width - margin * 2);
      const maxHeight = Math.max(220, hostRect.height - margin * 2);
      const width = clamp(Math.round(panelSize.width), 280, maxWidth);
      const height = clamp(Math.round(panelSize.height), 220, maxHeight);

      const left = clamp(
        Math.round(anchor.left - hostRect.left),
        margin,
        Math.max(margin, hostRect.width - width - margin)
      );
      const top = clamp(
        Math.round(anchor.top - hostRect.top),
        margin,
        Math.max(margin, hostRect.height - height - margin)
      );

      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
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

        const ghost = createDragGhost(normalizeText(child.title, child.type));
        card.classList.add("widget-folder-item-dragging");

        const updateGhost = (clientX, clientY) => {
          ghost.style.left = `${Math.round(clientX + 12)}px`;
          ghost.style.top = `${Math.round(clientY + 12)}px`;
          const inside = pointInsideRect(clientX, clientY, panel.getBoundingClientRect());
          panel.classList.toggle("is-drag-out-active", !inside);
        };

        updateGhost(event.clientX, event.clientY);

        const move = (moveEvent) => {
          updateGhost(moveEvent.clientX, moveEvent.clientY);
        };

        const finish = (upEvent) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", finish);

          const dropX = Number.isFinite(upEvent?.clientX) ? upEvent.clientX : event.clientX;
          const dropY = Number.isFinite(upEvent?.clientY) ? upEvent.clientY : event.clientY;
          const inside = pointInsideRect(dropX, dropY, panel.getBoundingClientRect());

          panel.classList.remove("is-drag-out-active");
          card.classList.remove("widget-folder-item-dragging");
          ghost.remove();

          if (!inside) {
            releaseWidgetFromContainerByDrop(child.id, {
              sourceContainerId: folder.id,
              clientX: dropX,
              clientY: dropY
            });
          }
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
      };

      card.addEventListener("pointerdown", onPointerDown, true);
      return () => {
        card.removeEventListener("pointerdown", onPointerDown, true);
      };
    }

    function createEmbeddedChildCard(child, cfg) {
      const def = typeof getWidgetDefinition === "function" ? getWidgetDefinition(child.type) : null;
      if (!def || typeof def.create !== "function") {
        return null;
      }

      const card = document.createElement("article");
      card.className = "widget-card widget-folder-item-card";
      card.dataset.widgetId = child.id;
      card.dataset.widgetType = child.type;

      const panelSize = measureExpandedSize(cfg);
      const maxWidth = Math.max(220, Math.round(panelSize.width) - 44);
      const maxHeight = Math.max(170, Math.round(panelSize.height) - 126);
      const childWidth = clamp(Math.round(Number(child?.layout?.w) || 320), 190, maxWidth);
      const childHeight = clamp(Math.round(Number(child?.layout?.h) || 220), 140, maxHeight);
      card.style.width = `${childWidth}px`;
      card.style.height = `${childHeight}px`;
      applyEmbeddedCardVisual(card, child);

      const shell = document.createElement("div");
      shell.className = "widget-shell";

      const head = document.createElement("header");
      head.className = "widget-head";

      const title = document.createElement("div");
      title.className = "widget-title";
      title.textContent = normalizeText(child.title, def.title || "Widget");

      const headActions = document.createElement("div");
      headActions.className = "widget-head-actions";
      const editable = typeof isEditMode === "function" ? Boolean(isEditMode()) : false;

      if (editable && typeof openWidgetSettingsById === "function") {
        headActions.append(createSettingsButton(() => openWidgetSettingsById(child.id)));
      }

      head.append(title, headActions);

      const body = document.createElement("section");
      body.className = "widget-body";

      const host = document.createElement("div");
      host.className = "widget-content-host";

      const slot = document.createElement("div");
      slot.className = "widget-content-slot";
      host.append(slot);
      body.append(host);

      shell.append(head, body);
      card.append(shell);

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
      panelMeta.textContent = `${items.length} widget${items.length === 1 ? "" : "s"}`;

      destroyEmbeddedChildren();

      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "widget-folder-empty";
        empty.textContent = "Drag a widget into this opened folder to add it.";
        panelBody.append(empty);
        return;
      }

      for (const child of items) {
        const embedded = createEmbeddedChildCard(child, cfg);
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
