import test from "node:test";
import assert from "node:assert/strict";

import {
  beginBoardSwipeSession,
  endBoardSwipeSession,
  moveBoardSwipeSession
} from "../core/board-swipe-session.js";

function createPointerEvent({
  pointerId = 1,
  button = 0,
  clientX = 0,
  clientY = 0,
  target = {},
  currentTarget = null
} = {}) {
  let prevented = false;
  return {
    pointerId,
    button,
    clientX,
    clientY,
    target,
    currentTarget,
    preventDefault() {
      prevented = true;
    },
    get prevented() {
      return prevented;
    }
  };
}

function createCaptureHost() {
  return {
    captures: [],
    releases: [],
    setPointerCapture(pointerId) {
      this.captures.push(pointerId);
    },
    releasePointerCapture(pointerId) {
      this.releases.push(pointerId);
    }
  };
}

test("beginBoardSwipeSession sets active state when swipe can start", () => {
  const boardSwipeState = {
    active: false,
    pointerId: null,
    captureTarget: null,
    startX: 0,
    startY: 0,
    startAt: 0,
    dragOffsetX: 0,
    dragging: false
  };
  const captureHost = createCaptureHost();

  beginBoardSwipeSession(
    createPointerEvent({ pointerId: 7, clientX: 100, clientY: 200, currentTarget: captureHost, target: {} }),
    {
      elements: {
        board: {},
        workspace: captureHost
      },
      state: { ui: { home: {} } },
      widgetLongPressState: { pending: false },
      boardSwipeState,
      canStartBoardSwipeFromTarget: () => true,
      modalState: { open: false },
      isAddWidgetModalOpen: () => false,
      shortcutIconEditorState: { open: false },
      isDockSettingsModalOpen: () => false,
      performanceNow: () => 123
    }
  );

  assert.equal(boardSwipeState.active, true);
  assert.equal(boardSwipeState.pointerId, 7);
  assert.equal(boardSwipeState.captureTarget, captureHost);
  assert.equal(boardSwipeState.startX, 100);
  assert.equal(boardSwipeState.startY, 200);
  assert.equal(boardSwipeState.startAt, 123);
  assert.deepEqual(captureHost.captures, [7]);
});

test("beginBoardSwipeSession falls back to Date.now for falsy performance timestamps", () => {
  const boardSwipeState = {
    active: false,
    pointerId: null,
    captureTarget: null,
    startX: 0,
    startY: 0,
    startAt: 0,
    dragOffsetX: 0,
    dragging: false
  };
  const previousNow = Date.now;
  Date.now = () => 789;

  try {
    beginBoardSwipeSession(createPointerEvent({ pointerId: 9, target: {} }), {
      elements: {
        board: {},
        workspace: createCaptureHost()
      },
      state: { ui: { home: {} } },
      widgetLongPressState: { pending: false },
      boardSwipeState,
      canStartBoardSwipeFromTarget: () => true,
      modalState: { open: false },
      isAddWidgetModalOpen: () => false,
      shortcutIconEditorState: { open: false },
      isDockSettingsModalOpen: () => false,
      performanceNow: () => 0
    });

    assert.equal(boardSwipeState.startAt, 789);
  } finally {
    Date.now = previousNow;
  }
});

test("moveBoardSwipeSession starts drag and renders offset", () => {
  const boardSwipeState = {
    active: true,
    pointerId: 3,
    captureTarget: null,
    startX: 10,
    startY: 20,
    startAt: 0,
    dragOffsetX: 0,
    dragging: false
  };
  const renders = [];

  const event = createPointerEvent({ pointerId: 3, clientX: 70, clientY: 25 });
  moveBoardSwipeSession(event, {
    boardSwipeState,
    resolveBoardSwipeStartState: () => "start",
    endBoardSwipe: () => {
      throw new Error("should not cancel");
    },
    renderBoardViewport: (payload) => {
      renders.push(payload);
    }
  });

  assert.equal(boardSwipeState.dragging, true);
  assert.equal(boardSwipeState.dragOffsetX, 60);
  assert.equal(event.prevented, true);
  assert.deepEqual(renders, [{ dragOffsetX: 60, animate: false, dragging: true }]);
});

test("endBoardSwipeSession applies page switch and updates drag end timestamp", () => {
  const captureHost = createCaptureHost();
  const boardSwipeState = {
    active: true,
    pointerId: 5,
    captureTarget: captureHost,
    startX: 0,
    startY: 0,
    startAt: 10,
    dragOffsetX: 0,
    dragging: true
  };

  const setActiveCalls = [];
  let dragEndAt = 0;

  endBoardSwipeSession(
    createPointerEvent({ pointerId: 5, clientX: 120, clientY: 0 }),
    { cancelled: false },
    {
      state: { mode: "use" },
      elements: { board: { clientWidth: 1000 } },
      boardSwipeState,
      syncLauncherPagingState: () => ({ pageCount: 4 }),
      currentLauncherViewportPage: () => 1,
      currentLauncherActivePage: () => 1,
      resolveBoardSwipeThreshold: () => 120,
      resolveBoardSwipeNextPage: () => 2,
      isPlaceholderLauncherPage: () => false,
      setLauncherVirtualPage: () => {
        throw new Error("should not set virtual page");
      },
      setActiveLauncherPage: (page, options) => {
        setActiveCalls.push({ page, options });
      },
      renderBoardViewport: () => {},
      setLastDragEndAt: (value) => {
        dragEndAt = value;
      },
      performanceNow: () => 70,
      nowMs: () => 555
    }
  );

  assert.equal(boardSwipeState.active, false);
  assert.equal(boardSwipeState.pointerId, null);
  assert.deepEqual(captureHost.releases, [5]);
  assert.deepEqual(setActiveCalls, [{ page: 2, options: { shouldSave: true, animate: true } }]);
  assert.equal(dragEndAt, 555);
});
