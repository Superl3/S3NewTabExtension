import test from "node:test";
import assert from "node:assert/strict";

import {
  assertAlarmEventContract,
  dispatchAlarmNotification,
  isAlarmEventContract
} from "../core/alarm/notification-dispatcher.js";
import { buildTodoAlarmEventsForContractTest } from "../widgets/todo.js";

function createAlarmEvent(overrides = {}) {
  return {
    key: "todo-global|item-1|due|1893456000000",
    at: 1893456000000,
    title: "TODO due",
    body: "Write tests",
    ...overrides
  };
}

test("assertAlarmEventContract returns the minimal canonical alarm event shape", () => {
  const event = assertAlarmEventContract(
    createAlarmEvent({
      key: " key-1 ",
      title: " TODO due ",
      body: " Write tests "
    })
  );

  assert.deepEqual(event, {
    key: "key-1",
    at: 1893456000000,
    title: "TODO due",
    body: "Write tests"
  });
});

test("isAlarmEventContract rejects incomplete alarm event payloads", () => {
  assert.equal(isAlarmEventContract(createAlarmEvent()), true);
  assert.equal(isAlarmEventContract(createAlarmEvent({ body: "" })), false);
  assert.equal(isAlarmEventContract(createAlarmEvent({ at: Number.NaN })), false);
  assert.throws(() => assertAlarmEventContract(createAlarmEvent({ title: " " })), /Alarm event must include key, at, title, and body/);
});

test("dispatchAlarmNotification skips dispatch when Notification API is unavailable", () => {
  const result = dispatchAlarmNotification(createAlarmEvent(), {
    notificationApi: undefined
  });

  assert.equal(result, null);
});

test("dispatchAlarmNotification skips dispatch when permission is not granted", () => {
  function FakeNotification() {}
  FakeNotification.permission = "default";

  const result = dispatchAlarmNotification(createAlarmEvent(), {
    notificationApi: FakeNotification
  });

  assert.equal(result, null);
});

test("dispatchAlarmNotification uses only title, body, and key-derived tag", () => {
  const calls = [];

  function FakeNotification(title, options) {
    calls.push({ title, options });
    return { title, options };
  }

  FakeNotification.permission = "granted";

  const result = dispatchAlarmNotification(
    createAlarmEvent({
      extraField: "ignored",
      repeat: "daily"
    }),
    { notificationApi: FakeNotification }
  );

  assert.deepEqual(calls, [
    {
      title: "TODO due",
      options: {
        body: "Write tests",
        tag: "todo-global|item-1|due|1893456000000"
      }
    }
  ]);
  assert.deepEqual(result, calls[0]);
});

test("todo alarm adapter builds events that satisfy the shared contract without moving recurrence into dispatcher", () => {
  const dueAt = new Date(2030, 0, 15, 9, 0, 0, 0).getTime();
  const rangeStartMs = dueAt - 1;
  const rangeEndMs = dueAt;
  const events = buildTodoAlarmEventsForContractTest(
    {
      id: "item-1",
      text: "Prepare release",
      alarm: {
        repeat: "none",
        time: "09:00",
        interval: "off",
        reminderBefore: "none",
        singleDate: "2030-01-15"
      }
    },
    "todo-global",
    rangeStartMs,
    rangeEndMs
  );

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    key: `todo-global|item-1|due|${dueAt}`,
    at: dueAt,
    title: "TODO due",
    body: "Prepare release"
  });
  assert.equal(isAlarmEventContract(events[0]), true);
});
