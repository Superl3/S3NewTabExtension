import test from "node:test";
import assert from "node:assert/strict";

import { wireDocumentGuardEvents } from "../core/wire-events-document-guards.js";

function createDocumentHub() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    emit(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler(event);
      }
    }
  };
}

function createPreventableEvent(extra = {}) {
  let prevented = false;
  return {
    ...extra,
    preventDefault() {
      prevented = true;
    },
    get prevented() {
      return prevented;
    }
  };
}

test("wireDocumentGuardEvents closes context menu when clicking outside", () => {
  const documentObj = createDocumentHub();
  const boardContextMenuState = { open: true };
  let closeCalls = 0;

  wireDocumentGuardEvents({
    documentObj,
    boardContextMenuState,
    isInsideBoardContextMenu: (target) => target?.inside === true,
    closeBoardContextMenu: () => {
      closeCalls += 1;
    },
    blockOutsideModalEvent: () => {}
  });

  documentObj.emit("pointerdown", { target: { inside: false } });
  documentObj.emit("pointerdown", { target: { inside: true } });

  assert.equal(closeCalls, 1);
});

test("wireDocumentGuardEvents handles contextmenu open and close flow", () => {
  const documentObj = createDocumentHub();
  let closeCalls = 0;
  let openCalls = 0;

  wireDocumentGuardEvents({
    documentObj,
    boardContextMenuState: { open: false },
    closeBoardContextMenu: () => {
      closeCalls += 1;
    },
    canOpenBoardContextMenuFromTarget: () => true,
    openBoardContextMenu: () => {
      openCalls += 1;
      return true;
    },
    blockOutsideModalEvent: () => {}
  });

  const openEvent = createPreventableEvent({ target: {}, clientX: 10, clientY: 20 });
  documentObj.emit("contextmenu", openEvent);

  assert.equal(openCalls, 1);
  assert.equal(closeCalls, 0);
  assert.equal(openEvent.prevented, true);
});

test("wireDocumentGuardEvents blocks drag/select/dblclick outside text fields", () => {
  const documentObj = createDocumentHub();

  wireDocumentGuardEvents({
    documentObj,
    boardContextMenuState: { open: false },
    blockOutsideModalEvent: () => {},
    isTextEditableTarget: (target) => target?.editable === true
  });

  const drag = createPreventableEvent({ target: { editable: false } });
  const select = createPreventableEvent({ target: { editable: false } });
  const dblclick = createPreventableEvent({ target: { editable: false } });
  const dragEditable = createPreventableEvent({ target: { editable: true } });

  documentObj.emit("dragstart", drag);
  documentObj.emit("selectstart", select);
  documentObj.emit("dblclick", dblclick);
  documentObj.emit("dragstart", dragEditable);

  assert.equal(drag.prevented, true);
  assert.equal(select.prevented, true);
  assert.equal(dblclick.prevented, true);
  assert.equal(dragEditable.prevented, false);
});
