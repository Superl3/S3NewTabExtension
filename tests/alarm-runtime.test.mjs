import test from "node:test";
import assert from "node:assert/strict";

import { createAlarmRuntime } from "../core/alarm/alarm-runtime.js";
import { createTodoAlarmRuntimeAdapterForTest } from "../widgets/todo.js";

function createRuntimeHarness(options = {}) {
  let now = options.now ?? 10_000;
  let nextTimerId = 1;
  const scheduled = new Map();
  const clearedTimerIds = [];
  const rangeCalls = [];
  const emittedEvents = [];
  let events = options.events ?? [];

  const runtime = createAlarmRuntime({
    tickMs: options.tickMs ?? 30_000,
    dedupeTtlMs: options.dedupeTtlMs ?? 1_000,
    maxCatchupMs: options.maxCatchupMs ?? 120_000,
    getNow: () => now,
    scheduleTimeout(callback, delay) {
      const timerId = nextTimerId;
      nextTimerId += 1;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearScheduledTimeout(timerId) {
      clearedTimerIds.push(timerId);
      scheduled.delete(timerId);
    },
    listOwnerEvents(owner, rangeStartMs, rangeEndMs, ownerId) {
      rangeCalls.push({ owner, ownerId, rangeStartMs, rangeEndMs });
      return typeof events === "function" ? events({ owner, ownerId, rangeStartMs, rangeEndMs }) : events;
    },
    emitEvent(event, owner, emittedAt) {
      emittedEvents.push({ event, owner, emittedAt });
      return options.emitResult ?? true;
    }
  });

  return {
    runtime,
    emittedEvents,
    rangeCalls,
    scheduled,
    clearedTimerIds,
    setNow(value) {
      now = value;
    },
    setEvents(value) {
      events = value;
    },
    runScheduledTick() {
      const [timerId, timer] = scheduled.entries().next().value ?? [];
      assert.ok(timerId, "Expected a scheduled timer.");
      scheduled.delete(timerId);
      timer.callback();
      return timerId;
    }
  };
}

test("register triggers an immediate tick and schedules the next runtime tick", () => {
  const harness = createRuntimeHarness({
    now: 30_000,
    events: [{ key: "owner-a|due|30000", at: 30_000 }]
  });

  harness.runtime.register("owner-a", { scopeId: "todo-a" });

  assert.equal(harness.emittedEvents.length, 1);
  assert.deepEqual(harness.rangeCalls[0], {
    owner: { scopeId: "todo-a" },
    ownerId: "owner-a",
    rangeStartMs: 29_000,
    rangeEndMs: 30_000
  });
  assert.equal(harness.scheduled.size, 1);
  const scheduledEntry = [...harness.scheduled.values()][0];
  assert.equal(scheduledEntry.delay, 30_000);
});

test("runtime dedupes fired events until the dedupe ttl expires", () => {
  const harness = createRuntimeHarness({
    now: 30_000,
    dedupeTtlMs: 1_000,
    events: ({ rangeEndMs }) => [{ key: "owner-a|due", at: rangeEndMs }]
  });

  harness.runtime.register("owner-a", { scopeId: "todo-a" });
  assert.equal(harness.emittedEvents.length, 1);

  harness.setNow(30_500);
  harness.runtime.kick();
  assert.equal(harness.emittedEvents.length, 1);

  harness.setNow(31_200);
  harness.runtime.kick();
  assert.equal(harness.emittedEvents.length, 2);
});

test("runtime limits catch-up to the configured window and ignores stale events", () => {
  const harness = createRuntimeHarness({
    now: 10_000,
    maxCatchupMs: 2_000,
    events: ({ rangeStartMs, rangeEndMs }) => [
      { key: "too-old", at: rangeStartMs },
      { key: "within-window", at: rangeEndMs - 1 },
      { key: "future", at: rangeEndMs + 1 }
    ]
  });

  harness.runtime.register("owner-a", { scopeId: "todo-a" });
  harness.runScheduledTick();

  harness.setNow(20_000);
  harness.runtime.kick();

  assert.deepEqual(harness.rangeCalls.at(-1), {
    owner: { scopeId: "todo-a" },
    ownerId: "owner-a",
    rangeStartMs: 18_000,
    rangeEndMs: 20_000
  });
  assert.deepEqual(
    harness.emittedEvents.map(({ event }) => event.key),
    ["within-window", "within-window"]
  );
});

test("unregister clears the pending timer when the last owner is removed", () => {
  const harness = createRuntimeHarness({
    now: 30_000,
    events: []
  });

  harness.runtime.register("owner-a", { scopeId: "todo-a" });
  const scheduledTimerId = [...harness.scheduled.keys()][0];

  harness.runtime.unregister("owner-a");

  assert.deepEqual(harness.clearedTimerIds, [scheduledTimerId]);
  assert.equal(harness.scheduled.size, 0);
});

test("register works with timeout functions that require global this binding", () => {
  let scheduledDelay = null;

  const timerHost = {
    scheduleTimeout(_callback, delay) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      scheduledDelay = delay;
      return 1;
    },
    clearScheduledTimeout() {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
    }
  };

  const runtime = createAlarmRuntime({
    tickMs: 30_000,
    dedupeTtlMs: 1_000,
    maxCatchupMs: 120_000,
    listOwnerEvents() {
      return [];
    },
    emitEvent() {
      return true;
    },
    scheduleTimeout: timerHost.scheduleTimeout,
    clearScheduledTimeout: timerHost.clearScheduledTimeout
  });

  assert.doesNotThrow(() => {
    runtime.register("owner", { scopeId: "todo-scope" });
  });
  assert.equal(scheduledDelay, 30_000);
});

