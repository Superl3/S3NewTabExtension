export function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}
