import { DRAG_PREVIEW_Z_INDEX } from "./drag-layering.js";

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

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
    preview.style.left = `${Math.round(rect.left)}px`;
    preview.style.top = `${Math.round(rect.top)}px`;
    preview.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    preview.style.height = `${Math.max(1, Math.round(rect.height))}px`;
    preview.style.position = "fixed";
    preview.style.zIndex = String(DRAG_PREVIEW_Z_INDEX);
    preview.style.pointerEvents = "none";

    const pointerX = Number.isFinite(Number(options?.pointerX))
      ? Number(options.pointerX)
      : Number(options?.pointerEvent?.clientX);
    const pointerY = Number.isFinite(Number(options?.pointerY))
      ? Number(options.pointerY)
      : Number(options?.pointerEvent?.clientY);
    const offsetX = Number.isFinite(pointerX) ? clamp(pointerX - rect.left, 0, rect.width) : rect.width / 2;
    const offsetY = Number.isFinite(pointerY) ? clamp(pointerY - rect.top, 0, rect.height) : rect.height / 2;

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
  document.body.append(preview);
  return preview;
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
    preview.style.left = `${Math.round(clientX - offsetX)}px`;
    preview.style.top = `${Math.round(clientY - offsetY)}px`;
    return;
  }
  preview.style.left = `${Math.round(clientX + 14)}px`;
  preview.style.top = `${Math.round(clientY + 14)}px`;
}

export function createDragPreviewSession(instance, options = {}) {
  const sourceCard = options?.sourceCard;
  const pointerEvent = options?.pointerEvent;
  const pointerX = Number.isFinite(Number(options?.pointerX))
    ? Number(options.pointerX)
    : Number(pointerEvent?.clientX);
  const pointerY = Number.isFinite(Number(options?.pointerY))
    ? Number(options.pointerY)
    : Number(pointerEvent?.clientY);

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
