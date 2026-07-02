export function openFlexDetailHref(href, config, targetWindow = globalThis.window) {
  if (!href || !targetWindow) {
    return false;
  }

  if (config?.openInNewTab) {
    targetWindow.open(href, "_blank", "noopener,noreferrer");
  } else {
    targetWindow.location.href = href;
  }
  return true;
}
