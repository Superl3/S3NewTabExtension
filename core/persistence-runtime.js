export function createPersistenceRuntime(deps) {
  const isStateObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const structuredCloneValue =
    typeof deps.structuredClone === "function"
      ? (value) => Reflect.apply(deps.structuredClone, globalThis, [value])
      : (value) => globalThis.structuredClone(value);
  const scheduleTimeout =
    typeof deps.setTimeout === "function"
      ? (...args) => Reflect.apply(deps.setTimeout, globalThis, args)
      : (...args) => globalThis.setTimeout(...args);
  const clearScheduledTimeout =
    typeof deps.clearTimeout === "function"
      ? (...args) => Reflect.apply(deps.clearTimeout, globalThis, args)
      : (...args) => globalThis.clearTimeout(...args);

  function snapshotFingerprint(snapshot) {
    try {
      return JSON.stringify(snapshot);
    } catch {
      return `${deps.now()}-${deps.randomToken()}`;
    }
  }

  function nextPersistFingerprint(snapshot, userMutationAt, allowNonUserMutation) {
    if (!allowNonUserMutation && userMutationAt > 0) {
      return `u:${userMutationAt}`;
    }
    return snapshotFingerprint(snapshot);
  }

  function readUserMutationClock(source = deps.getState()) {
    const raw = Number(source?.meta?.lastUserMutationAt);
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.max(0, Math.floor(raw));
  }

  function touchUserMutationClock() {
    const state = deps.getState();
    if (!state) {
      return 0;
    }

    if (!state.meta || typeof state.meta !== "object") {
      state.meta = {
        lastUserMutationAt: 0
      };
    }

    const baseline = Math.max(readUserMutationClock(state), deps.getLastSavedUserMutationAt());
    const next = Math.max(deps.now(), baseline + 1);
    state.meta.lastUserMutationAt = next;
    return next;
  }

  function normalizeStoredSnapshot(value) {
    if (!isStateObject(value)) {
      return null;
    }
    const normalized = structuredCloneValue(value);
    deps.applyRuntimeOnlyPolicyToSnapshot(normalized);
    return normalized;
  }

  async function readStoredSnapshot() {
    try {
      const stored = await deps.chromeStorageLocalGet(deps.storageKey);
      return normalizeStoredSnapshot(stored?.[deps.storageKey]);
    } catch {
      return null;
    }
  }

  function syncFromExternalSnapshot(snapshotInput) {
    const snapshot = normalizeStoredSnapshot(snapshotInput);
    const state = deps.getState();
    if (!snapshot || !state) {
      return false;
    }

    const incomingFingerprint = snapshotFingerprint(snapshot);
    const incomingMutationAt = readUserMutationClock(snapshot);
    const localMutationAt = readUserMutationClock(state);

    deps.setLastSavedUserMutationAt(Math.max(deps.getLastSavedUserMutationAt(), incomingMutationAt));

    if (incomingFingerprint === deps.getLastSavedFingerprint() || incomingMutationAt <= localMutationAt) {
      return false;
    }

    deps.setLastSavedFingerprint(incomingFingerprint);
    deps.setSaveInFlightFingerprint("");
    deps.clearUndoRedo();
    deps.restoreFromSnapshot(snapshot, { shouldSave: false });
    return true;
  }

  async function saveSnapshotIfNotStale(snapshot, fingerprint, userMutationAt) {
    const storedSnapshot = await readStoredSnapshot();
    const storedMutationAt = readUserMutationClock(storedSnapshot);

    if (storedMutationAt > userMutationAt) {
      deps.setLastSavedUserMutationAt(Math.max(deps.getLastSavedUserMutationAt(), storedMutationAt));
      syncFromExternalSnapshot(storedSnapshot);
      return false;
    }

    await deps.saveState(snapshot);
    deps.setLastSavedFingerprint(fingerprint);
    deps.setLastSavedUserMutationAt(Math.max(deps.getLastSavedUserMutationAt(), userMutationAt));
    return true;
  }

  function persistLatestSnapshot({ allowNonUserMutation = false } = {}) {
    if (!deps.getState()) {
      return;
    }

    const userMutationAt = readUserMutationClock(deps.getState());
    if (!allowNonUserMutation && userMutationAt <= deps.getLastSavedUserMutationAt()) {
      return;
    }

    const snapshot = deps.buildPersistSnapshot();
    const fingerprint = nextPersistFingerprint(snapshot, userMutationAt, allowNonUserMutation);
    if (!fingerprint) {
      return;
    }

    if (fingerprint === deps.getLastSavedFingerprint() || fingerprint === deps.getSaveInFlightFingerprint()) {
      return;
    }

    deps.setSaveInFlightFingerprint(fingerprint);

    const executeSave = async () => {
      try {
        await saveSnapshotIfNotStale(snapshot, fingerprint, userMutationAt);
      } catch (error) {
        deps.onPersistError(error);
      } finally {
        if (deps.getSaveInFlightFingerprint() === fingerprint) {
          deps.setSaveInFlightFingerprint("");
        }
      }
    };

    deps.setSaveChain(deps.getSaveChain().then(executeSave, executeSave));
  }

  function flushPendingSave(options = {}) {
    if (!deps.getState()) {
      return;
    }

    if (deps.getSaveTimer()) {
      clearScheduledTimeout(deps.getSaveTimer());
      deps.setSaveTimer(null);
    }

    const allowNonUserMutation = deps.getSaveAllowsNonUserMutation() || options.allowWithoutUserMutation === true;
    deps.setSaveAllowsNonUserMutation(false);
    persistLatestSnapshot({ allowNonUserMutation });
  }

  function queueSave(options = {}) {
    if (!deps.getState()) {
      return;
    }

    const allowWithoutUserMutation = options.allowWithoutUserMutation === true;
    deps.setSaveAllowsNonUserMutation(deps.getSaveAllowsNonUserMutation() || allowWithoutUserMutation);

    if (deps.getSaveTimer()) {
      clearScheduledTimeout(deps.getSaveTimer());
    }

    deps.setSaveTimer(
      scheduleTimeout(() => {
        flushPendingSave();
      }, 150)
    );
  }

  function wireStorageSync() {
    if (!deps.chromeStorageOnChangedAddListener) {
      return;
    }

    deps.chromeStorageOnChangedAddListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      const changed = changes?.[deps.storageKey];
      if (!changed || !Object.prototype.hasOwnProperty.call(changed, "newValue")) {
        return;
      }
      syncFromExternalSnapshot(changed.newValue);
    });
  }

  return {
    snapshotFingerprint,
    nextPersistFingerprint,
    normalizeStoredSnapshot,
    readStoredSnapshot,
    saveSnapshotIfNotStale,
    syncFromExternalSnapshot,
    wireStorageSync,
    readUserMutationClock,
    touchUserMutationClock,
    persistLatestSnapshot,
    flushPendingSave,
    queueSave
  };
}
