function call(fn, ...args) {
  if (typeof fn !== "function") {
    return undefined;
  }
  return fn(...args);
}

export function syncWidgetStateAfterModalApply(instance, previousPage, deps = {}) {
  if (!instance) {
    return;
  }

  const {
    inferCommonOverrides,
    widgetCommonMaster,
    syncLauncherPagingState,
    setActivePage
  } = deps;

  instance.commonOverrides = call(inferCommonOverrides, instance, widgetCommonMaster);
  call(syncLauncherPagingState, { expandToFitInstances: true });
  if (instance.page !== previousPage) {
    call(setActivePage, instance.page);
  }
}

export function refreshWidgetRuntimeAfterModalApply(instance, defTitle = "", deps = {}) {
  if (!instance) {
    return;
  }

  const {
    runtimeMap,
    applyLayout,
    applyCardVisual,
    refreshWidgetsByType,
    isWidgetInContainer
  } = deps;

  const runtime = runtimeMap?.get?.(instance.id);
  if (runtime) {
    const titleEl = runtime.card?.querySelector?.(".widget-title");
    if (titleEl) {
      titleEl.textContent = instance.title || defTitle;
    }
    call(applyLayout, runtime.card, instance.layout, instance.page);
    call(applyCardVisual, runtime.card, instance);
    runtime.controller?.refresh?.();
    return;
  }

  if (call(isWidgetInContainer, instance)) {
    call(refreshWidgetsByType, "container");
  }
}
