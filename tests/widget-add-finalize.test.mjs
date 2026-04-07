import test from "node:test";
import assert from "node:assert/strict";

import { finalizeWidgetAddAction } from "../core/widget-add-finalize.js";

test("finalizeWidgetAddAction returns false when add failed", () => {
  let closed = 0;
  let opened = 0;

  const result = finalizeWidgetAddAction({
    added: false,
    addedInstanceId: "widget-1",
    isAddWidgetModalOpen: () => true,
    closeAddWidgetModal: () => {
      closed += 1;
    },
    openWidgetModal: () => {
      opened += 1;
    }
  });

  assert.equal(result, false);
  assert.equal(closed, 0);
  assert.equal(opened, 0);
});

test("finalizeWidgetAddAction closes add modal and opens widget settings", () => {
  let closed = 0;
  const openCalls = [];

  const result = finalizeWidgetAddAction({
    added: true,
    addedInstanceId: "widget-5",
    isAddWidgetModalOpen: () => true,
    closeAddWidgetModal: () => {
      closed += 1;
    },
    openWidgetModal: (instanceId, options) => {
      openCalls.push({ instanceId, options });
    }
  });

  assert.equal(result, true);
  assert.equal(closed, 1);
  assert.deepEqual(openCalls, [
    {
      instanceId: "widget-5",
      options: undefined
    }
  ]);
});

test("finalizeWidgetAddAction skips settings open when widget id is missing", () => {
  let closed = 0;
  let opened = 0;

  const result = finalizeWidgetAddAction({
    added: true,
    addedInstanceId: "",
    isAddWidgetModalOpen: () => false,
    closeAddWidgetModal: () => {
      closed += 1;
    },
    openWidgetModal: () => {
      opened += 1;
    }
  });

  assert.equal(result, true);
  assert.equal(closed, 0);
  assert.equal(opened, 0);
});
