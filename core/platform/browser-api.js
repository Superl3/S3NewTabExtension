export function resolveBrowserEventTarget(eventTarget = null) {
  return eventTarget || globalThis.window || null;
}

export function resolveBrowserTimerApi(timerApi = null) {
  const source = timerApi || globalThis.window || globalThis;
  return {
    setTimeout: typeof source?.setTimeout === "function" ? source.setTimeout.bind(source) : null,
    clearTimeout: typeof source?.clearTimeout === "function" ? source.clearTimeout.bind(source) : null
  };
}
