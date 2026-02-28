function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeSize(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), min, max);
  }
  return clamp(Math.round(num), min, max);
}

function normalizeExpandedConfig(config) {
  const raw = config && typeof config === "object" ? config : {};
  return {
    expanded: raw.expanded === true,
    expandedWidth: normalizeSize(raw.expandedWidth, 920, 360, 2200),
    expandedHeight: normalizeSize(raw.expandedHeight, 620, 260, 1600)
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

function createIconButton(className, title, iconId, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title;
  button.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
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
    expandedWidth: 920,
    expandedHeight: 620
  },
  defaultLayout: {
    x: 240,
    y: 140,
    w: 380,
    h: 250
  },
  settingsSchema: [
    {
      key: "expandedWidth",
      label: "Expanded width (px)",
      type: "number",
      min: 360,
      max: 2200,
      step: 10
    },
    {
      key: "expandedHeight",
      label: "Expanded height (px)",
      type: "number",
      min: 260,
      max: 1600,
      step: 10
    }
  ],
  create({
    container,
    getConfig,
    getUi,
    getWidget,
    getAllWidgets,
    getWidgetDefinition,
    patchConfig,
    patchWidgetConfigById,
    setWidgetContainer,
    openWidgetSettingsById,
    isEditMode
  }) {
    const root = document.createElement("section");
    root.className = "widget-folder";

    const toolbar = document.createElement("div");
    toolbar.className = "widget-folder-toolbar";

    const summary = document.createElement("p");
    summary.className = "widget-folder-summary";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn widget-folder-toggle-btn";

    toolbar.append(summary, toggleBtn);

    const chips = document.createElement("div");
    chips.className = "widget-folder-chip-list";

    const hint = document.createElement("p");
    hint.className = "muted widget-folder-hint";
    hint.textContent = "Edit Mode에서 위젯 설정의 Container 항목으로 넣기/빼기가 가능합니다.";

    root.append(toolbar, chips, hint);
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

    const panelActions = document.createElement("div");
    panelActions.className = "widget-folder-panel-actions";

    const addSelect = document.createElement("select");
    addSelect.className = "widget-folder-add-select";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn widget-folder-add-btn";
    addBtn.textContent = "Add";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-btn widget-folder-close-btn";
    closeBtn.title = "Collapse folder";
    closeBtn.innerHTML = '<svg class="icon"><use href="#i-close"></use></svg>';

    panelActions.append(addSelect, addBtn, closeBtn);
    panelHead.append(panelTitleWrap, panelActions);

    const panelBody = document.createElement("div");
    panelBody.className = "widget-folder-panel-body";

    panel.append(panelHead, panelBody);
    document.body.append(panel);

    const childControllers = new Map();

    function getCurrentFolder() {
      return typeof getWidget === "function" ? getWidget() : null;
    }

    function listAllWidgets() {
      const list = typeof getAllWidgets === "function" ? getAllWidgets() : [];
      return Array.isArray(list) ? list : [];
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

    function listCandidates(folderId) {
      return listAllWidgets().filter((item) => {
        if (!item || item.enabled === false) {
          return false;
        }
        if (item.type === "container") {
          return false;
        }
        return normalizeText(item.containerId) !== folderId;
      });
    }

    function destroyEmbeddedChildren() {
      for (const entry of childControllers.values()) {
        entry?.destroy?.();
      }
      childControllers.clear();
      panelBody.replaceChildren();
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

      const maxWidth = Math.max(220, cfg.expandedWidth - 64);
      const maxHeight = Math.max(170, cfg.expandedHeight - 148);
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
        headActions.append(
          createIconButton("icon-btn widget-folder-item-settings", "Widget setting", "i-settings", () => {
            openWidgetSettingsById(child.id);
          })
        );
      }

      if (editable && typeof setWidgetContainer === "function") {
        headActions.append(
          createIconButton("icon-btn widget-folder-item-eject", "Move out of folder", "i-trash", () => {
            setWidgetContainer(child.id, "");
          })
        );
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
        patchConfig: (patch) => {
          if (typeof patchWidgetConfigById === "function") {
            patchWidgetConfigById(child.id, patch);
          }
        },
        patchWidgetConfigById,
        setWidgetContainer,
        isEditMode,
        openSettings: () => {
          openWidgetSettingsById?.(child.id);
        },
        openWidgetSettingsById
      });

      return {
        card,
        destroy() {
          controller?.destroy?.();
        },
        refresh() {
          applyEmbeddedCardVisual(card, child);
          controller?.refresh?.();
        }
      };
    }

    function renderCollapsedChips(items) {
      chips.replaceChildren();
      if (!items.length) {
        const empty = document.createElement("span");
        empty.className = "widget-folder-chip-empty";
        empty.textContent = "No widgets in this folder";
        chips.append(empty);
        return;
      }

      const maxChips = 8;
      for (const item of items.slice(0, maxChips)) {
        const chip = document.createElement("span");
        chip.className = "widget-folder-chip";
        chip.textContent = normalizeText(item.title, item.type);
        chips.append(chip);
      }

      if (items.length > maxChips) {
        const more = document.createElement("span");
        more.className = "widget-folder-chip-more";
        more.textContent = `+${items.length - maxChips}`;
        chips.append(more);
      }
    }

    function renderPanel(folder, cfg, items) {
      panel.style.width = `${cfg.expandedWidth}px`;
      panel.style.height = `${cfg.expandedHeight}px`;
      panelTitle.textContent = normalizeText(folder?.title, "Widget Folder");
      panelMeta.textContent = `${items.length} widget${items.length === 1 ? "" : "s"}`;

      const editable = typeof isEditMode === "function" ? Boolean(isEditMode()) : false;
      const candidates = editable ? listCandidates(folder.id) : [];

      addSelect.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = candidates.length ? "Select widget" : "No movable widgets";
      addSelect.append(placeholder);

      for (const candidate of candidates) {
        const option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = `${normalizeText(candidate.title, candidate.type)} (${candidate.type})`;
        addSelect.append(option);
      }

      addSelect.disabled = !editable || !candidates.length;
      addBtn.disabled = !editable || !candidates.length;
      addSelect.hidden = !editable;
      addBtn.hidden = !editable;

      destroyEmbeddedChildren();

      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "widget-folder-empty";
        empty.textContent = "Folder is empty. Add widgets from settings or with the Add control.";
        panelBody.append(empty);
        return;
      }

      for (const child of items) {
        const embedded = createEmbeddedChildCard(child, cfg);
        if (!embedded) {
          continue;
        }
        childControllers.set(child.id, embedded);
        panelBody.append(embedded.card);
      }
    }

    function setPanelExpanded(expanded) {
      panel.hidden = !expanded;
      panel.classList.toggle("open", expanded);
    }

    function render() {
      const folder = getCurrentFolder();
      if (!folder) {
        return;
      }

      const cfg = normalizeExpandedConfig(getConfig());
      const items = listContainedWidgets(folder.id);
      summary.textContent = `${items.length} widget${items.length === 1 ? "" : "s"} in folder`;
      toggleBtn.textContent = cfg.expanded ? "Collapse" : "Expand";
      toggleBtn.classList.toggle("btn-primary", cfg.expanded);
      renderCollapsedChips(items);

      if (!cfg.expanded) {
        setPanelExpanded(false);
        destroyEmbeddedChildren();
        return;
      }

      setPanelExpanded(true);
      renderPanel(folder, cfg, items);
      for (const entry of childControllers.values()) {
        entry?.refresh?.();
      }
    }

    toggleBtn.addEventListener("click", () => {
      const cfg = normalizeExpandedConfig(getConfig());
      patchConfig({ expanded: !cfg.expanded });
    });

    closeBtn.addEventListener("click", () => {
      patchConfig({ expanded: false });
    });

    addBtn.addEventListener("click", () => {
      const folder = getCurrentFolder();
      const targetId = normalizeText(addSelect.value);
      if (!folder?.id || !targetId || typeof setWidgetContainer !== "function") {
        return;
      }
      setWidgetContainer(targetId, folder.id);
    });

    render();

    return {
      refresh: render,
      destroy() {
        destroyEmbeddedChildren();
        panel.remove();
      }
    };
  }
};
