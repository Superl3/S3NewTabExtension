export function formatLocalDateTimeLabel(rawDate) {
  const parsed = Date.parse(rawDate);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toLocaleString();
}
