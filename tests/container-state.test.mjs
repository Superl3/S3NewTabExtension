import test from "node:test";
import assert from "node:assert/strict";

import {
  isWidgetInContainer,
  normalizeContainerAssignments,
  normalizeContainerId
} from "../core/container-state.js";

test("normalizes container ids", () => {
  assert.equal(normalizeContainerId("  folder-1 "), "folder-1");
  assert.equal(normalizeContainerId(null), "");
});

test("detects whether widget belongs to container", () => {
  assert.equal(isWidgetInContainer({ containerId: "abc" }), true);
  assert.equal(isWidgetInContainer({ containerId: "   " }), false);
});

test("normalizes container assignments and clears invalid links", () => {
  const instances = [
    { id: "folder-1", type: "container", containerId: "x", dockOrder: 1 },
    { id: "widget-a", type: "todo", containerId: "folder-1", dockOrder: 2 },
    { id: "widget-b", type: "notes", containerId: "missing", dockOrder: 3 },
    { id: "widget-c", type: "label", containerId: "widget-c", dockOrder: 4 }
  ];

  normalizeContainerAssignments(instances);

  const folder = instances.find((instance) => instance.id === "folder-1");
  const widgetA = instances.find((instance) => instance.id === "widget-a");
  const widgetB = instances.find((instance) => instance.id === "widget-b");
  const widgetC = instances.find((instance) => instance.id === "widget-c");

  assert.equal(folder?.containerId, "");
  assert.equal(widgetA?.containerId, "folder-1");
  assert.equal(widgetA?.dockOrder, null);
  assert.equal(widgetB?.containerId, "");
  assert.equal(widgetC?.containerId, "");
});
