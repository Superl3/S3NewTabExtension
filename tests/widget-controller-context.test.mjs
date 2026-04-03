import test from "node:test";
import assert from "node:assert/strict";

import { buildWidgetControllerContext } from "../core/widget-controller-context.js";

test("buildWidgetControllerContext routes patching and openSettings", () => {
  const patchCalls = [];
  const openCalls = [];

  const ctx = buildWidgetControllerContext({
    widgetId: "w1",
    getWidget: () => ({ id: "w1", config: { a: 1 } }),
    patchWidgetConfig: (id, patch, options) => {
      patchCalls.push({ id, patch, options });
    },
    isEditMode: () => true,
    openWidgetSettingsById: (id) => {
      openCalls.push(id);
    }
  });

  ctx.patchConfig({ a: 2 }, { record: false });
  ctx.patchWidgetConfigById("w2", { b: 3 }, { label: "x" });
  ctx.openSettings();

  assert.deepEqual(patchCalls, [
    { id: "w1", patch: { a: 2 }, options: { record: false } },
    { id: "w2", patch: { b: 3 }, options: { label: "x" } }
  ]);
  assert.deepEqual(openCalls, ["w1"]);
});

test("buildWidgetControllerContext dropWidgetToDockByPointer triggers rerender on move", () => {
  let renderCount = 0;
  let saveCount = 0;

  const ctx = buildWidgetControllerContext({
    widgetId: "w1",
    tryDockWidgetByDrop: () => true,
    renderBoard: () => {
      renderCount += 1;
    },
    queueSave: () => {
      saveCount += 1;
    }
  });

  const moved = ctx.dropWidgetToDockByPointer({ id: "w1" }, { clientX: 1, clientY: 2 }, {});

  assert.equal(moved, true);
  assert.equal(renderCount, 1);
  assert.equal(saveCount, 1);
});

test("buildWidgetControllerContext adds createWidgetDropSilhouette only when provided", () => {
  const ctxWithout = buildWidgetControllerContext({ widgetId: "w1" });
  assert.equal(Object.hasOwn(ctxWithout, "createWidgetDropSilhouette"), false);

  const ctxWith = buildWidgetControllerContext({
    widgetId: "w1",
    createWidgetDropSilhouette: () => ({ id: "sil" })
  });
  assert.equal(typeof ctxWith.createWidgetDropSilhouette, "function");
});

test("buildWidgetControllerContext openWidgetSettingsById stays edit-mode guarded", () => {
  const openCalls = [];
  const ctx = buildWidgetControllerContext({
    widgetId: "w1",
    isEditMode: () => false,
    openWidgetSettingsById: (id) => {
      openCalls.push(id);
    }
  });

  ctx.openWidgetSettingsById("w2");
  ctx.openSettings();

  assert.deepEqual(openCalls, []);
});
