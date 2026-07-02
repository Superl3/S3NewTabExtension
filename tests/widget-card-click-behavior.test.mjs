import test from "node:test";
import assert from "node:assert/strict";

import {
  attachWidgetCardClickBehavior,
  isWithinDragClickSuppressionWindow
} from "../core/widget-card-click-behavior.js";

function createFakeCard() {
  const listeners = new Map();
  return {
    addEventListener(type, handler, options) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push({ handler, options });
    },
    getListeners(type) {
      return listeners.get(type) || [];
    }
  };
}

function createFakeEvent(target) {
  let prevented = false;
  let stopped = false;
  return {
    target,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      stopped = true;
    },
    get prevented() {
      return prevented;
    },
    get stopped() {
      return stopped;
    }
  };
}

test("isWithinDragClickSuppressionWindow enforces threshold", () => {
  assert.equal(isWithinDragClickSuppressionWindow(1000, { now: 1270 }), true);
  assert.equal(isWithinDragClickSuppressionWindow(1000, { now: 1281 }), false);
  assert.equal(isWithinDragClickSuppressionWindow("bad", { now: 281 }), false);
});

test("attachWidgetCardClickBehavior toggles container on non-interactive click", () => {
  const card = createFakeCard();
  const selected = [];
  let toggled = 0;

  attachWidgetCardClickBehavior({
    card,
    instance: { id: "w1", type: "container" },
    isEditMode: () => true,
    getLastDragEndAt: () => 0,
    setSelected: (id) => selected.push(id),
    toggleContainerExpanded: () => {
      toggled += 1;
    }
  });

  const clickListeners = card.getListeners("click");
  assert.equal(clickListeners.length, 2);

  const bubbleClick = clickListeners[1].handler;
  const event = createFakeEvent({ closest: () => null });
  bubbleClick(event);

  assert.deepEqual(selected, ["w1"]);
  assert.equal(toggled, 1);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
});

test("attachWidgetCardClickBehavior opens shortcut modal on tile click", () => {
  const card = createFakeCard();
  const selected = [];
  const opened = [];

  attachWidgetCardClickBehavior({
    card,
    instance: { id: "w2", type: "shortcut" },
    isEditMode: () => true,
    getLastDragEndAt: () => 0,
    setSelected: (id) => selected.push(id),
    openWidgetModal: (id) => opened.push(id)
  });

  const clickListeners = card.getListeners("click");
  const bubbleClick = clickListeners[1].handler;
  const event = createFakeEvent({
    closest: (selector) => (selector === ".shortcut-tile" ? {} : null)
  });
  bubbleClick(event);

  assert.deepEqual(selected, ["w2"]);
  assert.deepEqual(opened, ["w2"]);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
});
