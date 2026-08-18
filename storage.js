import { isStateObject, mergeStateObjects } from "./core/state/merge.js";

const STORAGE_KEY = "s3newtab-state-v1";

function chromeStorageLocal() {
  return globalThis.chrome?.storage?.local || null;
}

function localStorageFallback() {
  return globalThis.localStorage || null;
}

export async function loadState(defaultState) {
  try {
    const storage = chromeStorageLocal();
    if (!storage?.get) {
      const raw = localStorageFallback()?.getItem?.(STORAGE_KEY);
      const current = raw ? JSON.parse(raw) : null;
      if (current && isStateObject(current)) {
        return mergeStateObjects(defaultState, current);
      }
      return structuredClone(defaultState);
    }

    const stored = await storage.get(STORAGE_KEY);
    const current = stored?.[STORAGE_KEY];
    if (!current || !isStateObject(current)) {
      return structuredClone(defaultState);
    }
    return mergeStateObjects(defaultState, current);
  } catch {
    return structuredClone(defaultState);
  }
}

const QUOTA_WARN_RATIO = 0.8;

export async function readStorageUsage() {
  const storage = chromeStorageLocal();
  if (typeof storage?.getBytesInUse !== "function") {
    return null;
  }

  const quotaBytes = Number(storage.QUOTA_BYTES);
  if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) {
    return null;
  }

  try {
    const bytesInUse = Number(await storage.getBytesInUse(null));
    if (!Number.isFinite(bytesInUse) || bytesInUse < 0) {
      return null;
    }
    return {
      bytesInUse,
      quotaBytes,
      ratio: bytesInUse / quotaBytes,
      nearQuota: bytesInUse / quotaBytes >= QUOTA_WARN_RATIO
    };
  } catch {
    return null;
  }
}

function isQuotaFailure(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  return /quota/i.test(name) || /quota/i.test(message);
}

function toPersistError(error) {
  const quota = isQuotaFailure(error);
  const persistError = new Error(
    quota
      ? "Dashboard storage is full, so recent changes could not be saved."
      : "Dashboard state could not be saved."
  );
  persistError.name = quota ? "PersistQuotaError" : "PersistError";
  persistError.cause = error;
  persistError.isQuotaError = quota;
  return persistError;
}

export async function saveState(state) {
  const storage = chromeStorageLocal();
  if (storage?.set) {
    try {
      await storage.set({ [STORAGE_KEY]: state });
    } catch (error) {
      throw toPersistError(error);
    }
    return;
  }

  const fallback = localStorageFallback();
  if (typeof fallback?.setItem !== "function") {
    return;
  }

  try {
    fallback.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    throw toPersistError(error);
  }
}

export { QUOTA_WARN_RATIO, STORAGE_KEY };
