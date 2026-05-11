export function createHistoryUndoRuntime(deps) {
  function recordHistorySnapshot(label = "Update") {
    const undoState = deps.getUndoState();
    if (undoState.isRestoring || !deps.getState()) {
      return;
    }

    const snapshot = deps.buildHistorySnapshot();
    const fingerprint = deps.snapshotFingerprint(snapshot);
    const last = undoState.undoStack[undoState.undoStack.length - 1];

    deps.touchUserMutationClock();

    if (last?.fingerprint === fingerprint) {
      return;
    }

    undoState.undoStack.push({
      label,
      snapshot,
      fingerprint
    });

    if (undoState.undoStack.length > deps.historyLimit) {
      undoState.undoStack.shift();
    }

    undoState.redoStack.length = 0;
  }

  function undoLastChange() {
    const undoState = deps.getUndoState();
    if (!undoState.undoStack.length || !deps.getState()) {
      return;
    }

    const current = deps.buildHistorySnapshot();
    undoState.redoStack.push({
      label: "Redo",
      snapshot: current,
      fingerprint: deps.snapshotFingerprint(current)
    });
    if (undoState.redoStack.length > deps.historyLimit) {
      undoState.redoStack.shift();
    }

    const target = undoState.undoStack.pop();
    if (!target?.snapshot) {
      return;
    }

    const snapshot = deps.materializeHistorySnapshot(target.snapshot);

    undoState.isRestoring = true;
    try {
      deps.restoreFromSnapshot(snapshot, { markAsUserMutation: true });
    } finally {
      undoState.isRestoring = false;
    }
  }

  function redoLastChange() {
    const undoState = deps.getUndoState();
    if (!undoState.redoStack.length || !deps.getState()) {
      return;
    }

    const current = deps.buildHistorySnapshot();
    undoState.undoStack.push({
      label: "Undo",
      snapshot: current,
      fingerprint: deps.snapshotFingerprint(current)
    });
    if (undoState.undoStack.length > deps.historyLimit) {
      undoState.undoStack.shift();
    }

    const target = undoState.redoStack.pop();
    if (!target?.snapshot) {
      return;
    }

    const snapshot = deps.materializeHistorySnapshot(target.snapshot);

    undoState.isRestoring = true;
    try {
      deps.restoreFromSnapshot(snapshot, { markAsUserMutation: true });
    } finally {
      undoState.isRestoring = false;
    }
  }

  return {
    recordHistorySnapshot,
    undoLastChange,
    redoLastChange
  };
}
