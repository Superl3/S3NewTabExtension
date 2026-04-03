import { isStateObject, mergeStateObjects } from "./core/state/merge.js";

const STORAGE_KEY = "s3newtab-state-v1";

export async function loadState(defaultState) {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
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
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export { STORAGE_KEY };
