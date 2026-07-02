import { DRAG_PREVIEW_Z_INDEX } from "./drag-layering.js";
import { clampFiniteOrMin, toFiniteNumber } from "./utils/number.js";
import { normalizeText } from "./utils/text.js";

export function createWidgetDragPreview(instance, options = {}) {
  const sourceCard = options?.sourceCard;
  const fallbackTitle = normalizeText(options?.fallbackTitle, "Widget");

  if (sourceCard instanceof HTMLElement) {
    const rect = sourceCard.getBoundingClientRect();
    const preview = sourceCard.cloneNode(true);
    preview.classList.remove("is-active", "dock-widget-item-dragging", "widget-drag-origin-hidden", "widget-drag-active");
    preview.classList.add("widget-drag-preview-card");
    preview.removeAttribute("aria-current");
    preview.removeAttribute("tabindex");
    preview.style.left = "0px";
    preview.style.top = "0px";
    preview.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    preview.style.height = `${Math.max(1, Math.round(rect.height))}px`;
    preview.style.position = "fixed";
    preview.style.zIndex = String(DRAG_PREVIEW_Z_INDEX);
    preview.style.pointerEvents = "none";
    preview.style.setProperty("--drag-preview-x", `${Math.round(rect.left)}px`);
    preview.style.setProperty("--drag-preview-y", `${Math.round(rect.top)}px`);

    const pointerX = toFiniteNumber(options?.pointerX, Number(options?.pointerEvent?.clientX));
    const pointerY = toFiniteNumber(options?.pointerY, Number(options?.pointerEvent?.clientY));
    const fallbackToTopLeft = options?.fallbackPointerAnchor === "top-left";
    const rawOffsetX = Number.isFinite(pointerX) ? pointerX - rect.left : Number.NaN;
    const rawOffsetY = Number.isFinite(pointerY) ? pointerY - rect.top : Number.NaN;
    const offsetX =
      Number.isFinite(rawOffsetX)
        ? (fallbackToTopLeft && rawOffsetX > rect.width ? 0 : clampFiniteOrMin(rawOffsetX, 0, rect.width))
        : rect.width / 2;
    const offsetY =
      Number.isFinite(rawOffsetY)
        ? (fallbackToTopLeft && rawOffsetY > rect.height ? 0 : clampFiniteOrMin(rawOffsetY, 0, rect.height))
        : rect.height / 2;

    preview.dataset.dragOffsetX = String(offsetX);
    preview.dataset.dragOffsetY = String(offsetY);

    document.body.append(preview);
    return preview;
  }

  const preview = document.createElement("div");
  preview.className = "widget-drag-preview";
  preview.textContent = normalizeText(instance?.title, fallbackTitle);
  preview.style.position = "fixed";
  preview.style.zIndex = String(DRAG_PREVIEW_Z_INDEX);
  preview.style.pointerEvents = "none";
  preview.style.left = "0px";
  preview.style.top = "0px";
  document.body.append(preview);
  return preview;
}

function setDragPreviewPosition(preview, x, y) {
  preview.style.setProperty("--drag-preview-x", `${Math.round(x)}px`);
  preview.style.setProperty("--drag-preview-y", `${Math.round(y)}px`);
}

export function positionWidgetDragPreview(preview, clientX, clientY) {
  if (!(preview instanceof HTMLElement)) {
    return;
  }
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return;
  }
  const offsetX = Number(preview.dataset.dragOffsetX);
  const offsetY = Number(preview.dataset.dragOffsetY);
  if (Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
    setDragPreviewPosition(preview, clientX - offsetX, clientY - offsetY);
    return;
  }
  setDragPreviewPosition(preview, clientX + 14, clientY + 14);
}

export function createDragPreviewSession(instance, options = {}) {
  const sourceCard = options?.sourceCard;
  const pointerEvent = options?.pointerEvent;
  const pointerX = toFiniteNumber(options?.pointerX, Number(pointerEvent?.clientX));
  const pointerY = toFiniteNumber(options?.pointerY, Number(pointerEvent?.clientY));

  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
    return null;
  }

  const pointerId = Number.isFinite(pointerEvent?.pointerId) ? pointerEvent.pointerId : null;
  if (pointerId !== null && sourceCard instanceof HTMLElement) {
    sourceCard.setPointerCapture?.(pointerId);
  }

  const preview = createWidgetDragPreview(instance, {
    ...options,
    sourceCard,
    pointerEvent,
    pointerX,
    pointerY
  });
  positionWidgetDragPreview(preview, pointerX, pointerY);

  let disposed = false;
  return {
    preview,
    getPointerOffset() {
      const offsetX = Number(preview?.dataset?.dragOffsetX);
      const offsetY = Number(preview?.dataset?.dragOffsetY);
      if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
        return null;
      }
      return { x: offsetX, y: offsetY };
    },
    update(clientX, clientY) {
      positionWidgetDragPreview(preview, clientX, clientY);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (pointerId !== null && sourceCard instanceof HTMLElement) {
        sourceCard.releasePointerCapture?.(pointerId);
      }
      preview.remove();
    }
  };
}

export function buildDragPayloadWithPreviewOffset(previewSession, payload = {}) {
  const next = { ...payload };
  const offset = previewSession?.getPointerOffset?.();
  if (offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)) {
    next.dragOffsetX = offset.x;
    next.dragOffsetY = offset.y;
  }
  return next;
}
