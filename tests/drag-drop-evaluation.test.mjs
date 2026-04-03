import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDragGuideState,
  evaluateFinalWidgetDrop,
  evaluateWidgetDropAtPointer,
  resolveDropPoint
} from "../core/drag-drop-evaluation.js";
import {
  createNoneDropPlan,
  createBoardPageDropPlan,
  createDeleteZoneDropPlan
} from "../core/launcherDropPlan.js";

test("resolveDropPoint prefers pointer coordinates with fallback", () => {
  assert.deepEqual(resolveDropPoint({ clientX: 12, clientY: 34 }, 90, 80), {
    dropX: 12,
    dropY: 34
  });
  assert.deepEqual(resolveDropPoint({}, 90, 80), {
    dropX: 90,
    dropY: 80
  });
});

test("evaluateWidgetDropAtPointer skips board projection on placeholder page", () => {
  let projected = false;
  const plan = { kind: "SPACE" };
  const result = evaluateWidgetDropAtPointer(
    { id: "widget-1" },
    {
      previewSession: { id: "preview" },
      clientX: 100,
      clientY: 200,
      page: -1,
      pageFallback: -1
    },
    {
      buildDragPayloadWithPreviewOffset: (_session, payload) => ({ ...payload, dragOffsetX: 11, dragOffsetY: 22 }),
      currentLauncherPageCount: () => 4,
      isPlaceholderLauncherPage: (page) => page < 0,
      projectWidgetBoardDropLayout: () => {
        projected = true;
        return { page: 0, layout: { x: 1, y: 2, w: 3, h: 4 } };
      },
      resolveWidgetDropPlan: (_instance, payload, options) => {
        assert.equal(payload.page, -1);
        assert.equal(payload.dragOffsetX, 11);
        assert.equal(options.boardProjection, null);
        return plan;
      }
    }
  );

  assert.equal(projected, false);
  assert.equal(result.boardProjection, null);
  assert.equal(result.dropPlan, plan);
});

test("evaluateWidgetDropAtPointer projects board layout on real page", () => {
  const projection = {
    page: 2,
    layout: { x: 10, y: 20, w: 30, h: 40 },
    gridLayout: null
  };
  const plan = { kind: "SPACE", projection };

  const result = evaluateWidgetDropAtPointer(
    { id: "widget-2" },
    {
      previewSession: null,
      clientX: 44,
      clientY: 88,
      page: 2,
      pageFallback: 2,
      suppressSurfaceTargets: true,
      allowDeleteZone: false
    },
    {
      buildDragPayloadWithPreviewOffset: (_session, payload) => payload,
      currentLauncherPageCount: () => 4,
      isPlaceholderLauncherPage: (page, pageCount) => page < 0 || page >= pageCount,
      projectWidgetBoardDropLayout: (_instance, payload, options) => {
        assert.equal(payload.clientX, 44);
        assert.equal(payload.clientY, 88);
        assert.equal(options.pageFallback, 2);
        return projection;
      },
      resolveWidgetDropPlan: (_instance, payload, options) => {
        assert.equal(payload.page, 2);
        assert.equal(options.boardProjection, projection);
        assert.equal(options.suppressSurfaceTargets, true);
        assert.equal(options.allowDeleteZone, false);
        return plan;
      }
    }
  );

  assert.equal(result.dropPlan, plan);
  assert.equal(result.boardProjection, projection);
});

test("buildDragGuideState resolves delete-zone and board guide projection", () => {
  const deleteState = buildDragGuideState(createDeleteZoneDropPlan());
  assert.equal(deleteState.deleteHovering, true);
  assert.equal(deleteState.boardGuideProjection, null);

  const boardProjection = { layout: { x: 1, y: 2, w: 3, h: 4 }, page: 2, gridLayout: null };
  const boardState = buildDragGuideState(
    createBoardPageDropPlan({
      policyPage: 3,
      internalPage: 2,
      projection: boardProjection
    })
  );
  assert.equal(boardState.deleteHovering, false);
  assert.equal(boardState.boardGuideProjection, boardProjection);
});

test("evaluateFinalWidgetDrop resolves fallback pointer and final plan", () => {
  const expectedPlan = { kind: "SPACE", marker: "planned" };
  const result = evaluateFinalWidgetDrop(
    { id: "widget-a" },
    {
      pointerEvent: {},
      fallbackX: 91,
      fallbackY: 37,
      previewSession: { id: "preview" },
      page: 4,
      pageFallback: 4,
      suppressSurfaceTargets: true,
      allowDeleteZone: false
    },
    {
      evaluateWidgetDropAtPointer: (_instance, options) => {
        assert.equal(options.clientX, 91);
        assert.equal(options.clientY, 37);
        assert.equal(options.page, 4);
        assert.equal(options.pageFallback, 4);
        assert.equal(options.suppressSurfaceTargets, true);
        assert.equal(options.allowDeleteZone, false);
        return {
          payload: { ...options, dragOffsetX: 9 },
          dropPlan: expectedPlan
        };
      }
    }
  );

  assert.equal(result.dropX, 91);
  assert.equal(result.dropY, 37);
  assert.equal(result.finalDropPlan, expectedPlan);
  assert.equal(result.finalPayload.dragOffsetX, 9);
});

test("evaluateFinalWidgetDrop falls back to NONE plan without evaluator", () => {
  const result = evaluateFinalWidgetDrop(
    { id: "widget-b" },
    {
      pointerEvent: { clientX: 10, clientY: 20 },
      fallbackX: 0,
      fallbackY: 0,
      page: 2
    },
    {}
  );

  assert.equal(result.dropX, 10);
  assert.equal(result.dropY, 20);
  assert.deepEqual(result.finalPayload, {
    clientX: 10,
    clientY: 20,
    page: 2
  });
  assert.deepEqual(result.finalDropPlan, createNoneDropPlan());
});
