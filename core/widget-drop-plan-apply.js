import {
  DROP_CONTAINER_KIND,
  DROP_PLAN_KIND,
  internalPlaceholderFromPlaceholderEdge,
  isBoardPlaceholderDropPlan,
  isBoardRealPageDropPlan,
  isContainerDropPlan
} from "./launcherDropPlan.js";

export function applyWidgetDropPlanByKind(
  instance,
  plan,
  payload = {},
  { record = true } = {},
  deps = {}
) {
  if (!instance || !plan || plan.kind === DROP_PLAN_KIND.NONE) {
    return false;
  }

  if (plan.kind === DROP_PLAN_KIND.DELETE_ZONE) {
    deps.clearPendingPlaceholderDrop?.({ clearVirtualPage: true });
    deps.removeWidget?.(instance.id);
    return true;
  }

  if (!isContainerDropPlan(plan) && !isBoardRealPageDropPlan(plan) && !isBoardPlaceholderDropPlan(plan)) {
    return false;
  }

  if (isContainerDropPlan(plan)) {
    deps.clearPendingPlaceholderDrop?.({ clearVirtualPage: true });
    if (plan.space.container.kind === DROP_CONTAINER_KIND.DOCK) {
      const moved = deps.tryDockWidgetByDrop?.(instance, payload, { record });
      if (moved) {
        deps.renderBoard?.();
        deps.queueSave?.();
      }
      return Boolean(moved);
    }

    if (plan.space.container.kind === DROP_CONTAINER_KIND.FOLDER) {
      return Boolean(deps.tryContainerWidgetByDrop?.(instance, payload, { record }));
    }
    return false;
  }

  if (isBoardPlaceholderDropPlan(plan)) {
    const pageCount = deps.currentLauncherPageCount?.();
    const edge = plan.space.board.edge;
    const placeholderPage = Number.isFinite(Number(plan.space.board.internalPlaceholderPage))
      ? Math.floor(Number(plan.space.board.internalPlaceholderPage))
      : internalPlaceholderFromPlaceholderEdge(edge, pageCount);
    return Boolean(
      deps.commitPlaceholderPageDrop?.(
        instance.id,
        {
          ...payload,
          page: placeholderPage
        },
        placeholderPage
      )
    );
  }

  if (isBoardRealPageDropPlan(plan)) {
    deps.clearPendingPlaceholderDrop?.({ clearVirtualPage: true });
    const targetPage = deps.normalizeWidgetPage?.(
      plan.space.board.internalPage,
      deps.currentLauncherPageCount?.(),
      deps.currentLauncherActivePage?.()
    );
    const boardPayload = {
      ...payload,
      page: targetPage
    };
    if (deps.isWidgetDocked?.(instance)) {
      return Boolean(deps.releaseWidgetFromDockByDrop?.(instance.id, boardPayload));
    }
    if (deps.isWidgetInContainer?.(instance)) {
      return Boolean(deps.releaseWidgetFromContainerByDrop?.(instance.id, boardPayload));
    }

    const targetLayoutPatch =
      plan.projection?.layout && typeof plan.projection.layout === "object"
        ? plan.projection.layout
        : null;
    const targetGridLayout =
      plan.projection?.gridLayout && typeof plan.projection.gridLayout === "object"
        ? plan.projection.gridLayout
        : null;

    const nextLayout = targetLayoutPatch
      ? {
          ...instance.layout,
          ...targetLayoutPatch
        }
      : instance.layout;

    const layoutChanged =
      nextLayout.x !== instance.layout.x ||
      nextLayout.y !== instance.layout.y ||
      nextLayout.w !== instance.layout.w ||
      nextLayout.h !== instance.layout.h;

    const gridChanged = Boolean(targetGridLayout) && (
      !instance.gridLayout ||
      instance.gridLayout.col !== targetGridLayout.col ||
      instance.gridLayout.row !== targetGridLayout.row ||
      instance.gridLayout.colSpan !== targetGridLayout.colSpan ||
      instance.gridLayout.rowSpan !== targetGridLayout.rowSpan
    );

    const changed = targetPage !== instance.page || layoutChanged || gridChanged;
    if (!changed) {
      return false;
    }

    if (record) {
      deps.recordHistorySnapshot?.("Move widget");
    } else {
      deps.touchUserMutationClock?.();
    }

    instance.page = targetPage;
    if (targetLayoutPatch) {
      instance.layout = nextLayout;
    }
    if (targetGridLayout) {
      instance.gridLayout = targetGridLayout;
    }
    deps.setActivePage?.(targetPage);

    if (deps.isGridLayoutMode?.()) {
      deps.applyGridLayout?.({ commitFreeLayout: false, shouldSave: false });
    } else {
      const rt = deps.runtimeMap?.get?.(instance.id);
      if (rt?.card) {
        deps.applyLayout?.(rt.card, instance.layout, instance.page);
        if (instance.type === "container") {
          rt.controller?.refresh?.();
        }
      }
      deps.renderBoardViewport?.({ animate: true, dragging: false, dragOffsetX: 0 });
    }

    deps.compactEmptyLauncherPagesForUseMode?.();
    deps.renderSettings?.();
    deps.queueSave?.();
    return true;
  }

  return false;
}
