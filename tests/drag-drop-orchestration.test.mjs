import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDropPlanIndicators,
  buildDropPlanProjection,
  resolveWidgetDropPlan,
  updateCrossSurfaceDropIndicators
} from "../core/drag-drop-orchestration.js";
import {
  DROP_CONTAINER_KIND,
  DROP_PLAN_KIND,
  createContainerDropPlan,
  createDeleteZoneDropPlan,
  isBoardPlaceholderDropPlan,
  isBoardRealPageDropPlan,
  isContainerDropPlan
} from "../core/launcherDropPlan.js";

function createDeps(overrides = {}) {
  const calls = {
    containerDropTargetActive: [],
    dockDropTargetActive: [],
    deleteZoneHover: [],
    silhouettePositions: [],
    silhouetteVisibility: []
  };

  const deps = {
    currentLauncherPageCount: () => 4,
    currentLauncherActivePage: () => 1,
    isPointOverDragDeleteZone: () => false,
    containerDropTargetAtPoint: () => "",
    resolveContainerInsertIndexFromPointer: () => 0,
    projectContainerSilhouetteLayoutFromPointer: () => null,
    isDockDropPoint: () => false,
    isDockEligibleWidget: () => true,
    projectDockSilhouetteLayoutFromPointer: () => null,
    resolveDockDropSlotIndex: () => null,
    isPlaceholderLauncherPage: (page, pageCount) => Number(page) < 0 || Number(page) >= Number(pageCount),
    normalizeWidgetPage: (page, pageCount, fallback) => {
      const numeric = Number(page);
      if (!Number.isFinite(numeric)) {
        return fallback;
      }
      return Math.max(0, Math.min(Number(pageCount) - 1, Math.floor(numeric)));
    },
    projectWidgetBoardDropLayout: () => ({
      page: 2,
      layout: { x: 10, y: 20, w: 30, h: 40 },
      gridLayout: null
    }),
    setContainerDropTargetActive: (value) => calls.containerDropTargetActive.push(value),
    setDockDropTargetActive: (value) => calls.dockDropTargetActive.push(value),
    setDragDeleteZoneHover: (value) => calls.deleteZoneHover.push(value),
    positionWidgetDropSilhouette: (...args) => calls.silhouettePositions.push(args),
    setWidgetDropSilhouetteVisible: (...args) => calls.silhouetteVisibility.push(args),
    ...overrides
  };

  return { deps, calls };
}

test("buildDropPlanProjection normalizes projection shape", () => {
  assert.equal(buildDropPlanProjection(null), null);
  assert.deepEqual(buildDropPlanProjection({ x: 1 }, "2.7", { col: 1 }), {
    layout: { x: 1 },
    page: 2,
    gridLayout: { col: 1 }
  });
});

test("resolveWidgetDropPlan prioritizes delete-zone drops", () => {
  const { deps } = createDeps({
    isPointOverDragDeleteZone: () => true
  });

  const plan = resolveWidgetDropPlan({ id: "widget-1" }, { clientX: 120, clientY: 240 }, {}, deps);
  assert.equal(plan.kind, DROP_PLAN_KIND.DELETE_ZONE);
});

test("resolveWidgetDropPlan returns folder container drop plan", () => {
  const { deps } = createDeps({
    containerDropTargetAtPoint: () => "folder-1",
    resolveContainerInsertIndexFromPointer: () => 3,
    projectContainerSilhouetteLayoutFromPointer: () => ({ x: 4, y: 5, w: 44, h: 55 })
  });

  const plan = resolveWidgetDropPlan({ id: "widget-a" }, { clientX: 12, clientY: 34 }, {}, deps);
  assert.equal(isContainerDropPlan(plan), true);
  assert.equal(plan.space.container.kind, DROP_CONTAINER_KIND.FOLDER);
  assert.equal(plan.space.container.folderId, "folder-1");
  assert.equal(plan.space.insertIndex, 3);
  assert.deepEqual(plan.projection?.layout, { x: 4, y: 5, w: 44, h: 55 });
});

test("resolveWidgetDropPlan handles placeholder pages and real board pages", () => {
  const { deps } = createDeps();

  const placeholderPlan = resolveWidgetDropPlan({ id: "widget-a" }, { page: -1 }, {}, deps);
  assert.equal(isBoardPlaceholderDropPlan(placeholderPlan), true);
  assert.equal(placeholderPlan.space.board.internalPlaceholderPage, -1);

  const realBoardPlan = resolveWidgetDropPlan({ id: "widget-a" }, { clientX: 20, clientY: 20 }, {}, deps);
  assert.equal(isBoardRealPageDropPlan(realBoardPlan), true);
  assert.equal(realBoardPlan.space.board.internalPage, 2);
  assert.deepEqual(realBoardPlan.projection?.layout, { x: 10, y: 20, w: 30, h: 40 });
});

test("applyDropPlanIndicators updates target and silhouette signals", () => {
  const { deps, calls } = createDeps();
  const silhouette = { id: "ghost" };
  const plan = createContainerDropPlan({
    containerKind: DROP_CONTAINER_KIND.DOCK,
    insertIndex: 1,
    projection: {
      layout: { x: 8, y: 16, w: 40, h: 32 },
      page: 1,
      gridLayout: null
    }
  });

  const result = applyDropPlanIndicators(plan, { silhouette }, deps);

  assert.equal(result.dockDropActive, true);
  assert.equal(result.containerDropTargetId, "");
  assert.deepEqual(calls.containerDropTargetActive, [""]);
  assert.deepEqual(calls.dockDropTargetActive, [true]);
  assert.deepEqual(calls.deleteZoneHover, [false]);
  assert.equal(calls.silhouettePositions.length, 1);
  assert.deepEqual(calls.silhouetteVisibility[0], [silhouette, true]);
});

test("updateCrossSurfaceDropIndicators can apply explicit drop plan", () => {
  const { deps, calls } = createDeps();
  const result = updateCrossSurfaceDropIndicators(
    { id: "widget-a" },
    100,
    100,
    { dropPlan: createDeleteZoneDropPlan(), silhouette: { id: "ghost" } },
    deps
  );

  assert.equal(result.deleteHovering, true);
  assert.deepEqual(calls.deleteZoneHover, [true]);
  assert.deepEqual(calls.silhouetteVisibility[0], [{ id: "ghost" }, false]);
});
