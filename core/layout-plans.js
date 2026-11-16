// Named board layouts that rearrange the CURRENT board (existing widgets keep their settings and tokens).
// Widgets the plan does not place are parked on the following pages, never deleted.
// Dock and folder (container) widgets are left exactly where they are.

const CODEX_CHAT = { providerMode: "codex", codexTier: "luna" };

const sixShortcuts = (cells) => cells.map(([col, row]) => ({ type: "shortcut", col, row, colSpan: 1, rowSpan: 1 }));

export const LAYOUT_PLANS = Object.freeze({
  work: {
    label: "작업 대시보드",
    // 왼쪽: 할 일 / 가운데: 시계·바로가기·AI Chat / 오른쪽: 회의·리뷰
    slots: [
      { type: "mustList", col: 0, row: 0, colSpan: 3, rowSpan: 4 },
      { type: "opAssigned", col: 0, row: 4, colSpan: 3, rowSpan: 4 },
      { type: "clock", col: 3, row: 0, colSpan: 2, rowSpan: 2 },
      { type: "weather", col: 5, row: 0, colSpan: 2, rowSpan: 1 },
      { type: "flexWorktime", col: 5, row: 1, colSpan: 2, rowSpan: 1 },
      { type: "opMeetings", col: 7, row: 0, colSpan: 2, rowSpan: 2 },
      ...sixShortcuts([[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2]]),
      { type: "aiChat", col: 3, row: 3, colSpan: 6, rowSpan: 5, config: CODEX_CHAT },
      { type: "githubReviewInbox", col: 9, row: 0, colSpan: 3, rowSpan: 8 }
    ]
  },
  focus: {
    label: "집중",
    // 가운데: 할 일과 AI Chat을 크게 / 왼쪽: 시계·바로가기·내 작업 / 오른쪽: 회의·날씨·근무·리뷰
    slots: [
      { type: "clock", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
      ...sixShortcuts([[0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3]]),
      { type: "opAssigned", col: 0, row: 4, colSpan: 3, rowSpan: 4 },
      { type: "mustList", col: 3, row: 0, colSpan: 6, rowSpan: 3 },
      { type: "aiChat", col: 3, row: 3, colSpan: 6, rowSpan: 5, config: CODEX_CHAT },
      { type: "opMeetings", col: 9, row: 0, colSpan: 3, rowSpan: 3 },
      { type: "weather", col: 9, row: 3, colSpan: 3, rowSpan: 1 },
      { type: "flexWorktime", col: 9, row: 4, colSpan: 3, rowSpan: 1 },
      { type: "githubReviewInbox", col: 9, row: 5, colSpan: 3, rowSpan: 3 }
    ]
  }
});

function isMovable(instance) {
  const inDock = instance.dockOrder !== null && instance.dockOrder !== undefined;
  return !inDock && !instance.containerId && instance.enabled !== false;
}

function positionKey(instance) {
  const grid = instance.gridLayout || {};
  return [Number(instance.page) || 0, Number(grid.row) || 0, Number(grid.col) || 0];
}

function comparePosition(a, b) {
  const ka = positionKey(a);
  const kb = positionKey(b);
  for (let index = 0; index < ka.length; index += 1) {
    if (ka[index] !== kb[index]) {
      return ka[index] - kb[index];
    }
  }
  return 0;
}

function createPacker(columns, rows) {
  const pages = new Map();
  const grid = (page) => {
    if (!pages.has(page)) {
      pages.set(page, Array.from({ length: rows }, () => Array(columns).fill(false)));
    }
    return pages.get(page);
  };
  const fits = (cells, row, col, rowSpan, colSpan) => {
    for (let y = row; y < row + rowSpan; y += 1) {
      for (let x = col; x < col + colSpan; x += 1) {
        if (cells[y][x]) return false;
      }
    }
    return true;
  };
  const mark = (page, { col, row, colSpan, rowSpan }) => {
    const cells = grid(page);
    for (let y = row; y < row + rowSpan; y += 1) {
      for (let x = col; x < col + colSpan; x += 1) cells[y][x] = true;
    }
  };
  const place = (startPage, colSpanIn, rowSpanIn) => {
    const colSpan = Math.min(columns, Math.max(1, Number(colSpanIn) || 1));
    const rowSpan = Math.min(rows, Math.max(1, Number(rowSpanIn) || 1));
    for (let page = startPage; page < startPage + 50; page += 1) {
      const cells = grid(page);
      for (let row = 0; row + rowSpan <= rows; row += 1) {
        for (let col = 0; col + colSpan <= columns; col += 1) {
          if (fits(cells, row, col, rowSpan, colSpan)) {
            const spot = { col, row, colSpan, rowSpan };
            mark(page, spot);
            return { page, gridLayout: spot };
          }
        }
      }
    }
    return null;
  };
  return { mark, place };
}

/**
 * @param {object[]} instances current board instances (not mutated)
 * @param {string} planName key of LAYOUT_PLANS
 * @param {{ createInstance: (type: string, config: object) => object|null, columns?: number, rows?: number }} deps
 */
export function planLayout(instances, planName, { createInstance, columns = 12, rows = 8 } = {}) {
  const plan = LAYOUT_PLANS[planName];
  if (!plan) {
    throw new Error(`unknown layout plan: ${planName}`);
  }
  const next = instances.map((instance) => ({ ...instance, gridLayout: { ...(instance.gridLayout || {}) } }));
  const byId = new Map(next.map((instance) => [instance.id, instance]));
  const candidates = next.filter(isMovable).sort(comparePosition);
  const used = new Set();
  const added = [];
  const packer = createPacker(columns, rows);

  for (const slot of plan.slots) {
    let target = candidates.find((instance) => instance.type === slot.type && !used.has(instance.id));
    if (!target) {
      const created = createInstance?.(slot.type, slot.config || {});
      if (!created) {
        continue; // unknown or unavailable widget type: leave the cell empty
      }
      target = { ...created, config: { ...(created.config || {}), ...(slot.config || {}) } };
      next.push(target);
      byId.set(target.id, target);
      added.push(slot.type);
    }
    used.add(target.id);
    target.page = 0;
    target.gridLayout = { col: slot.col, row: slot.row, colSpan: slot.colSpan, rowSpan: slot.rowSpan };
    packer.mark(0, target.gridLayout);
  }

  let parked = 0;
  for (const instance of candidates) {
    if (used.has(instance.id)) continue;
    const spot = packer.place(1, instance.gridLayout?.colSpan, instance.gridLayout?.rowSpan);
    if (!spot) continue;
    const target = byId.get(instance.id);
    target.page = spot.page;
    target.gridLayout = spot.gridLayout;
    parked += 1;
  }

  const pageCount = Math.max(1, ...next.filter(isMovable).map((instance) => (Number(instance.page) || 0) + 1));
  return { instances: next, added, parked, pageCount, label: plan.label };
}
