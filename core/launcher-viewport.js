function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function isPlaceholderLauncherPage(page, pageCount = 1) {
  return page === -1 || page === pageCount;
}

export function shouldRenderLauncherPlaceholderPage({
  mode = "use",
  dragPlaceholderPolicyActive = false,
  hasPendingPlaceholderDrop = false
} = {}) {
  return mode === "edit" || Boolean(dragPlaceholderPolicyActive) || Boolean(hasPendingPlaceholderDrop);
}

export function resolveLauncherViewportPage({
  activePage = 0,
  pageCount = 1,
  virtualPage = null,
  allowPlaceholderPages = false
} = {}) {
  const active = clamp(Math.floor(Number(activePage) || 0), 0, Math.max(0, Math.floor(Number(pageCount) || 1) - 1));
  if (!allowPlaceholderPages) {
    return active;
  }

  const hasVirtualPage = virtualPage !== null && virtualPage !== undefined && virtualPage !== "";
  const virtual = hasVirtualPage ? Number(virtualPage) : NaN;
  if (!Number.isFinite(virtual)) {
    return active;
  }

  return clamp(Math.floor(virtual), -1, Math.max(1, Math.floor(Number(pageCount) || 1)));
}

export function clampLauncherVirtualPage(value, pageCount = 1) {
  const page = Number(value);
  if (!Number.isFinite(page)) {
    return null;
  }
  return clamp(Math.floor(page), -1, Math.max(1, Math.floor(Number(pageCount) || 1)));
}
