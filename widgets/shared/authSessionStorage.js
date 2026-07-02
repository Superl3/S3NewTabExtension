import { hasOwn } from "../../core/utils/object.js";
import { normalizeText } from "../../core/utils/text.js";

function resolveConnectorNormalizer(normalizeConnectorUrl) {
  if (typeof normalizeConnectorUrl === "function") {
    return normalizeConnectorUrl;
  }
  return (value, fallback = "") => normalizeText(value, fallback);
}

function normalizeStoredSessionRecord(rawSession, normalizeConnectorUrl) {
  return {
    connectorUrl: normalizeConnectorUrl(rawSession?.connectorUrl, ""),
    accessToken: normalizeText(rawSession?.accessToken),
    accountLabel: normalizeText(rawSession?.accountLabel)
  };
}

function resolveStorageArea(getStorageArea) {
  const storageArea = typeof getStorageArea === "function" ? getStorageArea() : null;
  if (!storageArea || typeof storageArea !== "object") {
    throw new Error("Auth session storage area is not available.");
  }
  return storageArea;
}

function requireStorageMethod(storageArea, methodName) {
  if (typeof storageArea?.[methodName] !== "function") {
    throw new Error(`Auth session storage area is missing '${methodName}'.`);
  }
  return storageArea;
}

export function resolveActiveAuthSession({
  connectorUrl = "",
  configuredAccessToken = "",
  storedSession = null,
  configuredAccountLabel = "Configured token"
} = {}) {
  const normalizedConnectorUrl = normalizeText(connectorUrl);
  const normalizedConfiguredToken = normalizeText(configuredAccessToken);
  if (normalizedConfiguredToken) {
    return {
      connectorUrl: normalizedConnectorUrl,
      accessToken: normalizedConfiguredToken,
      accountLabel: normalizeText(configuredAccountLabel, "Configured token")
    };
  }

  if (normalizedConnectorUrl && storedSession?.connectorUrl === normalizedConnectorUrl) {
    return storedSession;
  }

  return null;
}

export function hasActiveAuthConnection({
  config = null,
  connected = false,
  accessToken = "",
  sessionConnectorUrl = ""
} = {}) {
  const configuredToken = normalizeText(config?.accessToken);
  if (configuredToken && accessToken === configuredToken) {
    return true;
  }

  return (
    connected &&
    Boolean(accessToken) &&
    Boolean(sessionConnectorUrl) &&
    config?.connectorUrl === sessionConnectorUrl
  );
}

export function hasAuthSessionStorageChange(changes, storageKey) {
  const normalizedStorageKey = normalizeText(storageKey);
  return Boolean(
    normalizedStorageKey &&
      changes &&
      typeof changes === "object" &&
      hasOwn(changes, normalizedStorageKey)
  );
}

export function createAuthSessionStorage({ storageKey, getStorageArea, normalizeConnectorUrl } = {}) {
  const normalizedStorageKey = normalizeText(storageKey);
  const normalizeConnector = resolveConnectorNormalizer(normalizeConnectorUrl);

  function normalize(rawSession) {
    if (!rawSession || typeof rawSession !== "object" || Array.isArray(rawSession)) {
      return null;
    }

    const session = normalizeStoredSessionRecord(rawSession, normalizeConnector);
    if (!session.connectorUrl || !session.accessToken) {
      return null;
    }

    return session;
  }

  async function load() {
    if (!normalizedStorageKey) {
      return null;
    }

    try {
      const storageArea = requireStorageMethod(resolveStorageArea(getStorageArea), "get");
      const stored = await storageArea.get(normalizedStorageKey);
      return normalize(stored?.[normalizedStorageKey]);
    } catch {
      return null;
    }
  }

  async function save(session) {
    if (!normalizedStorageKey) {
      throw new Error("Auth session storage key is required.");
    }

    const storageArea = requireStorageMethod(resolveStorageArea(getStorageArea), "set");
    const normalizedSession = normalizeStoredSessionRecord(session, normalizeConnector);
    await storageArea.set({
      [normalizedStorageKey]: normalizedSession
    });
    return normalize(normalizedSession);
  }

  async function clear() {
    if (!normalizedStorageKey) {
      return;
    }

    try {
      const storageArea = requireStorageMethod(resolveStorageArea(getStorageArea), "remove");
      await storageArea.remove(normalizedStorageKey);
    } catch {
    }
  }

  return {
    normalize,
    load,
    save,
    clear
  };
}
