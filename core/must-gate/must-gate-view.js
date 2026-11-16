// DOM builders for the must gate (full-page view) and shared item rows. `documentObj` is injected for tests.

const KIND_LABELS = { work: "업무", habit: "정기", cleanup: "뒤처리", decision: "결정" };
const ACTIONS = [
  { key: "done", label: "끝냄" },
  { key: "defer", label: "미루기" },
  { key: "drop", label: "버리기" },
  { key: "split", label: "쪼개기" }
];

export function kindLabel(kind) {
  return KIND_LABELS[kind] || KIND_LABELS.work;
}

export function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function describeDue(item) {
  const short = String(item.due || "").slice(5);
  if (item.daysLeft < 0) {
    return `기한 ${short} (${-item.daysLeft}일 지남)`;
  }
  if (item.daysLeft === 0) {
    return `기한 오늘 (${short})`;
  }
  return `기한 ${short} (D-${item.daysLeft})`;
}

export function safeFirstActionHref(first) {
  const value = String(first || "").trim();
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "obsidian:" ? url.href : "";
  } catch {
    return "";
  }
}

function el(documentObj, tag, className, text) {
  const node = documentObj.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(documentObj, label, className, onClick) {
  const node = el(documentObj, "button", className, label);
  node.type = "button";
  node.addEventListener("click", (event) => {
    event?.preventDefault?.();
    onClick(event);
  });
  return node;
}

function buildForm({ documentObj, item, action, state, handlers, ui }) {
  const form = el(documentObj, "div", "must-gate-form");
  form.dataset.action = action;

  if (action === "done") {
    const input = el(documentObj, "input", "must-gate-input");
    input.type = "text";
    input.placeholder = item.kind === "decision" ? "결정 내용 한 줄 (필수)" : "메모 한 줄 (선택)";
    form.append(input, button(documentObj, "끝냈다고 확정", "btn btn-primary", () => handlers.onSubmit(item.id, "done", { note: input.value })));
  } else if (action === "defer") {
    if (item.deferLeft <= 0) {
      form.append(el(documentObj, "p", "must-gate-hint", "이미 미룰 수 있는 횟수를 다 썼다. 끝내거나 버리거나 쪼개야 한다."));
    } else {
      const row = el(documentObj, "div", "must-gate-quick");
      for (const [label, days] of [["내일", 1], ["+3일", 3], ["+7일", 7]]) {
        row.append(button(documentObj, label, "btn", () => handlers.onSubmit(item.id, "defer", { until: addDays(state.today, days) })));
      }
      const date = el(documentObj, "input", "must-gate-input");
      date.type = "date";
      date.min = addDays(state.today, 1);
      date.max = addDays(state.today, 7);
      row.append(date, button(documentObj, "이 날짜로", "btn btn-primary", () => handlers.onSubmit(item.id, "defer", { until: date.value })));
      form.append(row, el(documentObj, "p", "must-gate-hint", `날짜는 최대 7일 뒤까지, 남은 횟수 ${item.deferLeft}회.`));
    }
  } else if (action === "drop") {
    const input = el(documentObj, "input", "must-gate-input");
    input.type = "text";
    input.placeholder = "버리는 이유 한 줄 (must는 필수)";
    form.append(input, button(documentObj, "버리기 확정", "btn btn-primary", () => handlers.onSubmit(item.id, "drop", { reason: input.value })));
  } else if (action === "split") {
    const area = el(documentObj, "textarea", "must-gate-input");
    area.rows = 3;
    area.placeholder = "한 줄에 하나씩, 2~5개. 기한은 그대로 이어진다.";
    form.append(
      area,
      button(documentObj, "쪼개기 확정", "btn btn-primary", () =>
        handlers.onSubmit(item.id, "split", { parts: String(area.value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean) })
      )
    );
  }
  return form;
}

export function buildMustItem({ documentObj, item, state, ui, handlers, allowPromote = false }) {
  const row = el(documentObj, "li", "must-gate-item");
  row.dataset.id = item.id;
  row.dataset.reason = item.reason || "";

  const head = el(documentObj, "div", "must-gate-item-head");
  head.append(el(documentObj, "span", "must-gate-kind", kindLabel(item.kind)), el(documentObj, "strong", "must-gate-title", item.title));
  const due = el(documentObj, "span", "must-gate-due", describeDue(item));
  if (item.daysLeft < 0) {
    due.className += " is-overdue";
  }
  head.append(due);
  row.append(head);

  const meta = [];
  if (item.doneWhen) {
    meta.push(`끝난 조건: ${item.doneWhen}`);
  }
  meta.push(`미룸 ${item.defer}/${state.deferLimit}`);
  row.append(el(documentObj, "p", "must-gate-meta", meta.join(" · ")));

  const actions = el(documentObj, "div", "must-gate-actions");
  const href = safeFirstActionHref(item.first);
  if (href) {
    const link = el(documentObj, "a", "btn must-gate-first", "첫 행동 열기");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    actions.append(link);
  } else if (item.first) {
    actions.append(el(documentObj, "span", "must-gate-first-text", `첫 행동: ${item.first}`));
  }
  if (allowPromote && !item.reason && typeof handlers.onPromote === "function") {
    const promote = button(documentObj, "must로", "btn must-gate-action", () => handlers.onPromote(item.id));
    promote.dataset.action = "promote";
    promote.disabled = Boolean(ui.busy);
    actions.append(promote);
  }
  for (const action of ACTIONS) {
    const btn = button(documentObj, action.label, "btn must-gate-action", () => handlers.onToggle(item.id, action.key));
    btn.dataset.action = action.key;
    if (ui.busy) {
      btn.disabled = true;
    }
    if (ui.openId === item.id && ui.openAction === action.key) {
      btn.className += " is-active";
    }
    actions.append(btn);
  }
  row.append(actions);

  if (ui.openId === item.id && ui.openAction) {
    row.append(buildForm({ documentObj, item, action: ui.openAction, state, handlers, ui }));
  }
  return row;
}

export function renderMustGate({ documentObj, state, ui, handlers }) {
  const root = el(documentObj, "section", "must-gate");
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Must gate");

  const panel = el(documentObj, "div", "must-gate-panel");
  const header = el(documentObj, "header", "must-gate-header");
  header.append(
    el(documentObj, "h1", "must-gate-heading", "오늘 끝내야 할 것"),
    el(
      documentObj,
      "p",
      "must-gate-sub",
      `${state.must.length}/${state.cap} · 끝내거나, 날짜를 미루거나, 버리거나, 쪼개야 새 탭이 열린다.`
    )
  );
  panel.append(header);

  const list = el(documentObj, "ol", "must-gate-items");
  for (const item of state.must) {
    list.append(buildMustItem({ documentObj, item, state, ui, handlers }));
  }
  panel.append(list);

  if (ui.error) {
    const error = el(documentObj, "p", "must-gate-error", ui.error);
    error.setAttribute("role", "alert");
    panel.append(error);
  }
  if (state.waiting.length) {
    panel.append(
      el(documentObj, "p", "must-gate-waiting", `기한이 임박했지만 상한(${state.cap}) 때문에 대기 중: ${state.waiting.map((item) => item.title).join(", ")}`)
    );
  }
  root.append(panel);
  return root;
}
