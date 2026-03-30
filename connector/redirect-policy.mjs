export function normalizeText(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

export function parseAllowedExtensionIds(value) {
  const set = new Set();
  const normalized = normalizeText(value);
  if (!normalized) {
    return set;
  }
  for (const item of normalized.split(",")) {
    const candidate = normalizeText(item).toLowerCase();
    if (/^[a-p]{32}$/.test(candidate)) {
      set.add(candidate);
    }
  }
  return set;
}

export function extractExtensionId(parsed) {
  if (!parsed) {
    return "";
  }
  if (parsed.protocol === "chrome-extension:") {
    return normalizeText(parsed.hostname).toLowerCase();
  }
  if (parsed.protocol === "https:") {
    const match = normalizeText(parsed.hostname).toLowerCase().match(/^([a-p]{32})\.chromiumapp\.org$/);
    return match ? match[1] : "";
  }
  return "";
}

export function isAllowedRedirectUri(redirectUri, options = {}) {
  const allowedExtensionIds = options.allowedExtensionIds instanceof Set ? options.allowedExtensionIds : new Set();
  const allowChromeExtensionRedirect = options.allowChromeExtensionRedirect === true;

  try {
    const parsed = new URL(redirectUri);
    const extensionId = extractExtensionId(parsed);

    if (parsed.protocol === "https:") {
      if (parsed.hostname.endsWith(".chromiumapp.org")) {
        return extensionId && allowedExtensionIds.has(extensionId);
      }
      return false;
    }

    if (parsed.protocol === "chrome-extension:") {
      if (!extensionId || !allowChromeExtensionRedirect || allowedExtensionIds.size === 0) {
        return false;
      }
      return allowedExtensionIds.has(extensionId);
    }

    if (parsed.protocol === "http:") {
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    }

    return false;
  } catch {
    return false;
  }
}
