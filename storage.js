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

export async function saveState(state) {
  const storage = chromeStorageLocal();
  if (storage?.set) {
    await storage.set({ [STORAGE_KEY]: state });
    return;
  }

  try {
    localStorageFallback()?.setItem?.(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}

export { STORAGE_KEY };
