import { arrayOrEmpty } from "./utils/array.js";
import { callIfFunction as call } from "./utils/function.js";
import { toNonNegativeNumberOrFallback } from "./utils/number.js";

export function captureResetPreservedData(state, deps = {}) {
  const { readUserMutationClock, clonePresetSnapshot } = deps;

  const mutationClock = call(readUserMutationClock, state);
  const presets = arrayOrEmpty(state?.presets);
  const defaultProfileSnapshot =
    state?.ui?.defaultProfileSnapshot && typeof state.ui.defaultProfileSnapshot === "object"
      ? call(clonePresetSnapshot, state.ui.defaultProfileSnapshot)
      : null;
  const defaultProfileUpdatedAt = toNonNegativeNumberOrFallback(state?.ui?.defaultProfileUpdatedAt);

  return {
    mutationClock,
    presets,
    defaultProfileSnapshot,
    defaultProfileUpdatedAt
  };
}

export function restoreResetPreservedData(nextState, preserved = {}) {
  if (!nextState || typeof nextState !== "object") {
    return nextState;
  }

  nextState.meta = nextState.meta && typeof nextState.meta === "object" ? nextState.meta : {};
  nextState.meta.lastUserMutationAt = preserved.mutationClock;
  nextState.presets = arrayOrEmpty(preserved.presets);

  if (preserved.defaultProfileSnapshot) {
    nextState.ui = nextState.ui && typeof nextState.ui === "object" ? nextState.ui : {};
    nextState.ui.defaultProfileSnapshot = preserved.defaultProfileSnapshot;
    nextState.ui.defaultProfileUpdatedAt = preserved.defaultProfileUpdatedAt;
  }

  return nextState;
}
