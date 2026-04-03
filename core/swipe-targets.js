const LOCK_SELECTOR = "[data-no-page-swipe], [data-no-page-drag], [data-page-swipe-lock]";

export const INTERACTIVE_SWIPE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "summary",
  "details",
  "[contenteditable]",
  "[draggable='true']",
  "[role='button']",
  "[role='link']",
  "[role='textbox']",
  "[role='menuitem']",
  "[role='option']",
  "[role='checkbox']",
  "[role='switch']",
  ".widget-head",
  ".widget-drag-btn",
  ".widget-resize-handle",
  ".widget-padding-handle",
  ".widget-select-btn",
  ".widget-remove-btn",
  ".widget-float-select",
  ".widget-float-remove",
  ".widget-refresh-btn",
  ".widget-open-btn",
  ".widget-auth-toggle-btn",
  ".widget-float-refresh",
  ".widget-float-open",
  ".widget-float-auth-toggle",
  ".shortcut-tile",
  ".ai-chat-widget"
].join(",");

export const BLOCKED_SWIPE_ZONES_SELECTOR = [
  "#settingsPanel",
  "#settingsPanelBackdrop",
  ".settings-panel",
  ".settings-panel-backdrop",
  ".widget-modal-overlay",
  ".corner-controls",
  ".add-widget-fab",
  ".edit-dock",
  ".persistent-dock",
  ".board-context-menu",
  ".drag-delete-zone"
].join(",");

export const WIDGET_SWIPE_ZONES_SELECTOR = [
  ".widget-card",
  ".dock-widget-item",
  ".widget-folder-panel",
  ".widget-folder-item-card"
].join(",");

export const EDITABLE_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']",
  "[contenteditable='']",
  "[contenteditable]:not([contenteditable='false'])"
].join(",");

function matchesClosest(target, selector) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }
  return Boolean(target.closest(selector));
}

export function isInteractiveSwipeTarget(target) {
  if (matchesClosest(target, LOCK_SELECTOR)) {
    return true;
  }
  return matchesClosest(target, INTERACTIVE_SWIPE_SELECTOR);
}

export function canStartBoardSwipeFromTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return true;
  }
  if (matchesClosest(target, BLOCKED_SWIPE_ZONES_SELECTOR)) {
    return false;
  }
  if (matchesClosest(target, WIDGET_SWIPE_ZONES_SELECTOR)) {
    return false;
  }
  return !isInteractiveSwipeTarget(target);
}

export function isTextEditableTarget(target) {
  return matchesClosest(target, EDITABLE_TARGET_SELECTOR);
}
