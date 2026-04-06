import test from "node:test";
import assert from "node:assert/strict";

import { applyAddWidgetModalAction } from "../core/add-widget-modal-apply.js";

function createDeps(overrides = {}) {
  return {
    widgetRegistry: {
      note: { title: "Note" },
      container: { title: "Container" }
    },
    widgetDefaultGridSize: () => ({ colSpan: 2, rowSpan: 3 }),
    normalizeText: (value, fallback) => {
      const text = String(value || "").trim();
      return text || fallback;
    },
    addWidget: () => true,
    closeAddWidgetModal: () => {},
    ...overrides
  };
}

test("applyAddWidgetModalAction returns false for unknown widget type", () => {
  const added = applyAddWidgetModalAction(
    {
      type: "missing",
      titleInputValue: "My Widget"
    },
    createDeps()
  );

  assert.equal(added, false);
});

test("applyAddWidgetModalAction closes modal when add succeeds", () => {
  const calls = {
    close: 0,
    add: []
  };

  const added = applyAddWidgetModalAction(
    {
      type: "note",
      titleInputValue: "Custom Note",
      allowUseModeAdd: true
    },
    createDeps({
      addWidget: (type, options) => {
        calls.add.push({ type, options });
        return true;
      },
      closeAddWidgetModal: () => {
        calls.close += 1;
      }
    })
  );

  assert.equal(added, true);
  assert.equal(calls.close, 1);
  assert.deepEqual(calls.add, [
    {
      type: "note",
      options: {
        colSpan: 2,
        rowSpan: 3,
        title: "Custom Note",
        allowUseModeAdd: true
      }
    }
  ]);
});

test("applyAddWidgetModalAction keeps modal open when add fails", () => {
  let close = 0;

  const added = applyAddWidgetModalAction(
    {
      type: "container",
      titleInputValue: ""
    },
    createDeps({
      addWidget: () => false,
      closeAddWidgetModal: () => {
        close += 1;
      }
    })
  );

  assert.equal(added, false);
  assert.equal(close, 0);
});

test("applyAddWidgetModalAction still closes when add throws after successful mutation", () => {
  let close = 0;

  const added = applyAddWidgetModalAction(
    {
      type: "note",
      titleInputValue: "Crash path"
    },
    createDeps({
      markAddAttempt: () => ({ instances: 10, nextId: 30 }),
      didAddWidgetAfterError: () => true,
      addWidget: () => {
        throw new Error("post-add runtime failure");
      },
      closeAddWidgetModal: () => {
        close += 1;
      }
    })
  );

  assert.equal(added, true);
  assert.equal(close, 1);
});
