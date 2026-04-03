export function createContainerOrderRuntime(deps) {
  function moveInstanceToStateIndex(instanceId, destinationIndex) {
    const state = deps.getState();
    const list = state?.instances;
    if (!Array.isArray(list) || !list.length) {
      return false;
    }

    const fromIndex = list.findIndex((item) => String(item?.id) === String(instanceId));
    if (fromIndex < 0) {
      return false;
    }

    const boundedIndex = deps.clamp(Math.round(Number(destinationIndex) || 0), 0, list.length);
    const targetIndex = fromIndex < boundedIndex ? boundedIndex - 1 : boundedIndex;
    if (fromIndex === targetIndex) {
      return false;
    }

    const [moved] = list.splice(fromIndex, 1);
    list.splice(deps.clamp(targetIndex, 0, list.length), 0, moved);
    return true;
  }

  function appendWidgetToContainerOrder(instanceId, containerId) {
    const state = deps.getState();
    const targetContainerId = deps.normalizeContainerId(containerId);
    if (!targetContainerId) {
      return false;
    }

    const siblings = (state?.instances || []).filter((entry) => {
      return (
        entry &&
        String(entry.id) !== String(instanceId) &&
        entry.type !== "container" &&
        deps.normalizeContainerId(entry.containerId) === targetContainerId
      );
    });

    if (siblings.length) {
      const lastSiblingId = String(siblings[siblings.length - 1].id);
      const lastSiblingIndex = state.instances.findIndex((entry) => String(entry?.id) === lastSiblingId);
      if (lastSiblingIndex >= 0) {
        return moveInstanceToStateIndex(instanceId, lastSiblingIndex + 1);
      }
    }

    const containerIndex = state.instances.findIndex((entry) => String(entry?.id) === targetContainerId);
    if (containerIndex >= 0) {
      return moveInstanceToStateIndex(instanceId, containerIndex + 1);
    }
    return false;
  }

  function reorderWidgetInContainerByIndex(
    widgetId,
    containerId,
    insertIndex,
    { record = true, rerender = true, save = true } = {}
  ) {
    const state = deps.getState();
    const targetContainerId = deps.normalizeContainerId(containerId);
    const instance = deps.instanceById(widgetId);
    if (!instance || instance.type === "container" || !targetContainerId) {
      return false;
    }
    if (deps.normalizeContainerId(instance.containerId) !== targetContainerId) {
      return false;
    }

    const siblings = (state?.instances || []).filter((entry) => {
      return (
        entry &&
        entry.type !== "container" &&
        deps.normalizeContainerId(entry.containerId) === targetContainerId &&
        String(entry.id) !== String(widgetId)
      );
    });
    const clampedInsertIndex = deps.clamp(Math.round(Number(insertIndex) || 0), 0, siblings.length);

    let changed = false;
    if (clampedInsertIndex < siblings.length) {
      const beforeId = String(siblings[clampedInsertIndex].id);
      const destinationIndex = state.instances.findIndex((entry) => String(entry?.id) === beforeId);
      if (destinationIndex >= 0) {
        changed = moveInstanceToStateIndex(widgetId, destinationIndex);
      }
    } else if (siblings.length) {
      const lastSiblingId = String(siblings[siblings.length - 1].id);
      const destinationIndex = state.instances.findIndex((entry) => String(entry?.id) === lastSiblingId);
      if (destinationIndex >= 0) {
        changed = moveInstanceToStateIndex(widgetId, destinationIndex + 1);
      }
    }

    if (!changed) {
      return false;
    }

    if (record) {
      deps.recordHistorySnapshot("Reorder folder widget");
    } else {
      deps.touchUserMutationClock();
    }

    if (rerender) {
      deps.renderBoard();
      deps.renderSettings();
    } else {
      deps.refreshWidgetsByType("container");
    }

    if (save) {
      deps.queueSave();
    }
    return true;
  }

  return {
    moveInstanceToStateIndex,
    appendWidgetToContainerOrder,
    reorderWidgetInContainerByIndex
  };
}
