import test from "node:test";
import assert from "node:assert/strict";

import { handleTodoAlarmModalKeydown, submitTodoAlarmModalAction } from "../widgets/todo.js";

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName || "div").toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.focused = false;
    const classes = new Set();
    this.classList = {
      add: (...tokens) => {
        for (const token of tokens) {
          classes.add(token);
        }
      },
      contains: (token) => classes.has(token)
    };
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  contains(node) {
    if (node === this) {
      return true;
    }
    return this.children.some((child) => child.contains(node));
  }

  closest(selector) {
    const names = String(selector || "")
      .split(",")
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
    let current = this;
    while (current) {
      if (names.includes(current.tagName)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    if (selector === ".todo-alarm-modal") {
      return this.children.find((child) => child.classList.contains("todo-alarm-modal")) || null;
    }
    return null;
  }

  querySelectorAll() {
    return this.children.flatMap((child) => [child, ...child.children]);
  }

  focus() {
    this.focused = true;
  }
}

function withFakeDom(fn) {
  const previousElement = globalThis.Element;
  const previousHtmlElement = globalThis.HTMLElement;
  globalThis.Element = FakeElement;
  globalThis.HTMLElement = FakeElement;
  try {
    return fn();
  } finally {
    globalThis.Element = previousElement;
    globalThis.HTMLElement = previousHtmlElement;
  }
}

function createAlarmField(value = "") {
  return {
    value,
    validityMessage: "",
    reportValidityCalls: 0,
    setCustomValidity(message) {
      this.validityMessage = message;
    },
    reportValidity() {
      this.reportValidityCalls += 1;
      return false;
    }
  };
}

test("todo alarm modal primary action dismisses on invalid input", () => {
  let closed = 0;
  let saved = 0;
  const timeInput = createAlarmField("");

  const result = submitTodoAlarmModalAction({
    alarmItemId: "item-1",
    alarmRepeatInput: { value: "daily" },
    alarmTimeInput: timeInput,
    alarmIntervalInput: { value: "off" },
    alarmReminderInput: { value: "none" },
    getItems: () => [{ id: "item-1", text: "Task", alarm: { repeat: "none" } }],
    saveItems: () => {
      saved += 1;
    },
    closeAlarmModal: () => {
      closed += 1;
    },
    render: () => {},
    canRunNotificationApiFn: () => false
  });

  assert.equal(result, false);
  assert.equal(saved, 0);
  assert.equal(timeInput.reportValidityCalls, 1);
  assert.equal(closed, 1);
});

test("todo alarm modal primary action dismisses when save throws", () => {
  let closed = 0;

  assert.throws(() => {
    submitTodoAlarmModalAction({
      alarmItemId: "item-1",
      alarmRepeatInput: { value: "none" },
      alarmTimeInput: createAlarmField("09:30"),
      alarmIntervalInput: { value: "off" },
      alarmReminderInput: { value: "none" },
      getItems: () => [{ id: "item-1", text: "Task", alarm: { repeat: "none" } }],
      saveItems: () => {
        throw new Error("save-fail");
      },
      closeAlarmModal: () => {
        closed += 1;
      },
      render: () => {},
      canRunNotificationApiFn: () => false
    });
  }, /save-fail/);

  assert.equal(closed, 1);
});

test("todo alarm modal enter path dismisses", () => {
  withFakeDom(() => {
    let closed = 0;
    const overlay = new FakeElement("div");
    overlay.classList.add("open");
    const modal = new FakeElement("section");
    modal.classList.add("todo-alarm-modal");
    const input = new FakeElement("input");
    modal.append(input);
    overlay.append(modal);

    const event = {
      key: "Enter",
      target: input,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      }
    };

    const handled = handleTodoAlarmModalKeydown(event, {
      alarmOverlay: overlay,
      closeAlarmModal: () => {
        closed += 1;
      },
      saveAlarmModal: () => {
        submitTodoAlarmModalAction({
          alarmItemId: "item-1",
          alarmRepeatInput: { value: "daily" },
          alarmTimeInput: createAlarmField(""),
          alarmIntervalInput: { value: "off" },
          alarmReminderInput: { value: "none" },
          getItems: () => [{ id: "item-1", text: "Task", alarm: { repeat: "none" } }],
          saveItems: () => {},
          closeAlarmModal: () => {
            closed += 1;
          },
          render: () => {},
          canRunNotificationApiFn: () => false
        });
      },
      documentObj: { activeElement: input }
    });

    assert.equal(handled, true);
    assert.equal(event.prevented, true);
    assert.equal(closed, 1);
  });
});
