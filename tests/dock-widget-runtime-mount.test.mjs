import test from "node:test";
import assert from "node:assert/strict";

import { mountDockWidgetRuntime } from "../core/dock-widget-runtime-mount.js";

test("mountDockWidgetRuntime mounts controller when widget definition has create", () => {
  const slot = { append() {} };
  const item = { id: "w1", type: "clock" };
  const mounted = [];
  let receivedContext = null;

  const result = mountDockWidgetRuntime({
    item,
    slot,
    label: "Clock",
    widgetRegistry: {
      clock: {
        create: (context) => {
          receivedContext = context;
          return {
            destroy() {}
          };
        }
      }
    },
    runtimeDeps: {
      getUi: () => ({ theme: {} }),
      getAllWidgets: () => [item],
      getWidgetDefinition: () => ({ title: "Clock" }),
      getGridMetrics: () => ({ cols: 4, rows: 4 }),
      getWidgetRuntimeCard: () => null,
      isEditMode: () => true,
      openWidgetSettingsById: () => {}
    },
    onControllerMounted: (widgetId, controller) => {
      mounted.push({ widgetId, controller });
    }
  });

  assert.equal(result, true);
  assert.equal(receivedContext.container, slot);
  assert.equal(typeof receivedContext.patchConfig, "function");
  assert.deepEqual(mounted.map((entry) => entry.widgetId), ["w1"]);
});

test("mountDockWidgetRuntime appends fallback icon when controller not available", () => {
  const appended = [];
  const slot = {
    append(node) {
      appended.push(node);
    }
  };

  const result = mountDockWidgetRuntime({
    item: { id: "w2", type: "unknown" },
    slot,
    label: "  alpha  ",
    widgetRegistry: {},
    documentObj: {
      createElement: (tagName) => ({
        tagName,
        className: "",
        textContent: ""
      })
    }
  });

  assert.equal(result, false);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].className, "dock-item-icon");
  assert.equal(appended[0].textContent, "A");
});
