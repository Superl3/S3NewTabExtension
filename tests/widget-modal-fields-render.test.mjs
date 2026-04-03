import test from "node:test";
import assert from "node:assert/strict";

import { shouldRerenderOnModalFieldChange } from "../core/widget-modal-fields-render.js";

test("shouldRerenderOnModalFieldChange only rerenders for useCustomColors", () => {
  assert.equal(shouldRerenderOnModalFieldChange({ key: "useCustomColors" }), true);
  assert.equal(shouldRerenderOnModalFieldChange({ key: "title" }), false);
  assert.equal(shouldRerenderOnModalFieldChange({}), false);
});
