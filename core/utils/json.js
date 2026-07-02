export function parseJsonOrFallback(value, fallback = null) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function parseJsonOrNull(value) {
  return parseJsonOrFallback(value, null);
}
