export const DROP_PLAN_KIND = Object.freeze({
  NONE: "NONE",
  DELETE_ZONE: "DELETE_ZONE",
  SPACE: "SPACE"
});

export const DROP_SPACE_KIND = Object.freeze({
  CONTAINER: "CONTAINER",
  BOARD: "BOARD"
});

export const DROP_CONTAINER_KIND = Object.freeze({
  DOCK: "DOCK",
  FOLDER: "FOLDER"
});

export const DROP_BOARD_KIND = Object.freeze({
  PAGE: "PAGE",
  PLACEHOLDER_PAGE: "PLACEHOLDER_PAGE"
});

export const PLACEHOLDER_EDGE = Object.freeze({
  HEAD: "HEAD",
  TAIL: "TAIL"
});

export function createNoneDropPlan() {
  return { kind: DROP_PLAN_KIND.NONE };
}

export function createDeleteZoneDropPlan() {
  return { kind: DROP_PLAN_KIND.DELETE_ZONE };
}

export function createContainerDropPlan({
  containerKind,
  containerId = "",
  insertIndex = 0,
  projection = null
} = {}) {
  return {
    kind: DROP_PLAN_KIND.SPACE,
    space: {
      kind: DROP_SPACE_KIND.CONTAINER,
      container: {
        kind: containerKind,
        folderId: containerKind === DROP_CONTAINER_KIND.FOLDER ? String(containerId || "") : ""
      },
      insertIndex: Number.isFinite(Number(insertIndex)) ? Math.max(0, Math.floor(Number(insertIndex))) : 0
    },
    projection
  };
}

export function createBoardPageDropPlan({ policyPage, internalPage, projection = null } = {}) {
  return {
    kind: DROP_PLAN_KIND.SPACE,
    space: {
      kind: DROP_SPACE_KIND.BOARD,
      board: {
        kind: DROP_BOARD_KIND.PAGE,
        page: Number.isFinite(Number(policyPage)) ? Math.floor(Number(policyPage)) : 1,
        internalPage: Number.isFinite(Number(internalPage)) ? Math.floor(Number(internalPage)) : 0
      }
    },
    projection
  };
}

export function createBoardPlaceholderDropPlan({ edge, policyPlaceholderPage, internalPlaceholderPage, projection = null } = {}) {
  return {
    kind: DROP_PLAN_KIND.SPACE,
    space: {
      kind: DROP_SPACE_KIND.BOARD,
      board: {
        kind: DROP_BOARD_KIND.PLACEHOLDER_PAGE,
        edge,
        placeholderPage: Number.isFinite(Number(policyPlaceholderPage))
          ? Math.floor(Number(policyPlaceholderPage))
          : 0,
        internalPlaceholderPage: Number.isFinite(Number(internalPlaceholderPage))
          ? Math.floor(Number(internalPlaceholderPage))
          : -1
      }
    },
    projection
  };
}

export function isSpaceDropPlan(plan) {
  return plan?.kind === DROP_PLAN_KIND.SPACE;
}

export function isContainerDropPlan(plan) {
  return isSpaceDropPlan(plan) && plan?.space?.kind === DROP_SPACE_KIND.CONTAINER;
}

export function isBoardDropPlan(plan) {
  return isSpaceDropPlan(plan) && plan?.space?.kind === DROP_SPACE_KIND.BOARD;
}

export function isBoardPlaceholderDropPlan(plan) {
  return isBoardDropPlan(plan) && plan?.space?.board?.kind === DROP_BOARD_KIND.PLACEHOLDER_PAGE;
}

export function isBoardRealPageDropPlan(plan) {
  return isBoardDropPlan(plan) && plan?.space?.board?.kind === DROP_BOARD_KIND.PAGE;
}

export function policyRealPageFromInternalPage(internalPage) {
  const page = Number(internalPage);
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.max(1, Math.floor(page) + 1);
}

export function internalPageFromPolicyRealPage(policyPage) {
  const page = Number(policyPage);
  if (!Number.isFinite(page)) {
    return 0;
  }
  return Math.max(0, Math.floor(page) - 1);
}

export function policyPlaceholderPageFromInternalPlaceholder(internalPlaceholderPage, pageCount) {
  const count = Math.max(1, Math.floor(Number(pageCount) || 1));
  const page = Number(internalPlaceholderPage);
  if (page < 0) {
    return 0;
  }
  return count + 1;
}

export function placeholderEdgeFromInternalPlaceholder(internalPlaceholderPage, pageCount) {
  const count = Math.max(1, Math.floor(Number(pageCount) || 1));
  const page = Number(internalPlaceholderPage);
  if (!Number.isFinite(page)) {
    return null;
  }
  if (page < 0) {
    return PLACEHOLDER_EDGE.HEAD;
  }
  if (page >= count) {
    return PLACEHOLDER_EDGE.TAIL;
  }
  return null;
}

export function internalPlaceholderFromPlaceholderEdge(edge, pageCount) {
  const count = Math.max(1, Math.floor(Number(pageCount) || 1));
  if (edge === PLACEHOLDER_EDGE.HEAD) {
    return -1;
  }
  return count;
}
