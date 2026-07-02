export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clampFiniteOrMin(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return clamp(value, min, max);
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
