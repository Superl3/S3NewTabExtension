import test from "node:test";
import assert from "node:assert/strict";

import { createDockInteractionsRuntime } from "../core/dock-interactions-runtime.js";

function createClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (name) => set.add(name),
    contains: (name) => set.has(name),
    remove: (name) => set.delete(name),
    toggle: (name, force) => {
      if (force === true) {
        set.add(name);
        return true;
      }
      if (force === false) {
        set.delete(name);
        return false;
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    }
  };
}

function createButton(widgetId) {
  const attrs = {};
  return {
    dataset: { widgetId },
    classList: createClassList(["dock-widget-item"]),
    tabIndex: -1,
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getAttribute(name) {
      return attrs[name] || null;
    },
    focus() {
    },
    click() {
      this.clicked = (this.clicked || 0) + 1;
    },
    closest(selector) {
      return selector === ".dock-widget-item" ? this : null;
    },
    getBoundingClientRect() {
      return { left: widgetId === "a" ? 0 : 100, width: 80, height: 30 };
    }
  };
}

function createHarness(overrides = {}) {
  const buttonA = createButton("a");
  const buttonB = createButton("b");
  const styleMap = new Map();
  const root = {
    style: {
      setProperty(name, value) {
        styleMap.set(name, String(value));
      }
    }
  };
  const strip = {
    scrollWidth: 300,
    clientWidth: 100,
    scrollLeft: 0,
    dataset: {},
    querySelectorAll() {
      return [buttonA, buttonB];
    }
  };

  const calls = {
    setDockActiveId: [],
    destroyed: 0
  };

  const dockEmbeddedUiState = {
    controllers: new Map([
      ["x", { destroy: () => { calls.destroyed += 1; } }],
      ["y", { destroy: () => { calls.destroyed += 1; } }]
    ])
  };

  const deps = {
    elements: {
      dockWidgetStrip: strip,
      persistentDock: {
        classList: createClassList(),
        getBoundingClientRect: () => ({ height: 50 })
      },
      persistentDockBody: {
        getBoundingClientRect: () => ({ height: 44 })
      }
    },
    dockUiState: {
      activeId: ""
    },
    dockEmbeddedUiState,
    normalizeText: (value) => String(value || "").trim(),
    setDockActiveId: (id, options) => {
      calls.setDockActiveId.push({ id, options });
    },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    documentObj: {
      activeElement: buttonA,
      documentElement: root
    },
    normalizeDockVisibility: (value, fallback) => {
      const normalized = String(value || "").trim();
      return normalized === "collapsible" ? "collapsible" : fallback;
    },
    ...overrides
  };

  return {
    deps,
    calls,
    styleMap,
    strip,
    buttonA,
    buttonB,
    runtime: createDockInteractionsRuntime(deps)
  };
}

test("applyDockActiveVisual updates active button attributes", () => {
  const harness = createHarness();

  harness.runtime.applyDockActiveVisual("b");

  assert.equal(harness.deps.dockUiState.activeId, "b");
  assert.equal(harness.buttonA.getAttribute("aria-current"), "false");
  assert.equal(harness.buttonB.getAttribute("aria-current"), "true");
  assert.equal(harness.buttonA.tabIndex, -1);
  assert.equal(harness.buttonB.tabIndex, 0);
});

test("onDockStripKeyDown moves focus and updates active id", () => {
  const harness = createHarness();
  let prevented = 0;

  harness.runtime.onDockStripKeyDown({
    key: "ArrowRight",
    target: harness.buttonA,
    preventDefault() {
      prevented += 1;
    }
  });

  assert.equal(prevented, 1);
  assert.deepEqual(harness.calls.setDockActiveId, [{ id: "b", options: { rerender: false } }]);
});

test("onDockStripWheel applies horizontal scroll and overflow flags", () => {
  const harness = createHarness();
  let prevented = 0;

  harness.runtime.onDockStripWheel({
    deltaX: 0,
    deltaY: 20,
    preventDefault() {
      prevented += 1;
    }
  });

  assert.equal(prevented, 1);
  assert.equal(harness.strip.scrollLeft, 20);
  assert.equal(harness.strip.dataset.overflowing, "true");
  assert.equal(harness.strip.dataset.overflowEnd, "true");
});

test("syncDockContentPadding writes dock CSS variables", () => {
  const harness = createHarness();

  harness.runtime.syncDockContentPadding({ enabled: true, heightPx: 40, visibility: "fixed" });

  assert.equal(harness.styleMap.get("--persistent-dock-height"), "44px");
  assert.equal(harness.styleMap.get("--persistent-dock-content-padding"), "56px");
  assert.equal(harness.styleMap.get("--persistent-dock-clearance"), "56px");

  harness.runtime.syncDockContentPadding({ enabled: false, heightPx: 40, visibility: "fixed" });
  assert.equal(harness.styleMap.get("--persistent-dock-height"), "0px");
  assert.equal(harness.styleMap.get("--persistent-dock-content-padding"), "0px");
  assert.equal(harness.styleMap.get("--persistent-dock-clearance"), "0px");
});

test("destroyDockEmbeddedControllers destroys and clears controllers", () => {
  const harness = createHarness();

  harness.runtime.destroyDockEmbeddedControllers();

  assert.equal(harness.calls.destroyed, 2);
  assert.equal(harness.deps.dockEmbeddedUiState.controllers.size, 0);
});
