import {
  DROP_CONTAINER_KIND,
  DROP_PLAN_KIND,
  createBoardPageDropPlan,
  createBoardPlaceholderDropPlan,
  createContainerDropPlan,
  createDeleteZoneDropPlan,
  createNoneDropPlan,
  isBoardPlaceholderDropPlan,
  isBoardRealPageDropPlan,
  isContainerDropPlan,
  placeholderEdgeFromInternalPlaceholder,
  policyPlaceholderPageFromInternalPlaceholder,
  policyRealPageFromInternalPage
} from "./launcherDropPlan.js";
import { normalizeContainerId } from "./container-state.js";

function invoke(fn, ...args) {
  if (typeof fn !== "function") {
    return undefined;
  }
  return fn(...args);
}

function normalizeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.floor(numeric);
}

export function buildDropPlanProjection(layout = null, page = 0, gridLayout = null) {
  if (!layout) {
    return null;
  }
  return {
    layout,
    page: normalizeInteger(page, 0),
    gridLayout: gridLayout || null
  };
}

export function resolveWidgetDropPlan(
  instance,
  payload = {},
  {
    boardProjection = null,
    suppressSurfaceTargets = false,
    allowDeleteZone = true
  } = {},
  deps = {}
) {
  if (suppressSurfaceTargets) {
    return createNoneDropPlan();
  }

  const {
    currentLauncherPageCount,
    currentLauncherActivePage,
    isPointOverDragDeleteZone,
    containerDropTargetAtPoint,
    resolveContainerInsertIndexFromPointer,
    projectContainerSilhouetteLayoutFromPointer,
    isDockDropPoint,
    isDockEligibleWidget,
    projectDockSilhouetteLayoutFromPointer,
    resolveDockDropSlotIndex,
    isPlaceholderLauncherPage,
    normalizeWidgetPage,
    projectWidgetBoardDropLayout
  } = deps;

  const pageCount = Math.max(1, normalizeInteger(invoke(currentLauncherPageCount), 1));
  const activePage = normalizeInteger(invoke(currentLauncherActivePage), 0);
  const normalizePage = (page, fallback = activePage) => {
    if (typeof normalizeWidgetPage === "function") {
      return normalizeWidgetPage(page, pageCount, fallback);
    }
    return normalizeInteger(page, fallback);
  };
  const isPlaceholderPage = (page) => Boolean(invoke(isPlaceholderLauncherPage, page, pageCount));

  const clientX = Number(payload?.clientX);
  const clientY = Number(payload?.clientY);
  const requestedPage = Number(payload?.page);

  if (allowDeleteZone && invoke(isPointOverDragDeleteZone, clientX, clientY)) {
    return createDeleteZoneDropPlan();
  }

  const containerDropTargetId = invoke(containerDropTargetAtPoint, clientX, clientY, instance);
  if (containerDropTargetId) {
    const insertIndex = invoke(resolveContainerInsertIndexFromPointer, containerDropTargetId, clientX, clientY, {
      excludeWidgetId: instance?.id,
      panelElement: payload?.panelElement
    });
    const projection = buildDropPlanProjection(
      invoke(projectContainerSilhouetteLayoutFromPointer, containerDropTargetId, clientX, clientY, instance?.id),
      0,
      null
    );
    return createContainerDropPlan({
      containerKind: DROP_CONTAINER_KIND.FOLDER,
      containerId: containerDropTargetId,
      insertIndex,
      projection
    });
  }

  const dockDropActive = Boolean(invoke(isDockDropPoint, clientX, clientY) && invoke(isDockEligibleWidget, instance));
  if (dockDropActive) {
    const projection = buildDropPlanProjection(
      invoke(projectDockSilhouetteLayoutFromPointer, clientX, clientY, instance?.id),
      0,
      null
    );
    const insertIndex = invoke(resolveDockDropSlotIndex, clientX, clientY, instance) ?? 0;
    return createContainerDropPlan({
      containerKind: DROP_CONTAINER_KIND.DOCK,
      insertIndex,
      projection
    });
  }

  const requestedInternalPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : null;
  if (requestedInternalPage !== null && isPlaceholderPage(requestedInternalPage)) {
    const edge = placeholderEdgeFromInternalPlaceholder(requestedInternalPage, pageCount);
    return createBoardPlaceholderDropPlan({
      edge,
      policyPlaceholderPage: policyPlaceholderPageFromInternalPlaceholder(requestedInternalPage, pageCount),
      internalPlaceholderPage: requestedInternalPage,
      projection: null
    });
  }

  const fallbackProjection = invoke(projectWidgetBoardDropLayout, instance, payload, {
    pageFallback: activePage
  });
  const projected = boardProjection || fallbackProjection;
  if (!projected?.layout) {
    return createNoneDropPlan();
  }

  const internalPage = normalizePage(projected.page, activePage);
  const projection = buildDropPlanProjection(projected.layout, internalPage, projected.gridLayout || null);

  if (isPlaceholderPage(internalPage)) {
    const edge = placeholderEdgeFromInternalPlaceholder(internalPage, pageCount);
    return createBoardPlaceholderDropPlan({
      edge,
      policyPlaceholderPage: policyPlaceholderPageFromInternalPlaceholder(internalPage, pageCount),
      internalPlaceholderPage: internalPage,
      projection
    });
  }

  return createBoardPageDropPlan({
    policyPage: policyRealPageFromInternalPage(internalPage),
    internalPage,
    projection
  });
}

