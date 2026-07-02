import test from "node:test";
import assert from "node:assert/strict";

import {
  createBoardWheelState,
  handleBoardWheelNavigate,
  resolveBoardWheelAxisDelta
} from "../core/board-wheel-navigation.js";

function createWheelEvent({ deltaX = 0, deltaY = 0, target = {} } = {}) {
  let prevented = false;
  return {
    deltaX,
    deltaY,
    target,
    preventDefault() {
      prevented = true;
    },
    get prevented() {
      return prevented;
    }
  };
}

function createDeps(overrides = {}) {
  const setActiveCalls = [];
  const setVirtualCalls = [];
  const base = {
    boardWheelState: createBoardWheelState(),
    boardSwipeState: { active: false },
    state: { mode: "use", ui: { home: {} } },
    elements: { board: { clientWidth: 1000 } },
    syncLauncherPagingState: () => ({ pageCount: 3 }),
    currentLauncherViewportPage: () => 0,
    currentLauncherActivePage: () => 1,
    resolveBoardSwipeThreshold: () => 80,
    resolveBoardSwipeNextPage: ({ activePage, dx, threshold }) => {
      if (dx <= -threshold) {
        return activePage + 1;
      }
      if (dx >= threshold) {
        return activePage - 1;
      }
      return activePage;
    },
    isPlaceholderLauncherPage: () => false,
    setLauncherVirtualPage: (page, options) => {
      setVirtualCalls.push({ page, options });
    },
    setActiveLauncherPage: (page, options) => {
      setActiveCalls.push({ page, options });
    },
    canStartBoardSwipeFromTarget: () => true,
    isTextEditableTarget: () => false,
    modalState: { open: false },
    isAddWidgetModalOpen: () => false,
    shortcutIconEditorState: { open: false },
    isDockSettingsModalOpen: () => false,
    nowMs: () => 100
  };

  return {
    deps: { ...base, ...overrides },
    setActiveCalls,
    setVirtualCalls
  };
}

test("resolveBoardWheelAxisDelta prefers dominant axis delta", () => {
  assert.equal(resolveBoardWheelAxisDelta({ deltaX: 40, deltaY: 10 }), 40);
  assert.equal(resolveBoardWheelAxisDelta({ deltaX: 5, deltaY: -32 }), -32);
  assert.equal(resolveBoardWheelAxisDelta({ deltaX: Number.POSITIVE_INFINITY, deltaY: Number.NaN }), 0);
});

test("handleBoardWheelNavigate does not paginate before threshold", () => {
  const event = createWheelEvent({ deltaX: 20, deltaY: 0 });
  const { deps, setActiveCalls } = createDeps();

  const didPaginate = handleBoardWheelNavigate(event, deps);

  assert.equal(didPaginate, false);
  assert.equal(event.prevented, false);
  assert.equal(setActiveCalls.length, 0);
});

test("handleBoardWheelNavigate falls back to Date.now for falsy now provider values", () => {
  const previousNow = Date.now;
  Date.now = () => 500;

  try {
    const event = createWheelEvent({ deltaX: 20, deltaY: 0 });
    const wheelState = createBoardWheelState();
    const { deps } = createDeps({
      boardWheelState: wheelState,
      nowMs: () => 0
    });

    const didPaginate = handleBoardWheelNavigate(event, deps);

    assert.equal(didPaginate, false);
    assert.equal(wheelState.lastEventAt, 500);
  } finally {
    Date.now = previousNow;
  }
});

test("handleBoardWheelNavigate paginates once and respects cooldown", () => {
  const event = createWheelEvent({ deltaX: -120, deltaY: 0 });
  const wheelState = createBoardWheelState();

  const first = createDeps({ boardWheelState: wheelState, nowMs: () => 200 });
  const firstDidPaginate = handleBoardWheelNavigate(event, first.deps);

  const second = createDeps({
    boardWheelState: wheelState,
    currentLauncherActivePage: () => 2,
    nowMs: () => 260
  });
  const secondDidPaginate = handleBoardWheelNavigate(event, second.deps);

  assert.equal(firstDidPaginate, true);
  assert.equal(secondDidPaginate, false);
  assert.equal(event.prevented, true);
  assert.deepEqual(first.setActiveCalls, [{ page: 2, options: { shouldSave: true, animate: true } }]);
  assert.equal(second.setActiveCalls.length, 0);
});

test("handleBoardWheelNavigate ignores wheel while pointer swipe is active", () => {
  const event = createWheelEvent({ deltaX: -140, deltaY: 0 });
  const { deps, setActiveCalls } = createDeps({ boardSwipeState: { active: true } });

  const didPaginate = handleBoardWheelNavigate(event, deps);

  assert.equal(didPaginate, false);
  assert.equal(event.prevented, false);
  assert.equal(setActiveCalls.length, 0);
});

