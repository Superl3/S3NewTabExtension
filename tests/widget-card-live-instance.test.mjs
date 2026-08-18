import assert from "node:assert/strict";
import test from "node:test";

import { createWidgetCardRuntime } from "../core/widget-card-runtime.js";
import { buildWidgetControllerContext } from "../core/widget-controller-context.js";

function createStubElement(className = "") {
  const element = {
    className,
    textContent: "",
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    classList: {
      set: new Set(),
      add(...names) {
        for (const name of names) this.set.add(name);
      },
      remove(...names) {
        for (const name of names) this.set.delete(name);
      },
      toggle(name, on) {
        if (on) this.set.add(name);
        else this.set.delete(name);
      },
      contains(name) {
        return this.set.has(name);
      }
    },
    children: [],
    append(...nodes) {
      this.children.push(...nodes);
    },
    remove() {},
    addEventListener() {},
    setAttribute() {},
    querySelector() {
      return null;
    },
    closest() {
      return null;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 };
    }
  };
  return element;
}

const CARD_SELECTORS = [
  ".widget-card",
  ".widget-shell",
  ".widget-head",
  ".widget-head-actions",
  ".widget-title",
  ".widget-body",
  ".widget-content-host",
  ".widget-inline-actions",
  ".widget-inline-actions-bottom",
  ".widget-content-slot",
  ".widget-select-btn",
  ".widget-remove-btn",
  ".widget-float-select",
  ".widget-float-remove",
  ".widget-drag-btn",
  ".widget-resize-handle",
  ".widget-padding-handle-top-right",
  ".widget-padding-handle-bottom-left"
];

function createStubTemplate() {
  const nodes = new Map(CARD_SELECTORS.map((selector) => [selector, createStubElement(selector.slice(1))]));
  return {
    content: {
      cloneNode() {
        return {
          querySelector(selector) {
            return nodes.get(selector) || null;
          }
        };
      }
    },
    nodes
  };
}

function createHarness({ widgetType = "stub" } = {}) {
  const template = createStubTemplate();
  const board = createStubElement("board");
  const runtimeMap = new Map();

  const state = {
    mode: "use",
    selectedWidgetId: "",
    instances: [
      {
        id: "w1",
        type: widgetType,
        title: "First",
        config: { value: "original" },
        layout: { x: 0, y: 0, w: 100, h: 100 },
        page: 0
      }
    ],
    ui: { home: {} }
  };

  const captured = {};

  const runtime = createWidgetCardRuntime({
    widgetRegistry: {
      [widgetType]: {
        type: widgetType,
        title: "Stub",
        create(context) {
          captured.context = context;
          return {};
        }
      }
    },
    elements: { template, board },
    runtimeMap,
    getState: () => state,
    instanceById: (id) => state.instances.find((item) => item.id === id) || null,
    buildWidgetControllerContext: (options) => buildWidgetControllerContext(options),
    gridMetrics: () => ({ cellW: 10, cellH: 10, gap: 0 }),
    patchWidgetConfig: () => {},
    setWidgetContainer: () => {},
    releaseWidgetFromContainerByDrop: () => {},
    reorderWidgetInContainerByIndex: () => {},
    applyLayout: () => {},
    applyCardVisual: () => {},
    applyCardStack: () => {},
    attachWidgetTypeActions: (options) => {
      captured.typeActions = options;
    },
    attachWidgetCardClickBehavior: (options) => {
      captured.clickBehavior = options;
    },
    startWidgetCardDragSession: (options) => {
      captured.dragSession = options;
    },
    startWidgetPaddingDragSession: (options) => {
      captured.paddingDrag = options;
    },
    attachWidgetCardInteractionEvents: (options) => {
      captured.interactionEvents = options;
    },
    attachWidgetResizeHandle: (options) => {
      captured.resizeHandle = options;
    },
    createLongPressDragController: () => ({
      schedule: () => {},
      cancel: () => {},
      clear: () => {}
    }),
    setSelected: () => {},
    openWidgetModal: () => {},
    removeWidget: () => {},
    bringWidgetToFront: () => {},
    isWidgetDocked: () => false,
    isWidgetInContainer: () => false,
    isGridLayoutMode: () => false,
    normalizeContainerId: (value) => value || "",
    widgetDefaultGridSize: () => ({ colSpan: 1, rowSpan: 1 })
  });

  return { runtime, state, captured, runtimeMap };
}

function replaceInstances(state) {
  // Simulates hydrate(): same ids and data, brand-new object identities.
  state.instances = state.instances.map((item) => ({
    ...item,
    config: { ...item.config, value: "rehydrated" },
    layout: { ...item.layout }
  }));
}

test("widget getConfig reads live state after instances are rehydrated", () => {
  const { runtime, state, captured } = createHarness();
  runtime.createWidgetCard(state.instances[0]);

  assert.equal(captured.context.getConfig().value, "original");

  replaceInstances(state);

  assert.equal(
    captured.context.getConfig().value,
    "rehydrated",
    "getConfig must resolve the instance currently in state, not a captured object"
  );
});

test("widget getWidget resolves the live instance object after rehydrate", () => {
  const { runtime, state, captured } = createHarness();
  runtime.createWidgetCard(state.instances[0]);

  replaceInstances(state);

  assert.equal(
    captured.context.getWidget(),
    state.instances[0],
    "getWidget must return the object currently held in state.instances"
  );
});

test("drag session mutations land on the live instance after rehydrate", () => {
  const { runtime, state, captured } = createHarness();
  runtime.createWidgetCard(state.instances[0]);

  replaceInstances(state);

  const startDrag = captured.interactionEvents?.startDrag;
  assert.equal(typeof startDrag, "function", "interaction events must expose startDrag");
  startDrag({});

  const draggedInstance = captured.dragSession?.instance;
  assert.equal(
    draggedInstance,
    state.instances[0],
    "drag session must receive the live instance so layout mutations are not lost"
  );

  draggedInstance.layout.x = 42;
  assert.equal(state.instances[0].layout.x, 42);
});

test("resize handle receives the live instance after rehydrate", () => {
  const { runtime, state, captured } = createHarness();
  runtime.createWidgetCard(state.instances[0]);

  const before = captured.resizeHandle?.getInstance?.();
  assert.equal(before, state.instances[0]);

  replaceInstances(state);

  assert.equal(
    captured.resizeHandle?.getInstance?.(),
    state.instances[0],
    "resize handle must resolve the live instance"
  );
});

test("live lookup falls back to the original instance when it leaves state", () => {
  const { runtime, state, captured } = createHarness();
  const original = state.instances[0];
  runtime.createWidgetCard(original);

  state.instances = [];

  assert.equal(
    captured.context.getWidget(),
    original,
    "removal must not make getWidget throw or return null"
  );
});
