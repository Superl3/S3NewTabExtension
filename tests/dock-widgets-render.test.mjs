import test from "node:test";
import assert from "node:assert/strict";

import { renderDockWidgetsView } from "../core/dock-widgets-render.js";

function createClassList() {
  const set = new Set();
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    toggle(name, force) {
      if (typeof force === "boolean") {
        if (force) {
          set.add(name);
        } else {
          set.delete(name);
        }
        return;
      }
      if (set.has(name)) {
        set.delete(name);
      } else {
        set.add(name);
      }
    },
    has(name) {
      return set.has(name);
    }
  };
}

function createNode(tagName = "div") {
  const listeners = new Map();
  return {
    tagName,
    className: "",
    dataset: {},
    style: {},
    attributes: {},
    title: "",
    classList: createClassList(),
    children: [],
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    emit(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler(event);
      }
    }
  };
}

test("renderDockWidgetsView handles empty dock state", () => {
  const strip = createNode("section");
  const dockUiState = { activeId: "prev" };
  let destroyed = 0;
  let syncOverflow = 0;

  renderDockWidgetsView({
    strip,
    instances: [],
    homeState: {},
    dockUiState,
    destroyDockEmbeddedControllers: () => {
      destroyed += 1;
    },
    normalizeDockedWidgetOrders: () => false,
    buildDockConfig: () => ({ lengthUnits: 6 }),
    isHorizontalDock: () => true,
    dockedInstances: () => [],
    normalizeDockActiveId: () => "",
    normalizeDockOrder: () => 0,
    widgetRegistry: {},
    normalizeText: (value) => String(value || ""),
    applyCardVisual: () => {},
    runtimeMount: { runtimeDeps: {} },
    dragSession: {},
    setDockActiveId: () => {},
    applyDockActiveVisual: () => {},
    isEditMode: () => false,
    openWidgetSettings: () => {},
    syncDockOverflowState: () => {
      syncOverflow += 1;
    },
    documentObj: {
      createElement: (tag) => createNode(tag)
    }
  });

  assert.equal(destroyed, 1);
  assert.equal(dockUiState.activeId, "");
  assert.equal(syncOverflow, 1);
  assert.equal(strip.classList.has("is-empty"), true);
});

test("renderDockWidgetsView renders items and handles click activation", () => {
  const strip = createNode("section");
  const dockUiState = { activeId: "" };
  const setDockCalls = [];
  const activeVisualCalls = [];
  const openCalls = [];

  renderDockWidgetsView({
    strip,
    instances: [{ id: "w1", type: "unknown", dockOrder: 0, title: "alpha" }],
    homeState: {},
    dockUiState,
    destroyDockEmbeddedControllers: () => {},
    normalizeDockedWidgetOrders: () => false,
    onNormalizationChanged: () => {},
    buildDockConfig: () => ({ lengthUnits: 4 }),
    isHorizontalDock: () => true,
    dockedInstances: () => [{ id: "w1", type: "unknown", dockOrder: 0, title: "alpha" }],
    normalizeDockActiveId: () => "w1",
    normalizeDockOrder: () => 0,
    widgetRegistry: {},
    normalizeText: (value, fallback = "") => String(value || fallback || ""),
    applyCardVisual: () => {},
    runtimeMount: {
      runtimeDeps: {},
      onControllerMounted: () => {}
    },
    dragSession: {},
    setDockActiveId: (id, options) => {
      setDockCalls.push({ id, options });
    },
    applyDockActiveVisual: (id) => {
      activeVisualCalls.push(id);
    },
    isEditMode: () => true,
    openWidgetSettings: (id) => {
      openCalls.push(id);
    },
    syncDockOverflowState: () => {},
    documentObj: {
      createElement: (tag) => createNode(tag)
    }
  });

  assert.equal(dockUiState.activeId, "w1");
  assert.equal(strip.children.length, 1);

  const card = strip.children[0];
  card.dataset.suppressClick = "true";
  card.emit("click");
  assert.deepEqual(setDockCalls, []);
  assert.equal(card.dataset.suppressClick, "false");

  card.emit("click");
  assert.deepEqual(setDockCalls, [{ id: "w1", options: { rerender: false } }]);
  assert.deepEqual(openCalls, ["w1"]);
  assert.equal(activeVisualCalls.includes("w1"), true);
});
