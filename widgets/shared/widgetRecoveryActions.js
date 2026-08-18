/**
 * Inline recovery controls for a widget's empty/error state.
 *
 * A refresh action exists in the widget card header, but it is only reachable
 * through selection or hover chrome. When a widget is showing a failure the body
 * itself must offer a way forward, otherwise the failing state has no action.
 */
export function buildWidgetRecoveryActions(documentObj, { onRetry, onOpenSettings } = {}) {
  if (typeof documentObj?.createElement !== "function") {
    return null;
  }

  const actions = documentObj.createElement("div");
  actions.className = "widget-recovery-actions";

  const addAction = (label, handler) => {
    if (typeof handler !== "function") {
      return;
    }
    const button = documentObj.createElement("button");
    button.type = "button";
    button.className = "widget-recovery-action";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      handler();
    });
    actions.append(button);
  };

  addAction("Retry", onRetry);
  addAction("Open settings", onOpenSettings);

  return actions.childNodes.length ? actions : null;
}

/**
 * Freshness banner shown when a widget is displaying a cached list while its
 * latest refresh failed. Without this, stale rows are visually identical to live
 * data and the only signal is a one-line status that may be truncated.
 */
export function buildStaleDataNotice(documentObj, syncedLabel = "") {
  if (typeof documentObj?.createElement !== "function") {
    return null;
  }

  const notice = documentObj.createElement("p");
  notice.className = "widget-stale-notice";
  notice.textContent = syncedLabel
    ? `Showing cached data from ${syncedLabel}.`
    : "Showing cached data.";
  return notice;
}
