import test from "node:test";
import assert from "node:assert/strict";

import { applyWidgetDropPlanByKind } from "../core/widget-drop-plan-apply.js";
import {
  DROP_CONTAINER_KIND,
  DROP_PLAN_KIND,
  createBoardPageDropPlan,
  createBoardPlaceholderDropPlan,
  createContainerDropPlan
} from "../core/launcherDropPlan.js";

function createInstance(overrides = {}) {
  return {
    id: "w1",
    type: "note",
    page: 0,
    layout: {
      x: 0,
      y: 0,
      w: 300,
      h: 200
    },
    gridLayout: null,
    ...overrides
  };
}

test("applyWidgetDropPlanByKind removes widget for delete-zone plan", () => {
  const instance = createInstance();
  let cleared = 0;
  let removedId = "";

  const moved = applyWidgetDropPlanByKind(
    instance,
    { kind: DROP_PLAN_KIND.DELETE_ZONE },
    {},
    { record: true },
    {
      clearPendingPlaceholderDrop: () => {
        cleared += 1;
      },
      removeWidget: (id) => {
        removedId = id;
      }
    }
  );

  assert.equal(moved, true);
  assert.equal(cleared, 1);
  assert.equal(removedId, "w1");
});

test("applyWidgetDropPlanByKind handles dock container drop branch", () => {
  const instance = createInstance();
  let cleared = 0;
  let dockCalls = 0;
  let renderBoardCalls = 0;
  let queueSaveCalls = 0;

  const moved = applyWidgetDropPlanByKind(
    instance,
    createContainerDropPlan({
      containerKind: DROP_CONTAINER_KIND.DOCK,
      insertIndex: 2
    }),
    { clientX: 100, clientY: 200 },
    { record: false },
    {
      clearPendingPlaceholderDrop: () => {
        cleared += 1;
      },
      tryDockWidgetByDrop: () => {
        dockCalls += 1;
        return true;
      },
      renderBoard: () => {
        renderBoardCalls += 1;
      },
      queueSave: () => {
        queueSaveCalls += 1;
      }
    }
  );

  assert.equal(moved, true);
  assert.equal(cleared, 1);
  assert.equal(dockCalls, 1);
  assert.equal(renderBoardCalls, 1);
  assert.equal(queueSaveCalls, 1);
});

test("applyWidgetDropPlanByKind forwards placeholder page drops", () => {
  const instance = createInstance();
  const calls = [];

  const moved = applyWidgetDropPlanByKind(
    instance,
    createBoardPlaceholderDropPlan({
      edge: "HEAD",
      policyPlaceholderPage: 0,
      internalPlaceholderPage: -1
    }),
    { clientX: 50, clientY: 60 },
    { record: true },
    {
      currentLauncherPageCount: () => 3,
      commitPlaceholderPageDrop: (widgetId, payload, placeholderPage) => {
        calls.push({ widgetId, payload, placeholderPage });
        return true;
      }
    }
  );

  assert.equal(moved, true);
  assert.deepEqual(calls, [
    {
      widgetId: "w1",
      payload: {
        clientX: 50,
        clientY: 60,
        page: -1
      },
      placeholderPage: -1
    }
  ]);
});

test("applyWidgetDropPlanByKind falls back invalid placeholder page to edge", () => {
  const instance = createInstance();
  const plan = createBoardPlaceholderDropPlan({
    edge: "TAIL",
    policyPlaceholderPage: 4,
    internalPlaceholderPage: 3
  });
  plan.space.board.internalPlaceholderPage = "bad";
  const calls = [];

  const moved = applyWidgetDropPlanByKind(
    instance,
    plan,
    { clientX: 50, clientY: 60 },
    { record: true },
    {
      currentLauncherPageCount: () => 3,
      commitPlaceholderPageDrop: (widgetId, payload, placeholderPage) => {
        calls.push({ widgetId, payload, placeholderPage });
        return true;
      }
    }
  );

  assert.equal(moved, true);
  assert.deepEqual(calls, [
    {
      widgetId: "w1",
      payload: {
        clientX: 50,
        clientY: 60,
        page: 3
      },
      placeholderPage: 3
    }
  ]);
});

test("applyWidgetDropPlanByKind returns false when real-page plan causes no change", () => {
  const instance = createInstance({
    page: 1,
    layout: { x: 100, y: 120, w: 320, h: 220 }
  });
  let recordCalls = 0;

  const moved = applyWidgetDropPlanByKind(
    instance,
    createBoardPageDropPlan({
      policyPage: 2,
      internalPage: 1,
      projection: {
        layout: { x: 100, y: 120, w: 320, h: 220 },
        gridLayout: null
      }
    }),
    {},
    { record: true },
    {
      clearPendingPlaceholderDrop: () => {},
      normalizeWidgetPage: (page) => page,
      currentLauncherPageCount: () => 4,
      currentLauncherActivePage: () => 1,
      isWidgetDocked: () => false,
      isWidgetInContainer: () => false,
      recordHistorySnapshot: () => {
        recordCalls += 1;
      }
    }
  );

  assert.equal(moved, false);
  assert.equal(recordCalls, 0);
});

test("applyWidgetDropPlanByKind commits real-page board move and refreshes runtime", () => {
  const instance = createInstance({
    type: "container",
    page: 0,
    layout: { x: 0, y: 0, w: 300, h: 200 }
  });
  const runtimeCard = { id: "card" };
  let refreshCalls = 0;
  const runtimeMap = new Map([
    [
      "w1",
      {
        card: runtimeCard,
        controller: {
          refresh() {
            refreshCalls += 1;
          }
        }
      }
    ]
  ]);

  let recordCalls = 0;
  let activePageValue = -1;
  let applyLayoutCalls = 0;
  let viewportCalls = 0;
  let compactCalls = 0;
  let settingsCalls = 0;
  let queueSaveCalls = 0;

  const moved = applyWidgetDropPlanByKind(
    instance,
    createBoardPageDropPlan({
      policyPage: 2,
      internalPage: 1,
      projection: {
        layout: { x: 120, y: 140, w: 320, h: 220 },
        gridLayout: null
      }
    }),
    { clientX: 300, clientY: 350 },
    { record: true },
    {
      clearPendingPlaceholderDrop: () => {},
      normalizeWidgetPage: (page) => page,
      currentLauncherPageCount: () => 4,
      currentLauncherActivePage: () => 0,
      isWidgetDocked: () => false,
      isWidgetInContainer: () => false,
      recordHistorySnapshot: () => {
        recordCalls += 1;
      },
      touchUserMutationClock: () => {},
      setActivePage: (page) => {
        activePageValue = page;
      },
      isGridLayoutMode: () => false,
      runtimeMap,
      applyLayout: (card) => {
        if (card === runtimeCard) {
          applyLayoutCalls += 1;
        }
      },
      renderBoardViewport: () => {
        viewportCalls += 1;
      },
      compactEmptyLauncherPagesForUseMode: () => {
        compactCalls += 1;
      },
      renderSettings: () => {
        settingsCalls += 1;
      },
      queueSave: () => {
        queueSaveCalls += 1;
      }
    }
  );

  assert.equal(moved, true);
  assert.equal(recordCalls, 1);
  assert.equal(instance.page, 1);
  assert.deepEqual(instance.layout, { x: 120, y: 140, w: 320, h: 220 });
  assert.equal(activePageValue, 1);
  assert.equal(applyLayoutCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(viewportCalls, 1);
  assert.equal(compactCalls, 1);
  assert.equal(settingsCalls, 1);
  assert.equal(queueSaveCalls, 1);
});
