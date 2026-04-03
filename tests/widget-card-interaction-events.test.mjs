import test from "node:test";
import assert from "node:assert/strict";

import { attachWidgetCardInteractionEvents } from "../core/widget-card-interaction-events.js";

function createFakeNode() {
  const listeners = new Map();
  return {
    addEventListener(type, handler, options) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push({ handler, options });
    },
    handler(type, index = 0) {
      return listeners.get(type)?.[index]?.handler || null;
    }
  };
}

test("attachWidgetCardInteractionEvents starts head drag in edit mode", () => {
  const head = createFakeNode();
  const dragCalls = [];

  attachWidgetCardInteractionEvents({
    head,
    instance: { id: "w1", type: "note", viewMode: "normal" },
    isEditMode: () => true,
    hasPointerEvent: () => true,
    startDrag: (payload) => {
      dragCalls.push(payload);
    }
  });

  const target = { id: "target" };
  head.handler("pointerdown")({ target });

  assert.equal(dragCalls.length, 1);
  assert.equal(dragCalls[0].fromHandleButton, false);
  assert.equal(dragCalls[0].target, target);
});

test("attachWidgetCardInteractionEvents schedules long press only in use mode", () => {
  const card = createFakeNode();
  const scheduled = [];

  attachWidgetCardInteractionEvents({
    card,
    instance: { id: "w2", type: "note", viewMode: "normal" },
    isEditMode: () => false,
    hasPointerEvent: () => true,
    scheduleLongPressDrag: (event, target) => {
      scheduled.push({ event, target });
    }
  });

  const target = { id: "content" };
  const event = { target };
  card.handler("pointerdown")(event);

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].target, target);
});

test("attachWidgetCardInteractionEvents wires drag button and padding handles", () => {
  const dragBtn = createFakeNode();
  const topRight = createFakeNode();
  const bottomLeft = createFakeNode();
  const dragCalls = [];
  const paddingCalls = [];

  attachWidgetCardInteractionEvents({
    dragBtn,
    paddingHandleTopRight: topRight,
    paddingHandleBottomLeft: bottomLeft,
    instance: { id: "w3", type: "note", viewMode: "normal" },
    isEditMode: () => true,
    hasPointerEvent: () => false,
    startDrag: (payload) => {
      dragCalls.push(payload);
    },
    startPaddingDrag: (event, corner) => {
      paddingCalls.push({ event, corner });
    }
  });

  const dragEvent = { target: { id: "btn" } };
  dragBtn.handler("mousedown")(dragEvent);
  topRight.handler("pointerdown")({ id: "tr" });
  bottomLeft.handler("pointerdown")({ id: "bl" });

  assert.equal(dragCalls.length, 1);
  assert.equal(dragCalls[0].fromHandleButton, true);
  assert.deepEqual(
    paddingCalls.map((item) => item.corner),
    ["topRight", "bottomLeft"]
  );
});
