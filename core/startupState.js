export const STARTUP_STATE_QUERY_KEY = "startup-state";
export const STARTUP_STATE_INLINE_QUERY_KEY = "startupState";
export const STARTUP_STATE_EMPTY_WIDGETS_QUERY_KEY = "startup-state-empty-widgets";
export const STARTUP_STATE_JSON_PATH = "config/startup-state.json";

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function defaultIsStateObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function defaultMergeStateObjects(base, patch) {
  const output = defaultIsStateObject(base) ? structuredClone(base) : {};
  if (!defaultIsStateObject(patch)) {
    return output;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      output[key] = value.slice();
      continue;
    }

    if (defaultIsStateObject(value) && defaultIsStateObject(output[key])) {
      output[key] = defaultMergeStateObjects(output[key], value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function isAllowedStartupStateUrl(value, options = {}) {
  const baseOrigin = normalizeText(options.baseOrigin, "http://localhost");
  try {
    const url = new URL(value, baseOrigin);
    return ["http:", "https:", "chrome-extension:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function normalizeStartupStateBoolean(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveComposableStartupState(rawState, options = {}) {
  const isStateObject = typeof options.isStateObject === "function" ? options.isStateObject : defaultIsStateObject;
  const mergeStateObjects =
    typeof options.mergeStateObjects === "function" ? options.mergeStateObjects : defaultMergeStateObjects;

  if (!isStateObject(rawState)) {
    return null;
  }

  if (Number(rawState.version) !== 2) {
    return rawState;
  }

  let composed = isStateObject(rawState.defaults) ? structuredClone(rawState.defaults) : {};
  const presetMap = isStateObject(rawState.presets) ? rawState.presets : {};
  const presetOrder = Array.isArray(rawState.applyPresets) ? rawState.applyPresets : [];

  for (const presetName of presetOrder) {
    const name = normalizeText(presetName);
    if (!name) {
      continue;
    }
    const patch = presetMap[name];
    if (!isStateObject(patch)) {
      continue;
    }
    composed = mergeStateObjects(composed, patch);
  }

  if (isStateObject(rawState.overrides)) {
    composed = mergeStateObjects(composed, rawState.overrides);
  }

  return composed;
}

export async function loadStartupStateFromJsonValue(rawValue, options = {}) {
  const isStateObject = typeof options.isStateObject === "function" ? options.isStateObject : defaultIsStateObject;
  const mergeStateObjects =
    typeof options.mergeStateObjects === "function" ? options.mergeStateObjects : defaultMergeStateObjects;
  const baseOrigin = normalizeText(options.baseOrigin, "http://localhost");
  const cache = normalizeText(options.cache, "no-store") || "no-store";
  const fetchFn = typeof options.fetchFn === "function" ? options.fetchFn : fetch;
  const value = normalizeText(rawValue);
  if (!value) {
    return null;
  }

  let parsed = null;
  if (value.startsWith("{") || value.startsWith("[")) {
    parsed = JSON.parse(value);
  } else {
    if (!isAllowedStartupStateUrl(value, { baseOrigin })) {
      return null;
    }

    const response = await fetchFn(new URL(value, baseOrigin), { cache });
    if (!response.ok) {
      throw new Error(`Failed to load startup state from ${value}: ${response.status}`);
    }
    parsed = JSON.parse(await response.text());
  }

  if (!isStateObject(parsed)) {
    return null;
  }

  const resolved = resolveComposableStartupState(parsed, { isStateObject, mergeStateObjects });
  return isStateObject(resolved) ? resolved : null;
}

export async function getStartupStateFromLocation(options = {}) {
  const search =
    typeof options.search === "string"
      ? options.search
      : typeof globalThis.location?.search === "string"
        ? globalThis.location.search
        : "";
  const searchParams = new URLSearchParams(search);
  const startupStateValue =
    searchParams.get(options.startupStateQueryKey || STARTUP_STATE_QUERY_KEY) ||
    searchParams.get(options.startupStateInlineQueryKey || STARTUP_STATE_INLINE_QUERY_KEY);
  if (!startupStateValue) {
    return null;
  }

  const isStateObject = typeof options.isStateObject === "function" ? options.isStateObject : defaultIsStateObject;
  const mergeStateObjects =
    typeof options.mergeStateObjects === "function" ? options.mergeStateObjects : defaultMergeStateObjects;
  const logger = options.logger && typeof options.logger.warn === "function" ? options.logger : console;

  try {
    const startupState = await loadStartupStateFromJsonValue(startupStateValue, {
      isStateObject,
      mergeStateObjects,
      baseOrigin:
        typeof options.baseOrigin === "string"
          ? options.baseOrigin
          : typeof globalThis.location?.origin === "string"
            ? globalThis.location.origin
            : "http://localhost",
      fetchFn: options.fetchFn,
      cache: options.cache
    });
    if (!startupState) {
      logger.warn("Invalid startup-state payload, skipping startup state initialization.");
      return null;
    }

    const shouldKeepEmptyWidgets = normalizeStartupStateBoolean(
      searchParams.get(options.startupStateEmptyWidgetsQueryKey || STARTUP_STATE_EMPTY_WIDGETS_QUERY_KEY)
    );
    if (shouldKeepEmptyWidgets && !Array.isArray(startupState.instances)) {
      startupState.instances = [];
    }

    return startupState;
  } catch (error) {
    logger.warn("Failed to load startup-state", error);
    return null;
  }
}

export async function loadStartupStateFromConfigFile(options = {}) {
  const runtimeGetUrl =
    typeof options.runtimeGetUrl === "function"
      ? options.runtimeGetUrl
      : typeof globalThis.chrome?.runtime?.getURL === "function"
        ? globalThis.chrome.runtime.getURL.bind(globalThis.chrome.runtime)
        : null;
  if (!runtimeGetUrl) {
    return null;
  }

  return loadStartupStateFromJsonValue(runtimeGetUrl(options.startupStateJsonPath || STARTUP_STATE_JSON_PATH), {
    isStateObject: options.isStateObject,
    mergeStateObjects: options.mergeStateObjects,
    baseOrigin: options.baseOrigin,
    fetchFn: options.fetchFn,
    cache: options.cache
  });
}

export async function resolveStartupStateDefault(options = {}) {
  const defaultState = typeof options.defaultState === "function" ? options.defaultState : () => ({});
  const isStateObject = typeof options.isStateObject === "function" ? options.isStateObject : defaultIsStateObject;
  const mergeStateObjects =
    typeof options.mergeStateObjects === "function" ? options.mergeStateObjects : defaultMergeStateObjects;
  const base = defaultState();

  const startupState = await loadStartupStateFromConfigFile({
    isStateObject,
    mergeStateObjects,
    startupStateJsonPath: options.startupStateJsonPath,
    runtimeGetUrl: options.runtimeGetUrl,
    baseOrigin: options.baseOrigin,
    fetchFn: options.fetchFn,
    cache: options.cache
  });

  if (!isStateObject(startupState)) {
    return base;
  }
  return mergeStateObjects(base, startupState);
}
