import test from "node:test";
import assert from "node:assert/strict";

import { createContainerDropRuntime } from "../core/container-drop-runtime.js";

function createClassList(initial = []) {
  const set = new Set(initial);
  return {
    contains: (name) => set.has(name)
  };
}

function createElement({ classes = [], rect = { left: 0, top: 0, width: 1, height: 1 }, dataset = {}, querySelector = null, querySelectorAll = null } = {}) {
  return {
    __html: true,
    dataset,
    classList: createClassList(classes),
    getBoundingClientRect: () => ({ ...rect }),
    querySelector: querySelector || (() => null),
    querySelectorAll: querySelectorAll || (() => [])
  };
}

function createHarness(overrides = {}) {
  const calls = {
    projectedRects: []
  };

  const targets = new Map();
  const deps = {
    normalizeContainerId: (value) => String(value || "").trim(),
    normalizeText: (value) => String(value || "").trim(),
    isHtmlElement: (value) => Boolean(value && value.__html === true),
    getContainerDropTargetEntry: (containerId) => targets.get(containerId),
    getInstances: () => [],
    viewportRectToBoardLayout: (rect) => {
      if (!rect) {
        return null;
      }
      calls.projectedRects.push(rect);
      return {
        x: Math.round(Number(rect.left) || 0),
        y: Math.round(Number(rect.top) || 0),
        w: Math.round(Number(rect.width) || 0),
        h: Math.round(Number(rect.height) || 0)
      };
    },
    containerDropGuideSlotRect: () => null,
    ...overrides
  };

  return {
    calls,
    targets,
    runtime: createContainerDropRuntime(deps)
  };
}

test("resolveContainerInsertIndexFromPointer computes insertion index from card centers", () => {
  const cardA = createElement({
    dataset: { widgetId: "a" },
    rect: { left: 0, top: 0, width: 100, height: 40 }
  });
  const cardB = createElement({
    dataset: { widgetId: "b" },
    rect: { left: 0, top: 40, width: 100, height: 40 }
  });
  const panel = createElement({
    querySelectorAll: () => [cardA, cardB]
  });

  const harness = createHarness();
  harness.targets.set("c1", { element: panel });

  const index = harness.runtime.resolveContainerInsertIndexFromPointer("c1", 10, 10);

  assert.equal(index, 0);
});

test("resolveContainerInsertIndexFromPointer falls back to sibling count", () => {
  const harness = createHarness({
    getInstances: () => [
      { id: "w1", type: "notes", containerId: "c1" },
      { id: "w2", type: "todo", containerId: "c1" },
      { id: "c1", type: "container", containerId: "" }
    ]
  });

  const index = harness.runtime.resolveContainerInsertIndexFromPointer("c1", Number.NaN, Number.NaN, { excludeWidgetId: "w2" });

  assert.equal(index, 1);
});

test("projectContainerSilhouetteLayoutFromPointer uses guide slot when available", () => {
  const panelBody = createElement();
  const target = createElement({
    classes: ["widget-folder-panel"],
    rect: { left: 100, top: 200, width: 260, height: 180 },
    querySelector: () => panelBody
  });

  const harness = createHarness({
    containerDropGuideSlotRect: () => ({ x: 12, y: 18, w: 40, h: 30 })
  });
  harness.targets.set("c1", { element: target });

  const layout = harness.runtime.projectContainerSilhouetteLayoutFromPointer("c1", 50, 60, "w1");

  assert.deepEqual(layout, { x: 112, y: 218, w: 40, h: 30 });
});

test("projectContainerSilhouetteLayoutFromPointer anchors to last card for tail insert", () => {
  const cardA = createElement({
    dataset: { widgetId: "a" },
    rect: { left: 10, top: 20, width: 80, height: 30 }
  });
  const cardB = createElement({
    dataset: { widgetId: "b" },
    rect: { left: 20, top: 70, width: 90, height: 35 }
  });

  const panelBody = createElement({
    rect: { left: 1, top: 2, width: 3, height: 4 },
    querySelectorAll: () => [cardA, cardB]
  });
  const target = createElement({
    classes: ["widget-folder-panel"],
    rect: { left: 100, top: 100, width: 200, height: 200 },
    querySelector: () => panelBody
  });

  const harness = createHarness();
  harness.targets.set("c1", { element: target });

  const layout = harness.runtime.projectContainerSilhouetteLayoutFromPointer("c1", 999, 999, "dragged");

  assert.deepEqual(layout, { x: 20, y: 70, w: 90, h: 35 });
});

test("projectContainerSilhouetteLayoutFromPointer uses target rect for non-folder hosts", () => {
  const target = createElement({
    classes: ["some-other-host"],
    rect: { left: 7, top: 8, width: 90, height: 44 }
  });
  const harness = createHarness();
  harness.targets.set("c1", { element: target });

  const layout = harness.runtime.projectContainerSilhouetteLayoutFromPointer("c1", 0, 0, "");

  assert.deepEqual(layout, { x: 7, y: 8, w: 90, h: 44 });
});
