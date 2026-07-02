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

export function openFlexEntryDetail({
  entry,
  config,
  fallbackQueryDate = "",
  resolveQueryDate,
  resolveDetailUrl,
  targetWindow = globalThis.window
} = {}) {
  if (typeof resolveDetailUrl !== "function") {
    return false;
  }

  let queryDate = fallbackQueryDate;
  if (typeof resolveQueryDate === "function") {
    try {
      queryDate = resolveQueryDate(config);
    } catch {
      if (!queryDate) {
        return false;
      }
    }
  }

  const href = resolveDetailUrl(config, queryDate, entry);
  return openFlexDetailHref(href, config, targetWindow);
}