export function applyDropPlanIndicators(plan, { silhouette = null } = {}, deps = {}) {
  const {
    currentLauncherPageCount,
    currentLauncherActivePage,
    normalizeWidgetPage,
    setContainerDropTargetActive,
    setDockDropTargetActive,
    setDragDeleteZoneHover,
    positionWidgetDropSilhouette,
    setWidgetDropSilhouetteVisible
  } = deps;

  const pageCount = Math.max(1, normalizeInteger(invoke(currentLauncherPageCount), 1));
  const activePage = normalizeInteger(invoke(currentLauncherActivePage), 0);
  const normalizePage = (page) => {
    if (typeof normalizeWidgetPage === "function") {
      return normalizeWidgetPage(page, pageCount, activePage);
    }
    return normalizeInteger(page, activePage);
  };

  const safePlan = plan || createNoneDropPlan();
  const deleteHovering = safePlan.kind === DROP_PLAN_KIND.DELETE_ZONE;

  let containerDropTargetId = "";
  let dockDropActive = false;
  let projectedLayout = null;
  let projectedPage = 0;
  let showBoardSilhouette = false;

  if (isContainerDropPlan(safePlan)) {
    if (safePlan.space.container.kind === DROP_CONTAINER_KIND.FOLDER) {
      containerDropTargetId = normalizeContainerId(safePlan.space.container.folderId);
    } else if (safePlan.space.container.kind === DROP_CONTAINER_KIND.DOCK) {
      dockDropActive = true;
    }
  } else if (isBoardRealPageDropPlan(safePlan) || isBoardPlaceholderDropPlan(safePlan)) {
    showBoardSilhouette = true;
  }

  if (safePlan.projection?.layout) {
    projectedLayout = safePlan.projection.layout;
    projectedPage = normalizePage(safePlan.projection.page);
  }

  invoke(setContainerDropTargetActive, containerDropTargetId);
  invoke(setDockDropTargetActive, dockDropActive);
  invoke(setDragDeleteZoneHover, deleteHovering);

  const visible = Boolean(projectedLayout);
  if (visible) {
    invoke(positionWidgetDropSilhouette, silhouette, projectedLayout, projectedPage);
  }
  invoke(setWidgetDropSilhouetteVisible, silhouette, visible);

  return {
    plan: safePlan,
    deleteHovering,
    containerDropTargetId,
    dockDropActive,
    showBoardSilhouette: visible && showBoardSilhouette
  };
}

export function updateCrossSurfaceDropIndicators(
  instance,
  clientX,
  clientY,
  {
    silhouette = null,
    boardProjection = null,
    suppressSurfaceTargets = false,
    dropPlan = null
  } = {},
  deps = {}
) {
  const resolvedPlan =
    dropPlan ||
    resolveWidgetDropPlan(
      instance,
      { clientX, clientY },
      {
        boardProjection,
        suppressSurfaceTargets,
        allowDeleteZone: !suppressSurfaceTargets
      },
      deps
    );
  return applyDropPlanIndicators(resolvedPlan, { silhouette }, deps);
}
