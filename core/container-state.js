function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

export function normalizeContainerId(value) {
  return normalizeText(value);
}

export function isWidgetInContainer(instance) {
  return normalizeContainerId(instance?.containerId) !== "";
}

export function normalizeContainerAssignments(instances) {
  if (!Array.isArray(instances) || !instances.length) {
    return;
  }

  const validContainers = new Set(
    instances
      .filter((instance) => instance && instance.type === "container")
      .map((instance) => String(instance.id))
  );

  for (const instance of instances) {
    if (!instance || instance.type === "container") {
      if (instance) {
        instance.containerId = "";
      }
      continue;
    }

    const containerId = normalizeContainerId(instance.containerId);
    if (!containerId || !validContainers.has(containerId) || containerId === String(instance.id)) {
      instance.containerId = "";
      continue;
    }

    instance.containerId = containerId;
    instance.dockOrder = null;
  }
}
