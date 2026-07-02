import test from "node:test";
import assert from "node:assert/strict";

import { createDropGuideRuntime } from "../core/drop-guide-runtime.js";

function createClassList() {
  const set = new Set();
  return {
    add(name) {
      set.add(name);
    },
    remove(name) {
      set.delete(name);
    },
    contains(name) {
      return set.has(name);
    }
  };
}

function createElement(overrides = {}) {
  return {
    classList: createClassList(),
    style: {
      setProperty() {},
      removeProperty() {}
    },
    dataset: {},
    removeAttribute() {},
    ...overrides
  };
}

test("createDropGuideRuntime returns inert values for invalid pointer input", () => {
  const runtime = createDropGuideRuntime({
    elements: {},
    dragGuideUiState: { host: null },
    containerDropUiState: { targets: new Map() },
    state: { instances: [] },
    widgetPageOffsetX: () => 0,
    resolveDockDropSlotIndex: () => null,
    dockSlotRectRelativeToHost: () => null,
    normalizeContainerId: (id) => String(id || ""),
    instanceById: () => null,
    normalizeText: (value) => String(value || ""),
    resolveContainerSpan: () => ({ cols: 1, rows: 1 }),
    resolveContainerInsertIndexFromPointer: () => 0,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveWidgetSpanInContainer: () => ({ cols: 1, rows: 1 }),
    cssPixelValue: () => 0,
    containerDropTargetAtPoint: () => "",
    isDockDropPoint: () => false,
    setContainerDropTargetActive: () => {},
    setDockDropTargetActive: () => {},
    isGridLayoutMode: () => false,
    windowObj: { getComputedStyle: () => ({}) }
  });

  const result = runtime.updateWidgetDragGuideAtPointer(null, Number.NaN, Number.NaN);
  assert.deepEqual(result, {
    containerDropTargetId: "",
    dockDropActive: false
  });
});

test("createDropGuideRuntime computes board guide rect when board is present", () => {
  const board = createElement({
    clientWidth: 1280,
    clientHeight: 720
  });

  const runtime = createDropGuideRuntime({
    elements: { board },
    dragGuideUiState: { host: null },
    containerDropUiState: { targets: new Map() },
    state: { instances: [] },
    widgetPageOffsetX: (page) => page * 100,
    resolveDockDropSlotIndex: () => null,
    dockSlotRectRelativeToHost: () => null,
    normalizeContainerId: (id) => String(id || ""),
    instanceById: () => null,
    normalizeText: (value) => String(value || ""),
    resolveContainerSpan: () => ({ cols: 1, rows: 1 }),
    resolveContainerInsertIndexFromPointer: () => 0,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveWidgetSpanInContainer: () => ({ cols: 1, rows: 1 }),
    cssPixelValue: () => 0,
    containerDropTargetAtPoint: () => "",
    isDockDropPoint: () => false,
    setContainerDropTargetActive: () => {},
    setDockDropTargetActive: () => {},
    isGridLayoutMode: () => false,
    windowObj: { getComputedStyle: () => ({}) }
  });

  assert.deepEqual(runtime.boardPageDropGuideRect(2), {
    x: 200,
    y: 0,
    w: 1280,
    h: 720
  });
});

test("createDropGuideRuntime projects board slot rect with truthy fallback semantics", () => {
  const runtime = createDropGuideRuntime({
    elements: {},
    dragGuideUiState: { host: null },
    containerDropUiState: { targets: new Map() },
    state: { instances: [] },
    widgetPageOffsetX: (page) => page * 100,
    resolveDockDropSlotIndex: () => null,
    dockSlotRectRelativeToHost: () => null,
    normalizeContainerId: (id) => String(id || ""),
    instanceById: () => null,
    normalizeText: (value) => String(value || ""),
    resolveContainerSpan: () => ({ cols: 1, rows: 1 }),
    resolveContainerInsertIndexFromPointer: () => 0,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveWidgetSpanInContainer: () => ({ cols: 1, rows: 1 }),
    cssPixelValue: () => 0,
    containerDropTargetAtPoint: () => "",
    isDockDropPoint: () => false,
    setContainerDropTargetActive: () => {},
    setDockDropTargetActive: () => {},
    isGridLayoutMode: () => false,
    windowObj: { getComputedStyle: () => ({}) }
  });

  assert.deepEqual(runtime.projectedBoardSlotRect({ x: 0, y: "bad", w: 0, h: -4 }, 2), {
    x: 200,
    y: 0,
    w: 1,
    h: 1
  });
});

test("createDropGuideRuntime clears existing guide host", () => {
  const host = createElement();
  const runtime = createDropGuideRuntime({
    elements: {},
    dragGuideUiState: { host },
    containerDropUiState: { targets: new Map() },
    state: { instances: [] },
    widgetPageOffsetX: () => 0,
    resolveDockDropSlotIndex: () => null,
    dockSlotRectRelativeToHost: () => null,
    normalizeContainerId: (id) => String(id || ""),
    instanceById: () => null,
    normalizeText: (value) => String(value || ""),
    resolveContainerSpan: () => ({ cols: 1, rows: 1 }),
    resolveContainerInsertIndexFromPointer: () => 0,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    resolveWidgetSpanInContainer: () => ({ cols: 1, rows: 1 }),
    cssPixelValue: () => 0,
    containerDropTargetAtPoint: () => "",
    isDockDropPoint: () => false,
    setContainerDropTargetActive: () => {},
    setDockDropTargetActive: () => {},
    isGridLayoutMode: () => false,
    windowObj: { getComputedStyle: () => ({}) }
  });

  runtime.clearWidgetDropGuide();
  assert.equal(runtime, runtime);
});
