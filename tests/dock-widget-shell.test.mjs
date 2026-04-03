import test from "node:test";
import assert from "node:assert/strict";

import { createDockWidgetShell } from "../core/dock-widget-shell.js";

function createFakeElement(tagName) {
  return {
    tagName,
    className: "",
    dataset: {},
    style: {},
    attributes: {},
    children: [],
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    append(child) {
      this.children.push(child);
    }
  };
}

test("createDockWidgetShell builds dock card with nested slot", () => {
  const documentObj = {
    createElement: (tag) => createFakeElement(tag)
  };

  const { card, slot } = createDockWidgetShell({
    item: { id: "7", type: "weather" },
    slotIndex: 2,
    horizontalDock: true,
    label: "Weather",
    documentObj
  });

  assert.equal(card.className, "dock-widget-item widget-card widget-folder-item-card");
  assert.equal(card.dataset.widgetId, "7");
  assert.equal(card.dataset.widgetType, "weather");
  assert.equal(card.dataset.dockSlot, "2");
  assert.equal(card.style.gridColumnStart, "3");
  assert.equal(card.style.gridRowStart, "1");
  assert.equal(card.attributes.role, "button");
  assert.equal(card.attributes["aria-label"], "Weather");
  assert.equal(card.title, "Weather");
  assert.equal(slot.className, "widget-content-slot dock-widget-content");
});
