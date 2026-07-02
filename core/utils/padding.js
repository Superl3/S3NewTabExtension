export function normalizePaddingValue(value, fallback = 10) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, numeric));
}

export function resolvePaddingNormalizer(normalizePadding) {
  if (typeof normalizePadding === "function") {
    return normalizePadding;
  }
  return normalizePaddingValue;
}
