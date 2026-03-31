import test from "node:test";
import assert from "node:assert/strict";

import {
  DROP_BOARD_KIND,
  DROP_CONTAINER_KIND,
  DROP_PLAN_KIND,
  DROP_SPACE_KIND,
  PLACEHOLDER_EDGE,
  createBoardPageDropPlan,
  createBoardPlaceholderDropPlan,
  createContainerDropPlan,
  createDeleteZoneDropPlan,
  createNoneDropPlan,
  internalPageFromPolicyRealPage,
  internalPlaceholderFromPlaceholderEdge,
  isBoardPlaceholderDropPlan,
  isBoardRealPageDropPlan,
  isContainerDropPlan,
  policyPlaceholderPageFromInternalPlaceholder,
  policyRealPageFromInternalPage
} from "../core/launcherDropPlan.js";

test("maps policy and internal page numbers consistently", () => {
  assert.equal(policyRealPageFromInternalPage(0), 1);
  assert.equal(policyRealPageFromInternalPage(3), 4);
  assert.equal(internalPageFromPolicyRealPage(1), 0);
  assert.equal(internalPageFromPolicyRealPage(4), 3);
});

test("maps internal placeholders to policy placeholders", () => {
  assert.equal(policyPlaceholderPageFromInternalPlaceholder(-1, 4), 0);
  assert.equal(policyPlaceholderPageFromInternalPlaceholder(4, 4), 5);
});

test("builds container drop plan with minimal hierarchy", () => {
  const dockPlan = createContainerDropPlan({
    containerKind: DROP_CONTAINER_KIND.DOCK,
    insertIndex: 2,
    projection: { layout: { x: 10, y: 10, w: 100, h: 30 }, page: 0 }
  });

  assert.equal(dockPlan.kind, DROP_PLAN_KIND.SPACE);
  assert.equal(dockPlan.space.kind, DROP_SPACE_KIND.CONTAINER);
  assert.equal(dockPlan.space.container.kind, DROP_CONTAINER_KIND.DOCK);
  assert.equal(dockPlan.space.insertIndex, 2);
  assert.equal(isContainerDropPlan(dockPlan), true);
});

test("builds board drop plans for real and placeholder pages", () => {
  const realPlan = createBoardPageDropPlan({
    policyPage: 3,
    internalPage: 2,
    projection: { layout: { x: 20, y: 20, w: 120, h: 120 }, page: 2 }
  });

  assert.equal(realPlan.space.board.kind, DROP_BOARD_KIND.PAGE);
  assert.equal(realPlan.space.board.page, 3);
  assert.equal(realPlan.space.board.internalPage, 2);
  assert.equal(isBoardRealPageDropPlan(realPlan), true);

  const placeholderPlan = createBoardPlaceholderDropPlan({
    edge: PLACEHOLDER_EDGE.TAIL,
    policyPlaceholderPage: 6,
    internalPlaceholderPage: 5,
    projection: { layout: { x: 30, y: 30, w: 140, h: 140 }, page: 5 }
  });

  assert.equal(placeholderPlan.space.board.kind, DROP_BOARD_KIND.PLACEHOLDER_PAGE);
  assert.equal(placeholderPlan.space.board.edge, PLACEHOLDER_EDGE.TAIL);
  assert.equal(isBoardPlaceholderDropPlan(placeholderPlan), true);
});

test("creates explicit NONE and DELETE_ZONE plans", () => {
  const none = createNoneDropPlan();
  const del = createDeleteZoneDropPlan();

  assert.equal(none.kind, DROP_PLAN_KIND.NONE);
  assert.equal(del.kind, DROP_PLAN_KIND.DELETE_ZONE);
});

test("resolves internal placeholder from edge", () => {
  assert.equal(internalPlaceholderFromPlaceholderEdge(PLACEHOLDER_EDGE.HEAD, 4), -1);
  assert.equal(internalPlaceholderFromPlaceholderEdge(PLACEHOLDER_EDGE.TAIL, 4), 4);
});
