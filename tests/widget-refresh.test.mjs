import test from "node:test";
import assert from "node:assert/strict";

import { refreshWidgetController } from "../core/widget-refresh.js";

test("refreshWidgetController uses passive refresh without triggering manual refresh", () => {
  const calls = [];

  refreshWidgetController({
    refresh: () => {
      calls.push("refresh");
    },
    manualRefresh: () => {
      calls.push("manualRefresh");
    }
  });

  assert.deepEqual(calls, ["refresh"]);
});

test("refreshWidgetController does not force widgets that only expose manual refresh", () => {
  const calls = [];

  refreshWidgetController({
    manualRefresh: () => {
      calls.push("manualRefresh");
    }
  });

  assert.deepEqual(calls, []);
});

