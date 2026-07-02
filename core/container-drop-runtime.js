import { arrayOrEmpty } from "./utils/array.js";

export function createContainerDropRuntime(deps) {
  function resolveContainerInsertIndexFromPointer(
    containerId,
    clientX,
    clientY,
    { excludeWidgetId = "", panelElement = null, cardSelector = ".widget-folder-item-card[data-widget-id]" } = {}
  ) {
    const targetId = deps.normalizeContainerId(containerId);
    if (!targetId) {
      return 0;
    }

    const resolvedPanelElement = (() => {
      if (deps.isHtmlElement(panelElement)) {
        return panelElement;
      }
      const entry = deps.getContainerDropTargetEntry(targetId);
      const host = entry?.element;
      if (!deps.isHtmlElement(host)) {
        return null;
      }
      if (host.classList.contains("widget-folder-panel")) {
        const body = host.querySelector(".widget-folder-panel-body");
        return deps.isHtmlElement(body) ? body : host;
      }
      return host;
    })();

    const cards =
      deps.isHtmlElement(resolvedPanelElement)
        ? Array.from(resolvedPanelElement.querySelectorAll(cardSelector))
        : [];
    const filteredCards = cards.filter((card) => {
      const cardWidgetId = deps.normalizeText(card?.dataset?.widgetId);
      return cardWidgetId && cardWidgetId !== deps.normalizeText(excludeWidgetId);
    });

    if (filteredCards.length && Number.isFinite(clientX) && Number.isFinite(clientY)) {
      for (let index = 0; index < filteredCards.length; index += 1) {
        const rect = filteredCards[index].getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const centerX = rect.left + rect.width / 2;
        if (clientY < centerY || (Math.abs(clientY - centerY) <= Math.max(6, rect.height * 0.25) && clientX < centerX)) {
          return index;
        }
      }
      return filteredCards.length;
    }

    const siblings = arrayOrEmpty(deps.getInstances()).filter((entry) => {
      if (!entry || entry.type === "container") {
        return false;
      }
      if (deps.normalizeContainerId(entry.containerId) !== targetId) {
        return false;
      }
      return deps.normalizeText(entry.id) !== deps.normalizeText(excludeWidgetId);
    });
    return siblings.length;
  }

  function projectContainerSilhouetteLayoutFromPointer(containerId, clientX, clientY, draggedWidgetId = "") {
    const targetId = deps.normalizeContainerId(containerId);
    if (!targetId) {
      return null;
    }

    const entry = deps.getContainerDropTargetEntry(targetId);
    const targetElement = entry?.element;
    if (!deps.isHtmlElement(targetElement)) {
      return null;
    }

    if (!targetElement.classList.contains("widget-folder-panel")) {
      return deps.viewportRectToBoardLayout(targetElement.getBoundingClientRect());
    }

    const panelBody = targetElement.querySelector(".widget-folder-panel-body");
    if (!deps.isHtmlElement(panelBody)) {
      return deps.viewportRectToBoardLayout(targetElement.getBoundingClientRect());
    }

    const guideSlotRect = deps.containerDropGuideSlotRect(targetId, { id: draggedWidgetId }, targetElement, {
      clientX,
      clientY
    });
    if (
      guideSlotRect &&
      Number.isFinite(guideSlotRect.x) &&
      Number.isFinite(guideSlotRect.y) &&
      Number.isFinite(guideSlotRect.w) &&
      Number.isFinite(guideSlotRect.h)
    ) {
      const panelRect = targetElement.getBoundingClientRect();
      return deps.viewportRectToBoardLayout({
        left: panelRect.left + guideSlotRect.x,
        top: panelRect.top + guideSlotRect.y,
        width: guideSlotRect.w,
        height: guideSlotRect.h
      });
    }

    const cards = Array.from(panelBody.querySelectorAll(".widget-folder-item-card[data-widget-id]"))
      .filter((card) => deps.normalizeText(card?.dataset?.widgetId) !== deps.normalizeText(draggedWidgetId));

    if (!cards.length) {
      return deps.viewportRectToBoardLayout(panelBody.getBoundingClientRect());
    }

    const insertIndex = resolveContainerInsertIndexFromPointer(targetId, clientX, clientY, {
      excludeWidgetId: draggedWidgetId,
      panelElement: panelBody
    });
    const anchor = cards[Math.min(cards.length - 1, Math.max(0, insertIndex))] || cards[0];
    return deps.viewportRectToBoardLayout(anchor.getBoundingClientRect());
  }

  return {
    resolveContainerInsertIndexFromPointer,
    projectContainerSilhouetteLayoutFromPointer
  };
}
