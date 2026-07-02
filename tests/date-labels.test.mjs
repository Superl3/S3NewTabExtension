import test from "node:test";
import assert from "node:assert/strict";

import { formatLocalDateTimeLabel } from "../widgets/shared/dateLabels.js";

test("formatLocalDateTimeLabel preserves invalid and local date label semantics", () => {
  assert.equal(formatLocalDateTimeLabel("not-a-date"), "");
  assert.equal(
    formatLocalDateTimeLabel("2026-04-02T12:34:00Z"),
    new Date(Date.parse("2026-04-02T12:34:00Z")).toLocaleString()
  );
});
