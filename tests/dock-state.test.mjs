import test from "node:test";
import assert from "node:assert/strict";

import {
  dockSlotOccupants,
  firstAvailableDockSlot,
  isWidgetDocked,
  nextDockOrder,
  normalizeDockOrder,
  normalizeDockedWidgetOrders
} from "../core/dock-state.js";

const byId = (id, overrides = {}) => ({
  id,
  enabled: true,
  dockOrder: null,
  containerId: "",
  ...overrides
});

test("normalizes dock orders and docked predicate", () => {
  assert.equal(normalizeDockOrder("3"), 3);
  assert.equal(normalizeDockOrder("bad", 7), 7);
  assert.equal(isWidgetDocked(byId("a", { dockOrder: 0 })), true);
  assert.equal(isWidgetDocked(byId("b", { dockOrder: null })), false);
});

test("computes next dock order and first available slot", () => {
  const instances = [
    byId("a", { dockOrder: 0 }),
    byId("b", { dockOrder: 2 }),
    byId("c", { dockOrder: null })
  ];

  assert.equal(nextDockOrder(instances), 3);
  assert.equal(firstAvailableDockSlot(instances, { slotCount: 4 }), 1);
});

test("collects slot occupants while excluding one widget", () => {
  const instances = [
    byId("a", { dockOrder: 0 }),
    byId("b", { dockOrder: 1 }),
    byId("c", { dockOrder: 2, containerId: "folder-1" })
  ];

  const occupied = dockSlotOccupants(instances, {
    slotCount: 4,
    excludeWidgetId: "b"
  });

  assert.equal(occupied.has(0), true);
  assert.equal(occupied.has(1), false);
  assert.equal(occupied.has(2), false);
});

test("normalizes docked widget orders and clears container dockOrder", () => {
  const instances = [
    byId("a", { dockOrder: 3 }),
    byId("b", { dockOrder: 3 }),
    byId("c", { dockOrder: 10 }),
    byId("d", { dockOrder: 1, containerId: "folder-1" })
  ];

  const changed = normalizeDockedWidgetOrders(instances, { slotCount: 3 });
  assert.equal(changed, true);

  const dockedOrders = instances
    .filter((instance) => !instance.containerId && instance.dockOrder !== null)
    .map((instance) => instance.dockOrder)
    .sort((a, b) => a - b);
  assert.deepEqual(dockedOrders, [0, 1, 2]);
  assert.equal(instances.find((instance) => instance.id === "d")?.dockOrder, null);
});
