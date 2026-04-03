import {
  createNoneDropPlan,
  DROP_PLAN_KIND,
  isBoardRealPageDropPlan
} from "./launcherDropPlan.js";

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.floor(numeric);
}

export function resolveDropPoint(pointerEvent, fallbackX, fallbackY) {
  const eventX = Number(pointerEvent?.clientX);
  const eventY = Number(pointerEvent?.clientY);
  const dropX = Number.isFinite(eventX) ? eventX : toFiniteNumber(fallbackX, 0);
  const dropY = Number.isFinite(eventY) ? eventY : toFiniteNumber(fallbackY, 0);
  return { dropX, dropY };
}

export function evaluateWidgetDropAtPointer(
  instance,
  {
    previewSession = null,
    clientX,
    clientY,
    page,
    pageFallback = page,
    suppressSurfaceTargets = false,
    allowDeleteZone = true
  } = {},
  deps = {}
) {
  const {
    buildDragPayloadWithPreviewOffset,
    currentLauncherPageCount,
    isPlaceholderLauncherPage,
    projectWidgetBoardDropLayout,
    resolveWidgetDropPlan
  } = deps;

  const internalPage = toInteger(page, 0);
  const payloadInput = {
    clientX: toFiniteNumber(clientX, 0),
    clientY: toFiniteNumber(clientY, 0),
    page: internalPage
  };
  const payload =
    typeof buildDragPayloadWithPreviewOffset === "function"
      ? buildDragPayloadWithPreviewOffset(previewSession, payloadInput)
      : payloadInput;

  const pageCount = Math.max(1, toInteger(
    typeof currentLauncherPageCount === "function" ? currentLauncherPageCount() : 1,
    1
  ));
  const isPlaceholder =
    typeof isPlaceholderLauncherPage === "function"
      ? Boolean(isPlaceholderLauncherPage(internalPage, pageCount))
      : false;

  const boardProjection = isPlaceholder
    ? null
    : (typeof projectWidgetBoardDropLayout === "function"
      ? projectWidgetBoardDropLayout(instance, payload, { pageFallback: toInteger(pageFallback, internalPage) })
      : null);

  const dropPlan =
    typeof resolveWidgetDropPlan === "function"
      ? resolveWidgetDropPlan(instance, payload, {
        boardProjection,
        suppressSurfaceTargets: Boolean(suppressSurfaceTargets),
        allowDeleteZone: Boolean(allowDeleteZone)
      })
      : null;

  return {
    payload,
    boardProjection,
    dropPlan
  };
}

export function evaluateFinalWidgetDrop(
  instance,
  {
    pointerEvent = null,
    fallbackX = 0,
    fallbackY = 0,
    previewSession = null,
    page,
    pageFallback = page,
    suppressSurfaceTargets = false,
    allowDeleteZone = true
  } = {},
  deps = {}
) {
  const evaluateDrop = deps?.evaluateWidgetDropAtPointer;

  const { dropX, dropY } = resolveDropPoint(pointerEvent, fallbackX, fallbackY);
  const evaluation =
    typeof evaluateDrop === "function"
      ? evaluateDrop(instance, {
        previewSession,
        clientX: dropX,
        clientY: dropY,
        page,
        pageFallback,
        suppressSurfaceTargets,
        allowDeleteZone
      })
      : null;

  const finalPayload = evaluation?.payload || {
    clientX: dropX,
    clientY: dropY,
    page: toInteger(page, 0)
  };

  return {
    dropX,
    dropY,
    finalPayload,
    finalDropPlan: evaluation?.dropPlan || createNoneDropPlan(),
    evaluation
  };
}

export function buildDragGuideState(dropPlan) {
  const safePlan = dropPlan || null;
  const deleteHovering = safePlan?.kind === DROP_PLAN_KIND.DELETE_ZONE;
  const boardGuideProjection = isBoardRealPageDropPlan(safePlan) ? safePlan.projection : null;
  return {
    deleteHovering,
    boardGuideProjection
  };
}
