import test from "node:test";
import assert from "node:assert/strict";

import {
  countBoardWidgetsOnPage,
  resolveRequestedWidgetSpans
} from "../core/widget-add-plan.js";

test("countBoardWidgetsOnPage counts only board widgets on target page", () => {
  const count = countBoardWidgetsOnPage(
    [
      { id: "a", page: 0 },
      { id: "b", page: 1 },
      { id: "c", page: 0 },
      { id: "d", page: 0 }
    ],
    0,
    3,
    {
      isWidgetDocked: (instance) => instance.id === "c",
      isWidgetInContainer: (instance) => instance.id === "d",
      normalizeWidgetPage: (page) => Number(page)
    }
  );

  assert.equal(count, 1);
});

test("resolveRequestedWidgetSpans forces container size to 1x1", () => {
  const spans = resolveRequestedWidgetSpans(
    "container",
    { colSpan: 4, rowSpan: 5 },
    { colSpan: 2, rowSpan: 2 },
    {
      normalizeGridSpanValue: (value) => Number(value),
      maxColumns: 16,
      maxRows: 24
    }
  );

  assert.deepEqual(spans, {
    requestedColSpan: 4,
    requestedRowSpan: 5,
    colSpan: 1,
    rowSpan: 1
  });
});

test("resolveRequestedWidgetSpans uses normalized spans for normal widgets", () => {
  const spans = resolveRequestedWidgetSpans(
    "weather",
    { colSpan: 3, rowSpan: 2 },
    { colSpan: 1, rowSpan: 1 },
    {
      normalizeGridSpanValue: (value) => Number(value),
      maxColumns: 16,
      maxRows: 24
    }
  );

  assert.deepEqual(spans, {
    requestedColSpan: 3,
    requestedRowSpan: 2,
    colSpan: 3,
    rowSpan: 2
  });
});
