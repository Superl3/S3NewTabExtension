import { normalizeText } from "../../core/utils/text.js";

export function normalizeHttpUrl(value, fallback = "") {
  const text = normalizeText(value, fallback);
  if (!text) {
    return fallback;
  }

  try {
    const parsed = new URL(text);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return fallback;
    }
    return parsed.href;
  } catch {
    return fallback;
  }
}

export function isUrlIcon(value) {
  const text = normalizeText(value);
  return (
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("data:") ||
    text.startsWith("chrome-extension://")
  );
}

export function buildGoogleFaviconUrl(url) {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
}
