export function createStateExportSanitizer({
  sensitiveKeywordParts = [],
  volatileBackgroundKeywordParts = [],
  volatileProfileKeywordParts = [],
  redactedValue = "[REDACTED]"
} = {}) {
  function normalizeSensitiveKeyPart(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function isSensitiveExportKey(key) {
    const normalizedKey = normalizeSensitiveKeyPart(key);
    if (!normalizedKey) {
      return false;
    }
    // A calendar feed URL grants access even when its credentials live in the path.
    return normalizedKey === "icsurl" || sensitiveKeywordParts.some((part) => normalizedKey.includes(part));
  }

  function isVolatileBackgroundExportKey(key) {
    const normalizedKey = normalizeSensitiveKeyPart(key);
    if (!normalizedKey) {
      return false;
    }
    return volatileBackgroundKeywordParts.some((part) => normalizedKey.includes(part));
  }

  function isVolatileProfileExportKey(key) {
    const normalizedKey = normalizeSensitiveKeyPart(key);
    if (!normalizedKey) {
      return false;
    }
    return volatileProfileKeywordParts.some((part) => normalizedKey.includes(part));
  }

  function redactCredentialUrl(value) {
    try {
      const url = new URL(value);
      let pathname = url.pathname;
      try {
        pathname = decodeURIComponent(pathname);
      } catch {
        // Malformed escapes must not bypass the raw private-path check.
      }
      const isPrivateCalendarFeed = url.hostname === "calendar.google.com" &&
        pathname.startsWith("/calendar/ical/") && /\/private[-/]/i.test(pathname);
      if (url.username || url.password || isPrivateCalendarFeed) {
        return redactedValue;
      }
    } catch {
      // Leave non-URL text intact.
    }
    return value;
  }

  function sanitizeCredentialQueryParamsInString(value) {
    if (typeof value !== "string") {
      return value;
    }
    value = value.replace(/\b(?:https?|webcal):\/\/[^\s<>"']+/gi, redactCredentialUrl);

    const queryIndex = value.indexOf("?");
    if (queryIndex < 0) {
      return value;
    }

    const hashIndex = value.indexOf("#", queryIndex);
    const queryStart = queryIndex + 1;
    const queryEnd = hashIndex >= 0 ? hashIndex : value.length;
    const queryText = value.slice(queryStart, queryEnd);
    if (!queryText) {
      return value;
    }

    const params = new URLSearchParams(queryText);
    let changed = false;
    for (const key of [...params.keys()]) {
      if (!isSensitiveExportKey(key)) {
        continue;
      }
      params.set(key, redactedValue);
      changed = true;
    }

    if (!changed) {
      return value;
    }

    const prefix = value.slice(0, queryStart);
    const suffix = hashIndex >= 0 ? value.slice(hashIndex) : "";
    return `${prefix}${params.toString()}${suffix}`;
  }

  function sanitizeStateExportValue(value, pathParts = []) {
    if (typeof value === "string") {
      return sanitizeCredentialQueryParamsInString(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => sanitizeStateExportValue(entry, pathParts));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    const isBackgroundBranch = pathParts.length >= 2 && pathParts[0] === "ui" && pathParts[1] === "background";
    const sanitized = {};

    for (const [key, rawValue] of Object.entries(value)) {
      const nextPath = [...pathParts, key];
      const isExactMondayAccessTokenPath =
        nextPath.length === 3 &&
        nextPath[0] === "ui" &&
        nextPath[1] === "monday" &&
        nextPath[2] === "accessToken";
      if (isVolatileProfileExportKey(key)) {
        continue;
      }
      if (isBackgroundBranch && isVolatileBackgroundExportKey(key)) {
        continue;
      }
      if (isExactMondayAccessTokenPath || isSensitiveExportKey(key)) {
        sanitized[key] = redactedValue;
        continue;
      }
      sanitized[key] = sanitizeStateExportValue(rawValue, nextPath);
    }

    return sanitized;
  }

  return {
    normalizeSensitiveKeyPart,
    isSensitiveExportKey,
    isVolatileBackgroundExportKey,
    isVolatileProfileExportKey,
    sanitizeCredentialQueryParamsInString,
    sanitizeStateExportValue
  };
}