test("todo alarm adapter lets the shared runtime schedule and dispatch todo events", () => {
  const dispatched = [];
  const dueAt = new Date(2030, 0, 15, 9, 0, 0, 0).getTime();
  const adapter = createTodoAlarmRuntimeAdapterForTest({
    notificationApi: { permission: "granted" },
    dispatchNotification(event, deps) {
      dispatched.push({ event, deps });
      return { ok: true };
    }
  });

  const runtime = createAlarmRuntime({
    ...adapter,
    getNow: () => dueAt,
    tickMs: 30_000,
    dedupeTtlMs: 1_000,
    maxCatchupMs: 120_000,
    scheduleTimeout() {
      return 1;
    },
    clearScheduledTimeout() {}
  });

  runtime.register("todo-owner", {
    scopeId: "todo-scope",
    getItems() {
      return [
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
        }
      ];
    }
  });

  assert.equal(dispatched.length, 1);
  assert.deepEqual(dispatched[0], {
    event: {
      key: `todo-scope|item-1|due|${dueAt}`,
      at: dueAt,
      title: "TODO due",
      body: "Prepare release"
    },
    deps: {
      notificationApi: { permission: "granted" }
    }
  });
});

test("todo alarm adapter ignores blank todo text without breaking runtime register", () => {
  const dueAt = new Date(2030, 0, 15, 9, 0, 0, 0).getTime();
  const issuedNotifications = [];

  function MockNotification(title, options) {
    issuedNotifications.push({ title, options });
  }
  MockNotification.permission = "granted";

  const adapter = createTodoAlarmRuntimeAdapterForTest({
    notificationApi: MockNotification
  });

  const runtime = createAlarmRuntime({
    ...adapter,
    getNow: () => dueAt,
    tickMs: 30_000,
    dedupeTtlMs: 1_000,
    maxCatchupMs: 120_000,
    scheduleTimeout() {
      return 1;
    },
    clearScheduledTimeout() {}
  });

  assert.doesNotThrow(() => {
    runtime.register("todo-owner", {
      scopeId: "todo-scope",
      getItems() {
        return [
          {
            id: "item-empty",
            text: "   ",
            alarm: {
              repeat: "none",
              time: "09:00",
              interval: "off",
              reminderBefore: "none",
              singleDate: "2030-01-15"
            }
          }
        ];
      }
    });
  });

  assert.equal(issuedNotifications.length, 0);
});

test("todo alarm adapter swallows notification constructor errors during register", () => {
  const dueAt = new Date(2030, 0, 15, 9, 0, 0, 0).getTime();

  function ThrowingNotification() {
    throw new Error("notify-fail");
  }
  ThrowingNotification.permission = "granted";

  const adapter = createTodoAlarmRuntimeAdapterForTest({
    notificationApi: ThrowingNotification
  });

  const runtime = createAlarmRuntime({
    ...adapter,
    getNow: () => dueAt,
    tickMs: 30_000,
    dedupeTtlMs: 1_000,
    maxCatchupMs: 120_000,
    scheduleTimeout() {
      return 1;
    },
    clearScheduledTimeout() {}
  });

  assert.doesNotThrow(() => {
    runtime.register("todo-owner", {
      scopeId: "todo-scope",
      getItems() {
        return [
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
          }
        ];
      }
    });
  });
});
