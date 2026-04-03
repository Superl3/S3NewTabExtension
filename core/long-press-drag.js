function resolveTimerApi(timerApi = null) {
  const source = timerApi || globalThis.window || globalThis;
  return {
    setTimeout: typeof source?.setTimeout === "function" ? source.setTimeout.bind(source) : null,
    clearTimeout: typeof source?.clearTimeout === "function" ? source.clearTimeout.bind(source) : null
  };
}

function resolveEventTarget(eventTarget = null) {
  return eventTarget || globalThis.window || null;
}

function resolveClassListAdapter(card = null) {
  const classList = card?.classList;
  return {
    add(className) {
      classList?.add?.(className);
    },
    remove(className) {
      classList?.remove?.(className);
    }
  };
}

function isValidPrimaryButton(event) {
  if (!event || !Number.isFinite(event.button)) {
    return true;
  }
  return event.button === 0 || event.button === -1;
}

function movedPastTolerance(startX, startY, clientX, clientY, tolerance) {
  return Math.hypot(clientX - startX, clientY - startY) > tolerance;
}

export function createLongPressDragController({
  card = null,
  widgetLongPressState = null,
  isEditMode = () => false,
  onTrigger = null,
  isShortcutTarget = () => false,
  longPressDelayMs = 340,
  shortcutDelayMs = 220,
  baseMoveTolerance = 18,
  shortcutMoveToleranceDelta = 10,
  eventTarget = null,
  timerApi = null
} = {}) {
  const listeners = resolveEventTarget(eventTarget);
  const timers = resolveTimerApi(timerApi);
  const classes = resolveClassListAdapter(card);

  const state = {
    timerId: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    moveTolerance: baseMoveTolerance,
    target: null
  };

  const clear = () => {
    if (state.timerId !== null) {
      timers.clearTimeout?.(state.timerId);
      state.timerId = null;
    }

    listeners?.removeEventListener?.("pointermove", handlePointerMove);
    listeners?.removeEventListener?.("pointerup", handlePointerEnd);
    listeners?.removeEventListener?.("pointercancel", handlePointerEnd);
    listeners?.removeEventListener?.("mousemove", handleMouseMove);
    listeners?.removeEventListener?.("mouseup", handleMouseEnd);

    classes.remove("longpress-drag-armed");
    if (widgetLongPressState) {
      widgetLongPressState.pending = false;
      widgetLongPressState.pointerId = null;
    }

    state.pointerId = null;
    state.startX = 0;
    state.startY = 0;
    state.moveTolerance = baseMoveTolerance;
    state.target = null;
  };

  const handlePointerMove = (moveEvent) => {
    if (state.pointerId !== null && moveEvent.pointerId !== state.pointerId) {
      return;
    }
    if (movedPastTolerance(state.startX, state.startY, moveEvent.clientX, moveEvent.clientY, state.moveTolerance)) {
      clear();
    }
  };

  const handlePointerEnd = (endEvent) => {
    if (state.pointerId !== null && endEvent.pointerId !== state.pointerId) {
      return;
    }
    clear();
  };

  const handleMouseMove = (moveEvent) => {
    if (movedPastTolerance(state.startX, state.startY, moveEvent.clientX, moveEvent.clientY, state.moveTolerance)) {
      clear();
    }
  };

  const handleMouseEnd = () => {
    clear();
  };

  const schedule = (event, target) => {
    if (isEditMode()) {
      return false;
    }
    if (!isValidPrimaryButton(event)) {
      return false;
    }

    const pointerStartX = event?.clientX;
    const pointerStartY = event?.clientY;
    if (!Number.isFinite(pointerStartX) || !Number.isFinite(pointerStartY)) {
      return false;
    }

    clear();

    state.pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
    state.startX = pointerStartX;
    state.startY = pointerStartY;
    const shortcut = Boolean(isShortcutTarget(target));
    const delayMs = shortcut ? shortcutDelayMs : longPressDelayMs;
    state.moveTolerance = shortcut ? baseMoveTolerance + shortcutMoveToleranceDelta : baseMoveTolerance;
    state.target = target || null;

    classes.add("longpress-drag-armed");
    if (widgetLongPressState) {
      widgetLongPressState.pending = true;
      widgetLongPressState.pointerId = state.pointerId;
    }

    if (state.pointerId !== null) {
      listeners?.addEventListener?.("pointermove", handlePointerMove, { passive: true });
      listeners?.addEventListener?.("pointerup", handlePointerEnd, { passive: true });
      listeners?.addEventListener?.("pointercancel", handlePointerEnd, { passive: true });
    } else {
      listeners?.addEventListener?.("mousemove", handleMouseMove);
      listeners?.addEventListener?.("mouseup", handleMouseEnd);
    }

    state.timerId = timers.setTimeout?.(() => {
      const dragTarget = state.target;
      const dragStartX = state.startX;
      const dragStartY = state.startY;
      clear();
      if (typeof onTrigger === "function") {
        onTrigger({
          target: dragTarget,
          startX: dragStartX,
          startY: dragStartY
        });
      }
    }, delayMs) ?? null;

    return true;
  };

  return {
    clear,
    schedule,
    state
  };
}
