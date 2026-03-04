const STORAGE_KEY = "s3newtab-state-v1";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (!isObject(base) || !isObject(patch)) {
    return patch;
  }

  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      out[key] = value.slice();
      continue;
    }
    if (isObject(value) && isObject(base[key])) {
      out[key] = deepMerge(base[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function loadState(defaultState) {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const current = stored?.[STORAGE_KEY];
    if (!current || !isObject(current)) {
      return structuredClone(defaultState);
    }
    return deepMerge(defaultState, current);
  } catch {
    return structuredClone(defaultState);
  }
}

export async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export { STORAGE_KEY };
