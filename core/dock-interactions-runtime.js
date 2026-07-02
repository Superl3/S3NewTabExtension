export function createDockInteractionsRuntime(deps) {
  const isHtmlElement = (value) => {
    if (typeof HTMLElement !== "undefined") {
      return value instanceof HTMLElement;
    }
    return Boolean(value && typeof value === "object" && value.classList);
  };

  function dockButtonsInStrip() {
    const strip = deps.elements?.dockWidgetStrip;
    if (!strip) {
      return [];
    }
    return Array.from(strip.querySelectorAll(".dock-widget-item"));
  }

  function applyDockActiveVisual(activeId = deps.dockUiState?.activeId) {
    const buttons = dockButtonsInStrip();
    if (!buttons.length) {
      deps.dockUiState.activeId = "";
      return;
    }

    const fallbackId = deps.normalizeText(buttons[0]?.dataset?.widgetId);
    const normalized = deps.normalizeText(activeId);
    const resolved = buttons.some((button) => deps.normalizeText(button?.dataset?.widgetId) === normalized)
      ? normalized
      : fallbackId;

    deps.dockUiState.activeId = resolved;

    for (const button of buttons) {
      const buttonId = deps.normalizeText(button?.dataset?.widgetId);
      const active = buttonId === resolved;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    }
  }

  function syncDockOverflowState() {
    const strip = deps.elements?.dockWidgetStrip;
    if (!strip) {
      return;
    }

    const overflow = strip.scrollWidth - strip.clientWidth > 1;
    const atStart = strip.scrollLeft <= 1;
    const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;

    strip.dataset.overflowing = overflow ? "true" : "false";
    strip.dataset.overflowStart = !atStart && overflow ? "true" : "false";
    strip.dataset.overflowEnd = !atEnd && overflow ? "true" : "false";
  }

  function moveDockFocusByOffset(offset) {
    const buttons = dockButtonsInStrip();
    if (!buttons.length) {
      return;
    }
    const activeElement = deps.documentObj?.activeElement;
    const index = Math.max(0, buttons.findIndex((button) => button === activeElement));
    const nextIndex = deps.clamp(index + offset, 0, buttons.length - 1);
    const nextButton = buttons[nextIndex];
    if (!isHtmlElement(nextButton) || typeof nextButton.focus !== "function") {
      return;
    }
    nextButton.focus();
    deps.setDockActiveId(deps.normalizeText(nextButton?.dataset?.widgetId), { rerender: false });
    applyDockActiveVisual();
  }

  function moveDockFocusToEdge(edge) {
    const buttons = dockButtonsInStrip();
    if (!buttons.length) {
      return;
    }
    const nextButton = edge === "end" ? buttons[buttons.length - 1] : buttons[0];
    if (!isHtmlElement(nextButton) || typeof nextButton.focus !== "function") {
      return;
    }
    nextButton.focus();
    deps.setDockActiveId(deps.normalizeText(nextButton?.dataset?.widgetId), { rerender: false });
    applyDockActiveVisual();
  }

  function onDockStripKeyDown(event) {
    if (!isHtmlElement(event?.target) || !event.target.closest(".dock-widget-item")) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveDockFocusByOffset(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveDockFocusByOffset(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveDockFocusToEdge("start");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      moveDockFocusToEdge("end");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.target.click();
    }
  }

  function onDockStripWheel(event) {
    const strip = deps.elements?.dockWidgetStrip;
    if (!strip) {
      return;
    }
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }
    event.preventDefault();
    strip.scrollLeft += event.deltaY;
    syncDockOverflowState();
  }

  function syncDockContentPadding(config) {
    const root = deps.documentObj?.documentElement;
    const dock = deps.elements?.persistentDock;
    const dockBody = deps.elements?.persistentDockBody;
    if (!root) {
      return;
    }

    if (!config?.enabled || !dock || dock.classList.contains("is-disabled")) {
      root.style.setProperty("--persistent-dock-height", "0px");
      root.style.setProperty("--persistent-dock-content-padding", "0px");
      root.style.setProperty("--persistent-dock-clearance", "0px");
      return;
    }

    const measured = Math.ceil((dockBody ?? dock).getBoundingClientRect().height || 0);
    const dockHeight = Math.max(config.heightPx, measured);
    const visibility = deps.normalizeDockVisibility(config.visibility, "fixed");
    const contentPadding = visibility === "collapsible" ? 0 : dockHeight + 12;

    root.style.setProperty("--persistent-dock-height", `${dockHeight}px`);
    root.style.setProperty("--persistent-dock-content-padding", `${contentPadding}px`);
    root.style.setProperty("--persistent-dock-clearance", `${contentPadding}px`);
  }

  function destroyDockEmbeddedControllers() {
    for (const entry of deps.dockEmbeddedUiState?.controllers?.values?.() ?? []) {
      entry?.destroy?.();
    }
    deps.dockEmbeddedUiState?.controllers?.clear?.();
  }

  return {
    dockButtonsInStrip,
    applyDockActiveVisual,
    syncDockOverflowState,
    moveDockFocusByOffset,
    moveDockFocusToEdge,
    onDockStripKeyDown,
    onDockStripWheel,
    syncDockContentPadding,
    destroyDockEmbeddedControllers
  };
}
