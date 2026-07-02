import { clampFiniteOrMin, toInteger, toPositiveInteger } from "./utils/number.js";

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
  const normalizedPageCount = toPositiveInteger(pageCount, 1);
  const active = clampFiniteOrMin(toInteger(activePage, 0), 0, normalizedPageCount - 1);
  if (!allowPlaceholderPages) {
    return active;
  }

  const hasVirtualPage = virtualPage !== null && virtualPage !== undefined && virtualPage !== "";
  const virtual = hasVirtualPage ? toInteger(virtualPage, null) : null;
  if (virtual === null) {
    return active;
  }

  return clampFiniteOrMin(virtual, -1, normalizedPageCount);
}

export function clampLauncherVirtualPage(value, pageCount = 1) {
  const page = toInteger(value, null);
  if (page === null) {
    return null;
  }
  return clampFiniteOrMin(page, -1, toPositiveInteger(pageCount, 1));
}
