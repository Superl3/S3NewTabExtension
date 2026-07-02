import { resolveBrowserTimerApi } from "./platform/browser-api.js";

function normalizeHoldMs(value, fallback = 280) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numeric));
}

export function resolveEdgeDirectionFromPointer(clientX, viewportRect, threshold = 42) {
  const edgeThreshold = Math.max(0, Number(threshold) || 0);
  if (!viewportRect || !Number.isFinite(clientX) || viewportRect.width < edgeThreshold * 2) {
    return 0;
  }
  if (clientX <= viewportRect.left + edgeThreshold) {
    return -1;
  }
  if (clientX >= viewportRect.right - edgeThreshold) {
    return 1;
  }
  return 0;
}

export function createDeferredEdgeSwitchScheduler(
  {
    holdMs = 280,
    edgeDirectionFromPointer,
    getPointerX,
    onTriggered,
    timerApi = null
  } = {}
) {
  const timers = resolveBrowserTimerApi(timerApi);
  const waitMs = normalizeHoldMs(holdMs, 280);

  let pendingDirection = 0;
  let pendingTimer = 0;
  let pendingContext = null;

  const reset = () => {
    pendingDirection = 0;
    pendingContext = null;
    if (pendingTimer) {
      timers.clearTimeout?.(pendingTimer);
      pendingTimer = 0;
    }
  };

  const schedule = (direction, context = null) => {
    if (!direction) {
      reset();
      return false;
    }

    if (direction === pendingDirection && pendingTimer) {
      return false;
    }

    reset();
    pendingDirection = direction;
    pendingContext = context;
    pendingTimer = timers.setTimeout?.(() => {
      pendingTimer = 0;
      const pointerX = typeof getPointerX === "function" ? getPointerX() : Number.NaN;
      const currentDirection =
        typeof edgeDirectionFromPointer === "function"
          ? edgeDirectionFromPointer(pointerX)
          : 0;
      if (currentDirection !== direction) {
        reset();
        return;
      }

      const switched = Boolean(
        typeof onTriggered === "function"
          ? onTriggered(direction, pendingContext)
          : false
      );
      if (switched) {
        schedule(direction, pendingContext);
        return;
      }

      reset();
    }, waitMs) || 0;

    return false;
  };

  return {
    reset,
    schedule
  };
}
