export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clampFiniteOrMin(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return clamp(value, min, max);
}

export function clampNumberOrFallback(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return clamp(numeric, min, max);
}

export function clampTruthyNumberOrFallback(value, fallback, min, max) {
  return clamp(Number(value) || fallback, min, max);
}

export function clampRoundedTruthyNumberOrFallback(value, fallback, min, max) {
  return clamp(Math.round(Number(value) || fallback), min, max);
}

export function toNonNegativeNumberOrFallback(value, fallback = 0) {
  return clampTruthyNumberOrFallback(value, fallback, 0, Number.POSITIVE_INFINITY);
}

export function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

export function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.floor(numeric);
}

export function toPositiveInteger(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, Math.floor(numeric));
}

export function roundFiniteOrFallback(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.round(numeric);
}

export function normalizeIntegerInRange(value, fallback, min, max) {
  const num = Number(value);
  const rounded = Number.isFinite(num) ? Math.round(num) : Math.round(fallback);
  return clamp(rounded, min, max);
}
