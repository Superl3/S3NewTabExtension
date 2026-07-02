import { clampFiniteOrMin } from "./utils/number.js";

export function normalizePageCount(value, fallback = 1, maxPages = 12) {
  const max = Math.max(1, Math.floor(Number(maxPages) || 12));
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clampFiniteOrMin(Math.floor(fallback), 1, max);
  }
  return clampFiniteOrMin(Math.floor(num), 1, max);
}

export function normalizeActivePage(value, pageCount = 1, fallback = 0) {
  const maxPage = Math.max(0, normalizePageCount(pageCount, 1) - 1);
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clampFiniteOrMin(Math.floor(fallback), 0, maxPage);
  }
  return clampFiniteOrMin(Math.floor(num), 0, maxPage);
}

export function normalizeWidgetPage(value, pageCount = 12, fallback = 0) {
  const num = Number(value);
  const maxPage = Math.max(0, normalizePageCount(pageCount, 1) - 1);
  if (!Number.isFinite(num)) {
    return clampFiniteOrMin(Math.floor(fallback), 0, maxPage);
  }
  return clampFiniteOrMin(Math.floor(num), 0, maxPage);
}

export function normalizeLauncherPageIndexList(value, pageCount = 1) {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = new Set();
  for (const item of value) {
    const page = normalizeWidgetPage(item, pageCount, 0);
    normalized.add(page);
  }
  return Array.from(normalized).sort((left, right) => left - right);
}

export function remapLauncherPageIndexList(list, remap, pageCount = 1) {
  if (!(remap instanceof Map)) {
    return normalizeLauncherPageIndexList(list, pageCount);
  }
  const remapped = [];
  for (const rawPage of Array.isArray(list) ? list : []) {
    const page = Math.floor(Number(rawPage));
    if (!Number.isFinite(page)) {
      continue;
    }
    const mapped = remap.get(page);
    if (Number.isFinite(mapped)) {
      remapped.push(mapped);
    }
  }
  return normalizeLauncherPageIndexList(remapped, pageCount);
}

export function shiftLauncherPageIndexListOnInsert(list, { addLeft = false, pageCount = 1, insertedPage = 0 } = {}) {
  const shifted = normalizeLauncherPageIndexList(list, Math.max(1, pageCount - 1)).map((page) =>
    addLeft ? page + 1 : page
  );
  shifted.push(insertedPage);
  return normalizeLauncherPageIndexList(shifted, pageCount);
}

export function shiftLauncherPageIndexListOnDelete(list, deletedPage, pageCount = 1) {
  const target = normalizeWidgetPage(deletedPage, pageCount + 1, 0);
  const shifted = [];
  for (const page of normalizeLauncherPageIndexList(list, pageCount + 1)) {
    if (page === target) {
      continue;
    }
    shifted.push(page > target ? page - 1 : page);
  }
  return normalizeLauncherPageIndexList(shifted, pageCount);
}

export function resolvePageTowardHomeDirection(keptPages, currentPage, homePage) {
  if (!Array.isArray(keptPages) || !keptPages.length) {
    return 0;
  }
  const sorted = [...keptPages].sort((left, right) => left - right);
  if (sorted.includes(currentPage)) {
    return currentPage;
  }

  if (currentPage < homePage) {
    const towardHome = sorted.find((page) => page > currentPage);
    if (Number.isFinite(towardHome)) {
      return towardHome;
    }
    return sorted[sorted.length - 1];
  }

  if (currentPage > homePage) {
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      if (sorted[index] < currentPage) {
        return sorted[index];
      }
    }
    return sorted[0];
  }

  const atOrAfterHome = sorted.find((page) => page >= homePage);
  if (Number.isFinite(atOrAfterHome)) {
    return atOrAfterHome;
  }
  return sorted[sorted.length - 1];
}

export function remapPageForDeletion(page, deletedPage, pageCountAfter) {
  const normalizedDeletedPage = normalizeWidgetPage(deletedPage, pageCountAfter + 1, 0);
  const normalizedPage = normalizeWidgetPage(page, pageCountAfter + 1, normalizedDeletedPage);
  if (normalizedPage < normalizedDeletedPage) {
    return normalizeWidgetPage(normalizedPage, pageCountAfter, 0);
  }
  if (normalizedPage > normalizedDeletedPage) {
    return normalizeWidgetPage(normalizedPage - 1, pageCountAfter, 0);
  }
  return normalizeWidgetPage(normalizedDeletedPage, pageCountAfter, normalizedDeletedPage - 1);
}

export function applyLauncherHomeMetadata(home) {
  if (!home || typeof home !== "object") {
    return home;
  }
  const pageCount = normalizePageCount(home.pageCount, 1);
  home.homePage = normalizeActivePage(home.homePage, pageCount, 0);
  home.manualPages = normalizeLauncherPageIndexList(home.manualPages, pageCount);
  return home;
}
