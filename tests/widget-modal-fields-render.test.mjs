import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldSkipModalFieldValueSync,
  shouldRerenderOnModalFieldChange,
  shouldSyncModalFieldOnInput
} from "../core/widget-modal-fields-render.js";

test("shouldRerenderOnModalFieldChange only rerenders for useCustomColors", () => {
  assert.equal(shouldRerenderOnModalFieldChange({ key: "useCustomColors" }), true);
  assert.equal(shouldRerenderOnModalFieldChange({ key: "title" }), false);
  assert.equal(shouldRerenderOnModalFieldChange({}), false);
});

test("shouldSyncModalFieldOnInput keeps text-like widget fields live", () => {
  assert.equal(shouldSyncModalFieldOnInput({ type: "text" }), true);
  assert.equal(shouldSyncModalFieldOnInput({ type: "number" }), true);
  assert.equal(shouldSyncModalFieldOnInput({ type: "textarea" }), true);
  assert.equal(shouldSyncModalFieldOnInput({ type: "select" }), false);
  assert.equal(shouldSyncModalFieldOnInput({ type: "checkbox" }), false);
  assert.equal(shouldSyncModalFieldOnInput({ type: "color" }), false);
});

test("shouldSkipModalFieldValueSync ignores blank or invalid number input", () => {
  assert.equal(shouldSkipModalFieldValueSync({ type: "number" }, { value: "", validity: { badInput: false } }), true);
  assert.equal(shouldSkipModalFieldValueSync({ type: "number" }, { value: "120", validity: { badInput: false } }), false);
  assert.equal(shouldSkipModalFieldValueSync({ type: "number" }, { value: "abc", validity: { badInput: true } }), true);
  assert.equal(shouldSkipModalFieldValueSync({ type: "text" }, { value: "" }), false);
});
