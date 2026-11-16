// DOM builders for the must gate (full-page view) and shared item rows. `documentObj` is injected for tests.

const KIND_LABELS = { work: "업무", habit: "정기", cleanup: "뒤처리", decision: "결정" };

// Each choice says what it does in its own words; the form that opens repeats it in full.
const ACTIONS = [
  { key: "done", label: "다 했음", title: "끝난 조건을 채웠으면 완료로 기록한다" },
  { key: "defer", label: "미루기", title: "고른 날짜까지 접어 두고 그날 다시 보여 준다 (최대 7일, 2번까지)" },
  { key: "drop", label: "안 하기", title: "하지 않기로 정하고 목록에서 뺀다" },
  { key: "split", label: "나누기", title: "너무 커서 손이 안 갈 때 작은 일 여러 개로 바꾼다" }
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

// Name the link after where it goes, so the button says what it opens.
export function firstActionLabel(href) {
  try {
    const url = new URL(href);
    if (url.protocol === "obsidian:") {
      const file = url.searchParams.get("file") || "";
      const name = file.split("/").pop();
      return name ? `노트 열기: ${name}` : "Obsidian 노트 열기";
    }
    const workPackage = /\/work_packages\/(\d+)/.exec(url.pathname);
    if (workPackage) {
      return `OpenProject #${workPackage[1]} 열기`;
    }
    return `${url.hostname} 열기`;
  } catch {
    return "링크 열기";
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

function explain(documentObj, text) {
  return el(documentObj, "p", "must-gate-explain", text);
}

function buildForm({ documentObj, item, action, state, handlers }) {
  const form = el(documentObj, "div", "must-gate-form");
  form.dataset.action = action;

  if (action === "done") {
    form.append(
      explain(
        documentObj,
        item.doneWhen
          ? `끝난 조건 "${item.doneWhen}"을 채웠으면 확정한다. 완료로 기록되고 목록에서 빠진다.`
          : "다 했으면 확정한다. 완료로 기록되고 목록에서 빠진다."
      )
    );
    const input = el(documentObj, "input", "must-gate-input");
    input.type = "text";
    input.placeholder = item.kind === "decision" ? "무엇으로 정했는지 한 줄 (필수)" : "남길 메모 한 줄 (선택)";
    form.append(input, button(documentObj, "완료로 기록", "btn btn-primary", () => handlers.onSubmit(item.id, "done", { note: input.value })));
  } else if (action === "defer") {
    if (item.deferLeft <= 0) {
      form.append(explain(documentObj, "이미 두 번 미뤘다. 더는 미룰 수 없으니 다 했음·안 하기·나누기 중 하나를 골라야 한다."));
    } else {
      form.append(
        explain(
          documentObj,
          `고른 날짜까지 이 항목을 접어 두고, 그날 다시 여기에 나타난다. 이 항목은 ${item.deferLeft}번 더 미룰 수 있다.`
        )
      );
      const row = el(documentObj, "div", "must-gate-quick");
      for (const [label, days] of [["내일", 1], ["+3일", 3], ["+7일", 7]]) {
        row.append(button(documentObj, label, "btn", () => handlers.onSubmit(item.id, "defer", { until: addDays(state.today, days) })));
      }
      const date = el(documentObj, "input", "must-gate-input");
      date.type = "date";
      date.min = addDays(state.today, 1);
      date.max = addDays(state.today, 7);
      row.append(date, button(documentObj, "이 날짜로 미루기", "btn btn-primary", () => handlers.onSubmit(item.id, "defer", { until: date.value })));
      form.append(row);
    }
  } else if (action === "drop") {
    form.append(explain(documentObj, "하지 않기로 정한다. 목록에서 빠지고, 이유는 노트 기록에 남는다."));
    const input = el(documentObj, "input", "must-gate-input");
    input.type = "text";
    input.placeholder = "안 하는 이유 한 줄 (필수)";
    form.append(input, button(documentObj, "안 하기로 확정", "btn btn-primary", () => handlers.onSubmit(item.id, "drop", { reason: input.value })));
  } else if (action === "split") {
    form.append(
      explain(documentObj, "한 번에 하기엔 커서 손이 안 갈 때 쓴다. 2~5개의 작은 일로 바꾸고 이 항목은 닫힌다. 기한은 그대로 이어진다.")
    );
    const area = el(documentObj, "textarea", "must-gate-input");
    area.rows = 3;
    area.placeholder = "작은 일을 한 줄에 하나씩";
    form.append(
      area,
      button(documentObj, "나눠서 등록", "btn btn-primary", () =>
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
  meta.push(`미룬 횟수 ${item.defer}/${state.deferLimit}`);
  row.append(el(documentObj, "p", "must-gate-meta", meta.join(" · ")));

  const actions = el(documentObj, "div", "must-gate-actions");
  const href = safeFirstActionHref(item.first);
  if (href) {
    const link = el(documentObj, "a", "btn must-gate-first", firstActionLabel(href));
    link.href = href;
    link.title = href;
    if (!href.startsWith("obsidian:")) {
      // http(s) opens in a new tab; obsidian: hands off to the app without leaving an empty tab behind.
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    // Going to the start point counts as starting the work: the gate steps aside for this tab.
    link.addEventListener("click", () => handlers.onStart?.(item.id));
    actions.append(link);
  } else if (item.first) {
    actions.append(el(documentObj, "span", "must-gate-first-text", `시작점: ${item.first}`));
  }
  if (allowPromote && !item.reason && typeof handlers.onPromote === "function") {
    const promote = button(documentObj, "must로", "btn must-gate-action", () => handlers.onPromote(item.id));
    promote.dataset.action = "promote";
    promote.title = "지금 해야 할 일(최대 3개)로 올린다";
    promote.disabled = Boolean(ui.busy);
    actions.append(promote);
  }
  for (const action of ACTIONS) {
    const label = action.key === "defer" ? (item.deferLeft > 0 ? `미루기 (${item.deferLeft}회 남음)` : "미루기 (불가)") : action.label;
    const btn = button(documentObj, label, "btn must-gate-action", () => handlers.onToggle(item.id, action.key));
    btn.dataset.action = action.key;
    btn.title = action.title;
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
    row.append(buildForm({ documentObj, item, action: ui.openAction, state, handlers }));
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
      `${state.must.length}개 남음 (최대 ${state.cap}개). 항목마다 다 했음 · 미루기 · 안 하기 · 나누기 중 하나를 고르면 새 탭이 열린다.`
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
      el(documentObj, "p", "must-gate-waiting", `기한이 가깝지만 최대 ${state.cap}개라서 다음 차례로 대기 중: ${state.waiting.map((item) => item.title).join(", ")}`)
    );
  }
  root.append(panel);
  return root;
}
