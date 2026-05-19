export const PORTABLE_PROFILE_FORMAT = "s3-new-tab-profile";
export const PORTABLE_PROFILE_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createPortableProfileExport(snapshot, {
  appVersion = "",
  now = () => new Date(),
  sanitizeSnapshot = (value) => value,
  userAgent = ""
} = {}) {
  const exportedAt = now();
  const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  return {
    format: PORTABLE_PROFILE_FORMAT,
    version: PORTABLE_PROFILE_VERSION,
    exportedAt: date.toISOString(),
    app: {
      name: "S3 New Tab",
      version: String(appVersion || "")
    },
    browser: {
      userAgent: String(userAgent || "")
    },
    portability: {
      credentials: "excluded",
      volatileCaches: "excluded",
      browserSpecificUrls: "removed-on-import",
      reauthenticationRequired: true
    },
    snapshot: sanitizeSnapshot(snapshot)
  };
}

export function extractProfileSnapshotFromImportPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("Profile import must be a JSON object.");
  }
  if (payload.format === PORTABLE_PROFILE_FORMAT) {
    if (!isPlainObject(payload.snapshot)) {
      throw new Error("Portable profile is missing a snapshot object.");
    }
    return payload.snapshot;
  }
  if (isPlainObject(payload.ui) || Array.isArray(payload.instances)) {
    return payload;
  }
  throw new Error("JSON file is not an S3 New Tab profile export.");
}

export function normalizeImportedProfileSnapshot(snapshot, {
  isSensitiveKey = () => false,
  isVolatileProfileKey = () => false,
  redactedValue = "[REDACTED]",
  sanitizeString = (value) => value
} = {}) {
  function normalizeValue(value, pathParts = []) {
    if (typeof value === "string") {
      if (value === redactedValue) {
        return undefined;
      }
      if (/^(chrome-extension|blob|filesystem):/i.test(value)) {
        return "";
      }
      return sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return value
        .map((entry) => normalizeValue(entry, pathParts))
        .filter((entry) => entry !== undefined);
    }

    if (!isPlainObject(value)) {
      return value;
    }

    const normalized = {};
    for (const [key, rawValue] of Object.entries(value)) {
      if (isSensitiveKey(key) || isVolatileProfileKey(key)) {
        continue;
      }
      const nextValue = normalizeValue(rawValue, [...pathParts, key]);
      if (nextValue !== undefined) {
        normalized[key] = nextValue;
      }
    }
    return normalized;
  }

  const normalized = normalizeValue(snapshot);
  if (!isPlainObject(normalized)) {
    throw new Error("Profile snapshot could not be normalized.");
  }
  return normalized;
}
