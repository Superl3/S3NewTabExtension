import { clampNumberOrFallback } from "./number.js";

export function normalizePaddingValue(value, fallback = 10) {
  return clampNumberOrFallback(value, fallback, 0, 100);
}

export function resolvePaddingNormalizer(normalizePadding) {
  if (typeof normalizePadding === "function") {
    return normalizePadding;
  }
  return normalizePaddingValue;
}
