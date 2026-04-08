import test from "node:test";
import assert from "node:assert/strict";

import { commitPendingEditableState, isPendingEditableField } from "../core/pending-edit-commit.js";

function createField({ tagName = "INPUT", type = "text", disabled = false, readOnly = false } = {}) {
  return {
    tagName,
    type,
    disabled,
    readOnly,
    events: [],
    ownerDocument: {
      defaultView: {
        Event
      }
    },
    dispatchEvent(event) {
      this.events.push(event.type);
      return true;
    }
  };
}

test("isPendingEditableField only matches text-like editable fields", () => {
  assert.equal(isPendingEditableField(createField({ type: "text" })), true);
  assert.equal(isPendingEditableField(createField({ tagName: "TEXTAREA" })), true);
  assert.equal(isPendingEditableField(createField({ type: "checkbox" })), false);
  assert.equal(isPendingEditableField(createField({ type: "file" })), false);
  assert.equal(isPendingEditableField(createField({ type: "text", readOnly: true })), false);
});

test("commitPendingEditableState commits active field by default", () => {
  const activeElement = createField({ type: "text" });
  const root = {
    activeElement,
    contains(field) {
      return field === activeElement;
    }
  };

  assert.equal(commitPendingEditableState(root), 1);
  assert.deepEqual(activeElement.events, ["change"]);
});

test("commitPendingEditableState can commit descendant text inputs", () => {
  const activeElement = createField({ type: "text" });
  const descendant = createField({ tagName: "TEXTAREA" });
  const ignored = createField({ type: "checkbox" });
  const root = {
    activeElement,
    contains() {
      return true;
    },
    querySelectorAll() {
      return [activeElement, descendant, ignored];
    }
  };

  assert.equal(commitPendingEditableState(root, { includeDescendants: true }), 2);
  assert.deepEqual(activeElement.events, ["change"]);
  assert.deepEqual(descendant.events, ["change"]);
  assert.deepEqual(ignored.events, []);
});
