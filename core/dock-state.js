import { isWidgetInContainer } from "./container-state.js";
import { normalizeText } from "./utils/text.js";

export function normalizeDockOrder(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(0, Math.floor(num));
}

export function isWidgetDocked(instance) {
  return normalizeDockOrder(instance?.dockOrder, null) !== null;
}

export function nextDockOrder(instances = [], { isInContainer = isWidgetInContainer } = {}) {
  const items = Array.isArray(instances) ? instances : [];
  let maxOrder = -1;

  for (const item of items) {
    if (!item || item.enabled === false || isInContainer(item) || !isWidgetDocked(item)) {
      continue;
    }
    const current = normalizeDockOrder(item.dockOrder, -1);
    if (current >= 0 && current > maxOrder) {
      maxOrder = current;
    }
  }

  return maxOrder + 1;
}

export function dockSlotOccupants(instances = [], {
  slotCount = 1,
  excludeWidgetId = "",
  isInContainer = isWidgetInContainer
} = {}) {
  const count = Math.max(1, Math.floor(Number(slotCount) || 1));
  const excluded = normalizeText(excludeWidgetId);
  const occupied = new Map();
  const items = Array.isArray(instances) ? instances : [];

  for (const instance of items) {
    if (!instance || instance.enabled === false || !isWidgetDocked(instance) || isInContainer(instance)) {
      continue;
    }
    if (excluded && String(instance.id) === excluded) {
      continue;
    }
    const slot = normalizeDockOrder(instance.dockOrder, null);
    if (slot === null || slot < 0 || slot >= count || occupied.has(slot)) {
      continue;
    }
    occupied.set(slot, instance);
  }

  return occupied;
}

export function firstAvailableDockSlot(instances = [], {
  slotCount = 1,
  excludeWidgetId = "",
  isInContainer = isWidgetInContainer
} = {}) {
  const count = Math.max(1, Math.floor(Number(slotCount) || 1));
  const occupied = dockSlotOccupants(instances, {
    slotCount: count,
    excludeWidgetId,
    isInContainer
  });

  for (let slot = 0; slot < count; slot += 1) {
    if (!occupied.has(slot)) {
      return slot;
    }
  }
  return null;
}

export function normalizeDockedWidgetOrders(instances, {
  slotCount = 1,
  isInContainer = isWidgetInContainer
} = {}) {
  if (!Array.isArray(instances) || !instances.length) {
    return false;
  }

  const count = Math.max(1, Math.floor(Number(slotCount) || 1));
  const docked = instances
    .filter((instance) => instance && instance.enabled !== false && isWidgetDocked(instance) && !isInContainer(instance))
    .sort((a, b) => {
      const orderA = normalizeDockOrder(a.dockOrder, Number.MAX_SAFE_INTEGER);
      const orderB = normalizeDockOrder(b.dockOrder, Number.MAX_SAFE_INTEGER);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return String(a.id).localeCompare(String(b.id));
    });

  let changed = false;
  const occupied = new Set();
  const nextAvailableSlot = () => {
    for (let slot = 0; slot < count; slot += 1) {
      if (!occupied.has(slot)) {
        return slot;
      }
    }
    return null;
  };

  for (const instance of docked) {
    const current = normalizeDockOrder(instance.dockOrder, null);
    if (current !== null && current < count && !occupied.has(current)) {
      occupied.add(current);
      continue;
    }

    const fallback = nextAvailableSlot();
    if (fallback === null) {
      if (instance.dockOrder !== null) {
        instance.dockOrder = null;
        changed = true;
      }
      continue;
    }

    if (instance.dockOrder !== fallback) {
      instance.dockOrder = fallback;
      changed = true;
    }
    occupied.add(fallback);
  }

  for (const instance of instances) {
    if (!instance || !isWidgetDocked(instance) || !isInContainer(instance)) {
      continue;
    }
    instance.dockOrder = null;
    changed = true;
  }

  return changed;
}
