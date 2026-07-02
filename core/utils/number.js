export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeIntegerInRange(value, fallback, min, max) {
  const num = Number(value);
  const rounded = Number.isFinite(num) ? Math.round(num) : Math.round(fallback);
  return clamp(rounded, min, max);
}
