export const MAX_CONTENT_Z_INDEX = 8989;
export const MAX_CARD_Z_INDEX = MAX_CONTENT_Z_INDEX - 1;
export const DROP_SILHOUETTE_Z_INDEX = 8990;
export const DRAG_PREVIEW_Z_INDEX = 9000;

export function normalizeRawContentZIndex(value, { fallback = 1, min = 1 } = {}) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? Math.round(numeric) : fallback;
  return Math.max(min, safeValue);
}

export function resolveCardContentZIndex(value, maxValue, { fallback = 1, min = 1 } = {}) {
  const rawValue = normalizeRawContentZIndex(value, { fallback, min });
  const rawMaxValue = Math.max(rawValue, normalizeRawContentZIndex(maxValue, { fallback, min }));
  const overflow = Math.max(0, rawMaxValue - MAX_CARD_Z_INDEX);
  return Math.max(min, rawValue - overflow);
}

export function resolveFolderPanelZIndex(cardZIndex) {
  const numeric = Number(cardZIndex);
  if (!Number.isFinite(numeric)) {
    return 2;
  }
  return Math.min(MAX_CONTENT_Z_INDEX, Math.max(2, Math.round(numeric) + 1));
}
