import test from "node:test";
import assert from "node:assert/strict";

import {
  autoRefreshDoneSetForDay,
  dateAtMinute,
  parseAutoRefreshSlotsDone,
  serializeAutoRefreshSlotsDone,
  toLocalDayKey,
  updateAutoRefreshSlotsDoneForToday
} from "../widgets/shared/autoRefreshSlots.js";

test("auto refresh slot helpers parse and serialize bounded slot indexes", () => {
  const done = parseAutoRefreshSlotsDone("2,0,3,bad,1", 3);
  assert.deepEqual(Array.from(done).sort(), [0, 1, 2]);
  assert.equal(serializeAutoRefreshSlotsDone(done), "0,1,2");
  assert.deepEqual(Array.from(parseAutoRefreshSlotsDone("0,4", 0)), []);
});

test("auto refresh slot helpers preserve local day and minute semantics", () => {
  const source = new Date(2026, 3, 2, 8, 15, 30);
  assert.equal(toLocalDayKey(source), "2026-04-02");

  const scheduled = dateAtMinute(source, 13 * 60 + 5);
  assert.equal(scheduled.getFullYear(), 2026);
  assert.equal(scheduled.getMonth(), 3);
  assert.equal(scheduled.getDate(), 2);
  assert.equal(scheduled.getHours(), 13);
  assert.equal(scheduled.getMinutes(), 5);
  assert.equal(scheduled.getSeconds(), 0);
});

test("auto refresh slot helpers update done state for the active day only", () => {
  const now = new Date(2026, 3, 2, 14, 0, 0);
  const config = {
    autoRefreshDayKey: "2026-04-02",
    autoRefreshSlotsDone: "0"
  };

  assert.deepEqual(Array.from(autoRefreshDoneSetForDay(config, "2026-04-02", 3)).sort(), [0]);
  assert.deepEqual(Array.from(autoRefreshDoneSetForDay(config, "2026-04-03", 3)), []);
  assert.deepEqual(
    updateAutoRefreshSlotsDoneForToday(config, now, [1, 2], 3),
    {
      dayKey: "2026-04-02",
      slotsDone: "0,1,2"
    }
  );
});
