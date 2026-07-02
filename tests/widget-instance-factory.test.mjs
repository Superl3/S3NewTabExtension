import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFreeLayoutPlacement,
  createWidgetInstanceDraft
} from "../core/widget-instance-factory.js";

const deps = {
  normalizeText: (value, fallback) => String(value || "").trim() || fallback,
  isHeadlessDefaultType: (type) => type === "clock",
  isHeadlessTransparentDefaultType: (type) => type === "clock",
  defaultWidgetBackdropBlur: () => true,
  defaultWidgetTitleAlign: () => "center",
  defaultWidgetContentAlign: () => "top",
  normalizeCommonOverrides: () => ({}),
  normalizeGridLayout: (_layout, fallback) => ({ ...fallback }),
  cloneLayout: (layout) => ({ ...layout })
};

test("createWidgetInstanceDraft builds expected defaults", () => {
  const instance = createWidgetInstanceDraft(
    {
      type: "clock",
      def: {
        title: "Clock",
        defaultConfig: { tz: "UTC" },
        defaultLayout: { x: 10, y: 20, w: 200, h: 100 }
      },
      options: { title: "  Custom Clock " },
      nextId: 5,
      zIndex: 11,
      targetPage: 3,
      gridPlacement: { col: 2, row: 1, colSpan: 2, rowSpan: 2 },
      pageLocalIndex: 4,
      colSpan: 2,
      rowSpan: 2,
      defaultPadding: 9
    },
    deps
  );

  assert.equal(instance.id, "clock-5");
  assert.equal(instance.title, "Custom Clock");
  assert.equal(instance.viewMode, "headless");
  assert.equal(instance.surfaceMode, "transparent");
  assert.equal(instance.page, 3);
  assert.deepEqual(instance.config, { tz: "UTC" });
  assert.deepEqual(instance.gridLayout, { col: 2, row: 1, colSpan: 2, rowSpan: 2 });
  assert.deepEqual(instance.layout, { x: 10, y: 20, w: 200, h: 100 });
});

test("applyFreeLayoutPlacement offsets and scales layout with clamping", () => {
  const instance = {
    layout: { x: 0, y: 0, w: 120, h: 90 }
  };

  applyFreeLayoutPlacement(
    instance,
    {
      pageLocalIndex: 7,
      colSpan: 3,
      rowSpan: 2,
      defaultSize: { colSpan: 1, rowSpan: 1 },
      boardRect: { width: 260, height: 180 }
    },
    {
      clamp: (value, min, max) => Math.min(max, Math.max(min, value))
    }
  );

  assert.deepEqual(instance.layout, {
    x: 24,
    y: 72,
    w: 260,
    h: 180
  });
});

test("applyFreeLayoutPlacement preserves truthy size fallback semantics", () => {
  const instance = {
    layout: { x: 0, y: 0, w: 100, h: 90 }
  };

  applyFreeLayoutPlacement(instance, {
    pageLocalIndex: 0,
    colSpan: 2,
    rowSpan: 2,
    defaultSize: { colSpan: 0, rowSpan: "bad" },
    boardRect: { width: "220", height: "150" }
  });

  assert.deepEqual(instance.layout, {
    x: 0,
    y: 0,
    w: 200,
    h: 150
  });
});
