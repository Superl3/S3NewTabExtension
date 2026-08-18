export function attachWidgetResizeHandle({
  resizeHandle,
  instance,
  getInstance,
  isEditMode,
  setSelected,
  isGridLayoutMode,
  recordHistorySnapshot,
  gridMetrics,
  normalizeGridLayout,
  widgetDefaultGridSize,
  widgetRegistry,
  startGridResizeSession,
  applyGridLayout,
  queueSave,
  setLastDragEndAt,
  startFreeResizeSession,
  patchWidgetLayout,
  touchUserMutationClock,
  updateBoardBounds,
  renderSettings,
  getBoardRect,
  snap,
  eventTarget
} = {}) {
  if (!resizeHandle || !instance) {
    return;
  }

  // Resolve the instance currently held in state; hydrate() replaces objects.
  const resolveInstance = () => getInstance?.() || instance;

  resizeHandle.addEventListener("pointerdown", (event) => {
    const instance = resolveInstance();
    if (!isEditMode?.()) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (instance.type === "container") {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    setSelected?.(instance.id);

    const startX = event.clientX;
    const startY = event.clientY;
    const startW = instance.layout.w;
    const startH = instance.layout.h;
    let liveResizeChanged = false;
    let finalResizeChanged = false;

    if (isGridLayoutMode?.()) {
      recordHistorySnapshot?.("Resize widget");
      const metrics = gridMetrics?.();
      const startGrid = normalizeGridLayout?.(instance.gridLayout, {
        col: 0,
        row: 0,
        ...widgetDefaultGridSize?.(instance.type, widgetRegistry?.[instance.type])
      });
      startGridResizeSession?.({
        startX,
        startY,
        startGrid,
        metrics,
        setGridLayout: (nextGrid) => {
          instance.gridLayout = nextGrid;
        },
        applyGridLayout: () => {
          applyGridLayout?.({ commitFreeLayout: false, shouldSave: false });
        },
        onComplete: () => {
          setLastDragEndAt?.(Date.now());
          applyGridLayout?.({ commitFreeLayout: false, shouldSave: false });
          queueSave?.();
        },
        eventTarget
      });
      return;
    }

    startFreeResizeSession?.({
      startX,
      startY,
      startW,
      startH,
      getLayoutPosition: () => ({ x: instance.layout.x, y: instance.layout.y }),
      getBoardRect,
      patchSize: (size, { commit = false } = {}) => {
        const changed = patchWidgetLayout?.(
          instance.id,
          {
            w: size.w,
            h: size.h
          },
          commit
            ? { label: "Resize widget" }
            : {
                record: false,
                touch: false,
                updateBounds: false,
                renderSettings: false,
                save: false
              }
        );
        if (commit) {
          finalResizeChanged = changed === true;
        } else {
          liveResizeChanged = liveResizeChanged || changed === true;
        }
      },
      onComplete: {
        getCurrentWidth: () => instance.layout.w,
        getCurrentHeight: () => instance.layout.h,
        afterCommit: () => {
          setLastDragEndAt?.(Date.now());
          if (liveResizeChanged && !finalResizeChanged) {
            touchUserMutationClock?.();
            updateBoardBounds?.();
            renderSettings?.();
            queueSave?.();
          }
        }
      },
      snap,
      eventTarget
    });
  });
}
