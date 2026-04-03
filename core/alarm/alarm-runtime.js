function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function isAlarmEventCandidate(value) {
  return Boolean(value) && typeof value === "object" && typeof value.key === "string" && value.key && Number.isFinite(value.at);
}

function normalizeTimeoutApi(scheduleTimeout, clearScheduledTimeout) {
  return {
    scheduleTimeout: typeof scheduleTimeout === "function" ? scheduleTimeout : setTimeout,
    clearScheduledTimeout: typeof clearScheduledTimeout === "function" ? clearScheduledTimeout : clearTimeout
  };
}

export function createAlarmRuntime(options = {}) {
  const {
    listOwnerEvents,
    emitEvent,
    getNow = () => Date.now(),
    tickMs = 30 * 1000,
    dedupeTtlMs = 3 * 24 * 60 * 60 * 1000,
    maxCatchupMs = 2 * 60 * 1000,
    scheduleTimeout,
    clearScheduledTimeout
  } = options;

  if (typeof listOwnerEvents !== "function") {
    throw new TypeError("createAlarmRuntime requires listOwnerEvents.");
  }
  if (typeof emitEvent !== "function") {
    throw new TypeError("createAlarmRuntime requires emitEvent.");
  }
  if (!isPositiveFiniteNumber(tickMs) || !isPositiveFiniteNumber(dedupeTtlMs) || !isPositiveFiniteNumber(maxCatchupMs)) {
    throw new TypeError("Alarm runtime timing options must be positive finite numbers.");
  }

  const owners = new Map();
  const fired = new Map();
  const timeoutApi = normalizeTimeoutApi(scheduleTimeout, clearScheduledTimeout);
  let timer = null;
  let lastTickMs = getNow() - 1000;

  function clearTimer() {
    if (!timer) {
      return;
    }
    timeoutApi.clearScheduledTimeout(timer);
    timer = null;
  }

  function scheduleNextTick() {
    clearTimer();
    if (owners.size === 0) {
      return;
    }
    timer = timeoutApi.scheduleTimeout(tick, tickMs);
  }

  function cleanupFired(now) {
    for (const [key, firedAt] of fired.entries()) {
      if (now - firedAt > dedupeTtlMs) {
        fired.delete(key);
      }
    }
  }

  function isEventWithinRange(event, rangeStartMs, rangeEndMs) {
    return isAlarmEventCandidate(event) && event.at > rangeStartMs && event.at <= rangeEndMs;
  }

  function fireEvent(event, owner, now) {
    if (fired.has(event.key)) {
      return;
    }
    const didEmit = emitEvent(event, owner, now);
    if (didEmit === false) {
      return;
    }
    fired.set(event.key, now);
  }

  function tick() {
    timer = null;
    if (owners.size === 0) {
      return;
    }

    const now = getNow();
    const safeLastTickMs = Math.min(lastTickMs, now);
    const rangeStartMs = Math.max(safeLastTickMs, now - maxCatchupMs);

    cleanupFired(now);

    for (const [ownerId, owner] of owners.entries()) {
      const events = listOwnerEvents(owner, rangeStartMs, now, ownerId);
      const eventList = Array.isArray(events) ? events : [];
      for (const event of eventList) {
        if (!isEventWithinRange(event, rangeStartMs, now)) {
          continue;
        }
        fireEvent(event, owner, now);
      }
    }

    lastTickMs = now;
    scheduleNextTick();
  }

  return {
    register(ownerId, owner) {
      owners.set(ownerId, owner);
      tick();
    },
    unregister(ownerId) {
      owners.delete(ownerId);
      if (owners.size === 0) {
        clearTimer();
      }
    },
    kick() {
      tick();
    }
  };
}
