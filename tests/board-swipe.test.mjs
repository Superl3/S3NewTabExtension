import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveBoardSwipeNextPage,
  resolveBoardSwipeStartState,
  resolveBoardSwipeThreshold
} from "../core/board-swipe.js";

test("resolveBoardSwipeStartState returns pending/cancel/start states", () => {
  assert.equal(resolveBoardSwipeStartState(1, 0), "pending");
  assert.equal(resolveBoardSwipeStartState(4, 20), "cancel");
  assert.equal(resolveBoardSwipeStartState(20, 2), "start");
});

test("resolveBoardSwipeThreshold clamps board width-derived threshold", () => {
  assert.equal(resolveBoardSwipeThreshold(100), 34);
  assert.equal(resolveBoardSwipeThreshold(1000), 130);
  assert.equal(resolveBoardSwipeThreshold(400), 56);
});

test("resolveBoardSwipeNextPage resolves next page from distance and velocity", () => {
  assert.equal(
    resolveBoardSwipeNextPage({
      dx: -80,
      velocity: 0,
      activePage: 2,
      minPage: 0,
      maxPage: 4,
      threshold: 40
    }),
    3
  );

  assert.equal(
    resolveBoardSwipeNextPage({
      dx: 10,
      velocity: 0.5,
      activePage: 2,
      minPage: 0,
      maxPage: 4,
      threshold: 40
    }),
    1
  );

  assert.equal(
    resolveBoardSwipeNextPage({
      dx: 0,
      velocity: 0,
      activePage: 2,
      minPage: 0,
      maxPage: 4,
      threshold: 40
    }),
    2
  );
});