test("handleBoardWheelNavigate sets virtual page in edit mode placeholder", () => {
  const event = createWheelEvent({ deltaX: -160, deltaY: 0 });
  const { deps, setActiveCalls, setVirtualCalls } = createDeps({
    state: { mode: "edit", ui: { home: {} } },
    syncLauncherPagingState: () => ({ pageCount: 2 }),
    currentLauncherViewportPage: () => 1,
    resolveBoardSwipeNextPage: () => 2,
    isPlaceholderLauncherPage: () => true,
    nowMs: () => 800
  });

  const didPaginate = handleBoardWheelNavigate(event, deps);

  assert.equal(didPaginate, true);
  assert.deepEqual(setVirtualCalls, [{ page: 2, options: { animate: true } }]);
  assert.equal(setActiveCalls.length, 0);
  assert.equal(event.prevented, true);
});

test("handleBoardWheelNavigate ignores no-op page target", () => {
  const event = createWheelEvent({ deltaX: -160, deltaY: 0 });
  const { deps, setActiveCalls, setVirtualCalls } = createDeps({
    currentLauncherActivePage: () => 1,
    resolveBoardSwipeNextPage: () => 1,
    nowMs: () => 900
  });

  const didPaginate = handleBoardWheelNavigate(event, deps);

  assert.equal(didPaginate, false);
  assert.equal(setActiveCalls.length, 0);
  assert.equal(setVirtualCalls.length, 0);
  assert.equal(event.prevented, false);
});

test("handleBoardWheelNavigate accumulates below-threshold wheel events within reset window", () => {
  const wheelState = createBoardWheelState();

  const firstEvent = createWheelEvent({ deltaX: -40, deltaY: 0 });
  const first = createDeps({ boardWheelState: wheelState, nowMs: () => 1000 });
  const firstDidPaginate = handleBoardWheelNavigate(firstEvent, first.deps);

  const secondEvent = createWheelEvent({ deltaX: -45, deltaY: 0 });
  const second = createDeps({ boardWheelState: wheelState, nowMs: () => 1080 });
  const secondDidPaginate = handleBoardWheelNavigate(secondEvent, second.deps);

  assert.equal(firstDidPaginate, false);
  assert.equal(firstEvent.prevented, false);
  assert.equal(first.setActiveCalls.length, 0);
  assert.equal(secondDidPaginate, true);
  assert.equal(secondEvent.prevented, true);
  assert.deepEqual(second.setActiveCalls, [{ page: 2, options: { shouldSave: true, animate: true } }]);
});

test("handleBoardWheelNavigate resets accumulation after idle gap", () => {
  const wheelState = createBoardWheelState();

  const firstEvent = createWheelEvent({ deltaX: -50, deltaY: 0 });
  const first = createDeps({ boardWheelState: wheelState, nowMs: () => 1000 });
  const firstDidPaginate = handleBoardWheelNavigate(firstEvent, first.deps);

  const secondEvent = createWheelEvent({ deltaX: -50, deltaY: 0 });
  const second = createDeps({ boardWheelState: wheelState, nowMs: () => 1300 });
  const secondDidPaginate = handleBoardWheelNavigate(secondEvent, second.deps);

  assert.equal(firstDidPaginate, false);
  assert.equal(secondDidPaginate, false);
  assert.equal(firstEvent.prevented, false);
  assert.equal(secondEvent.prevented, false);
  assert.equal(first.setActiveCalls.length, 0);
  assert.equal(second.setActiveCalls.length, 0);
});

test("handleBoardWheelNavigate does not paginate when swipe start is blocked", () => {
  const event = createWheelEvent({ deltaX: -160, deltaY: 0 });
  const { deps, setActiveCalls } = createDeps({
    canStartBoardSwipeFromTarget: () => false,
    nowMs: () => 1000
  });

  const didPaginate = handleBoardWheelNavigate(event, deps);

  assert.equal(didPaginate, false);
  assert.equal(event.prevented, false);
  assert.equal(setActiveCalls.length, 0);
});

test("handleBoardWheelNavigate does not paginate from editable text targets", () => {
  const event = createWheelEvent({ deltaX: -160, deltaY: 0, target: { isContentEditable: true } });
  const { deps, setActiveCalls } = createDeps({
    isTextEditableTarget: () => true,
    nowMs: () => 1000
  });

  const didPaginate = handleBoardWheelNavigate(event, deps);

  assert.equal(didPaginate, false);
  assert.equal(event.prevented, false);
  assert.equal(setActiveCalls.length, 0);
});

const modalGateCases = [
  {
    name: "modalState.open",
    overrides: { modalState: { open: true } }
  },
  {
    name: "isAddWidgetModalOpen",
    overrides: { isAddWidgetModalOpen: () => true }
  },
  {
    name: "shortcutIconEditorState.open",
    overrides: { shortcutIconEditorState: { open: true } }
  },
  {
    name: "isDockSettingsModalOpen",
    overrides: { isDockSettingsModalOpen: () => true }
  }
];

for (const gate of modalGateCases) {
  test(`handleBoardWheelNavigate does not paginate when ${gate.name} is active`, () => {
    const event = createWheelEvent({ deltaX: -160, deltaY: 0 });
    const { deps, setActiveCalls } = createDeps({
      ...gate.overrides,
      nowMs: () => 1000
    });

    const didPaginate = handleBoardWheelNavigate(event, deps);

    assert.equal(didPaginate, false);
    assert.equal(event.prevented, false);
    assert.equal(setActiveCalls.length, 0);
  });
}
