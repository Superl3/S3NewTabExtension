import test from "node:test";
import assert from "node:assert/strict";

import { addLocalDays, toLocalDateKey } from "../widgets/shared/localDates.js";

test("toLocalDateKey formats local dates as stable date keys", () => {
  assert.equal(toLocalDateKey(new Date(2030, 0, 5, 23, 30)), "2030-01-05");
  assert.equal(toLocalDateKey(new Date(2030, 10, 15)), "2030-11-15");
});

test("addLocalDays returns a new local-midnight date with overflow support", () => {
  const source = new Date(2030, 0, 31, 9, 45);
  const next = addLocalDays(source, 1);
  const previous = addLocalDays(source, -31);

  assert.equal(toLocalDateKey(next), "2030-02-01");
  assert.equal(next.getHours(), 0);
  assert.equal(toLocalDateKey(previous), "2029-12-31");
  assert.equal(source.getHours(), 9);
});
