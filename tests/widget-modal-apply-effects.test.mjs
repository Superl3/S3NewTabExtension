import test from "node:test";
import assert from "node:assert/strict";

import {
  refreshWidgetRuntimeAfterModalApply,
  syncWidgetStateAfterModalApply
} from "../core/widget-modal-apply-effects.js";

test("syncWidgetStateAfterModalApply updates overrides and active page", () => {
  const instance = { id: "w1", page: 3 };
  const calls = [];

  syncWidgetStateAfterModalApply(instance, 1, {
    inferCommonOverrides: () => ({ a: 1 }),
    widgetCommonMaster: { m: 1 },
    syncLauncherPagingState: (arg) => calls.push(["sync", arg]),
    setActivePage: (page) => calls.push(["active", page])
  });

  assert.deepEqual(instance.commonOverrides, { a: 1 });
  assert.deepEqual(calls, [
    ["sync", { expandToFitInstances: true }],
    ["active", 3]
  ]);
});

test("refreshWidgetRuntimeAfterModalApply refreshes runtime card when mounted", () => {
  const titleNode = { textContent: "" };
  const runtime = {
    card: {
      querySelector: () => titleNode
    },
    controller: {
      manualRefresh: () => {
        titleNode.refreshed = "manual";
      },
      refresh: () => {
        titleNode.refreshed = "refresh";
      }
    }
  };

  const calls = [];
  refreshWidgetRuntimeAfterModalApply(
    {
      id: "w1",
      title: "Widget",
      layout: { x: 1, y: 2, w: 3, h: 4 },
      page: 2
    },
    "Fallback",
    {
      runtimeMap: new Map([["w1", runtime]]),
      applyLayout: (...args) => calls.push(["layout", ...args]),
      applyCardVisual: (...args) => calls.push(["visual", ...args]),
      refreshWidgetsByType: () => calls.push(["refreshContainer"]),
      isWidgetInContainer: () => false
    }
  );

  assert.equal(titleNode.textContent, "Widget");
  assert.equal(titleNode.refreshed, "manual");
  assert.equal(calls[0][0], "layout");
  assert.equal(calls[1][0], "visual");
});

test("refreshWidgetRuntimeAfterModalApply falls back to refresh when manualRefresh is unavailable", () => {
  const titleNode = { textContent: "" };
  const runtime = {
    card: {
      querySelector: () => titleNode
    },
    controller: {
      refresh: () => {
        titleNode.refreshed = "refresh";
      }
    }
  };

  refreshWidgetRuntimeAfterModalApply(
    {
      id: "w-refresh-only",
      title: "Widget",
      layout: { x: 1, y: 2, w: 3, h: 4 },
      page: 2
    },
    "Fallback",
    {
      runtimeMap: new Map([["w-refresh-only", runtime]]),
      applyLayout: () => {},
      applyCardVisual: () => {},
      refreshWidgetsByType: () => {},
      isWidgetInContainer: () => false
    }
  );

  assert.equal(titleNode.refreshed, "refresh");
});

test("refreshWidgetRuntimeAfterModalApply refreshes containers for unmounted contained widget", () => {
  const calls = [];
  refreshWidgetRuntimeAfterModalApply(
    { id: "w2" },
    "Fallback",
    {
      runtimeMap: new Map(),
      refreshWidgetsByType: (type) => calls.push(type),
      isWidgetInContainer: () => true
    }
  );

  assert.deepEqual(calls, ["container"]);
});

test("refreshWidgetRuntimeAfterModalApply refreshes dock for unmounted docked widget", () => {
  const calls = [];
  refreshWidgetRuntimeAfterModalApply(
    { id: "w3" },
    "Fallback",
    {
      runtimeMap: new Map(),
      refreshWidgetsByType: () => calls.push("container"),
      isWidgetInContainer: () => false,
      isWidgetDocked: () => true,
      renderDockWidgets: () => calls.push("dock")
    }
  );

  assert.deepEqual(calls, ["dock"]);
});

test("refreshWidgetRuntimeAfterModalApply prefers dock refresh for docked widget even with runtime", () => {
  const calls = [];
  const runtime = {
    card: {
      querySelector: () => ({ textContent: "" })
    },
    controller: {
      refresh: () => {
        calls.push("runtime-refresh");
      }
    }
  };

  refreshWidgetRuntimeAfterModalApply(
    {
      id: "w4",
      title: "Docked",
      layout: { x: 1, y: 1, w: 1, h: 1 },
      page: 0
    },
    "Fallback",
    {
      runtimeMap: new Map([["w4", runtime]]),
      applyLayout: () => calls.push("layout"),
      applyCardVisual: () => calls.push("visual"),
      refreshWidgetsByType: () => calls.push("container"),
      isWidgetInContainer: () => false,
      isWidgetDocked: () => true,
      renderDockWidgets: () => calls.push("dock")
    }
  );

  assert.deepEqual(calls, ["dock"]);
});
