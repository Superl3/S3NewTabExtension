// Pure rules for the "must gate": parse/serialize the vault must note and decide what is a must.
// No I/O here. Dates are YYYY-MM-DD strings in Asia/Seoul; `today` is always passed in.

export const MUST_CAP = 3;
export const DUE_SOON_DAYS = 3;
export const DEFER_LIMIT = 2;
export const DEFER_MAX_DAYS = 7;
export const DEFAULT_DUE_DAYS = 7;
export const SPLIT_MIN = 2;
export const SPLIT_MAX = 5;
export const KINDS = Object.freeze(["work", "habit", "cleanup", "decision"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_LINE_RE = /^(\s*)- \[([ xX-])\] (.*)$/;
const FIELD_RE = /\[([a-z_]+):: ([^\]]*)\]/g;
const FIELD_START_RE = /\[[a-z_]+:: /;
const FIELD_ORDER = ["id", "kind", "due", "defer", "tier", "done_when", "first", "created", "closed", "how"];

export class MustError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "MustError";
    this.code = code;
    this.extra = extra;
  }
}

export function isDateString(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function todayInSeoul(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function cleanValue(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\]/g, ")").trim();
}

function cleanTitle(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\[([a-z_]+)::/g, "($1::")
    .trim();
}

export function parseMustText(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const items = [];
  lines.forEach((line, lineIndex) => {
    const match = ITEM_LINE_RE.exec(line);
    if (!match) {
      return;
    }
    const rest = match[3];
    const fields = {};
    for (const field of rest.matchAll(FIELD_RE)) {
      fields[field[1]] = field[2].trim();
    }
    if (!fields.id) {
      return;
    }
    const fieldStart = rest.search(FIELD_START_RE);
    const title = (fieldStart === -1 ? rest : rest.slice(0, fieldStart)).trim();
    const mark = match[2];
    const defer = Number.parseInt(fields.defer ?? "0", 10);
    items.push({
      id: fields.id,
      title,
      state: mark === " " ? "open" : mark === "-" ? "dropped" : "done",
      kind: KINDS.includes(fields.kind) ? fields.kind : "work",
      due: isDateString(fields.due) ? fields.due : "",
      defer: Number.isFinite(defer) && defer > 0 ? defer : 0,
      tier: fields.tier === "must" ? "must" : "list",
      doneWhen: fields.done_when ?? "",
      first: fields.first ?? "",
      created: isDateString(fields.created) ? fields.created : "",
      closed: isDateString(fields.closed) ? fields.closed : "",
      how: fields.how ?? "",
      lineIndex,
      indent: match[1]
    });
  });
  return { lines, items };
}

export function serializeItem(item) {
  const mark = item.state === "done" ? "x" : item.state === "dropped" ? "-" : " ";
  const values = {
    id: item.id,
    kind: item.kind,
    due: item.due,
    defer: String(item.defer ?? 0),
    tier: item.tier,
    done_when: item.doneWhen,
    first: item.first,
    created: item.created,
    closed: item.closed,
    how: item.how
  };
  const fields = FIELD_ORDER.filter((key) => cleanValue(values[key]) !== "")
    .map((key) => `[${key}:: ${cleanValue(values[key])}]`)
    .join(" ");
  return `${item.indent ?? ""}- [${mark}] ${cleanTitle(item.title)} ${fields}`.trimEnd();
}

function compareCandidates(a, b) {
  if (a.due !== b.due) {
    return a.due < b.due ? -1 : 1;
  }
  if (a.tier !== b.tier) {
    return a.tier === "must" ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function computeState(items, today, { gateDisabled = false } = {}) {
  const open = items.filter((item) => item.state === "open");
  const candidates = [];
  const rest = [];
  for (const item of open) {
    const due = item.due || addDays(today, DEFAULT_DUE_DAYS);
    const daysLeft = daysBetween(today, due);
    const soon = daysLeft <= DUE_SOON_DAYS;
    const reason = item.tier === "must" ? "explicit" : soon ? (daysLeft < 0 ? "overdue" : "due-soon") : "";
    const view = { ...item, due, daysLeft, reason, deferLeft: Math.max(0, DEFER_LIMIT - item.defer) };
    (reason ? candidates : rest).push(view);
  }
  candidates.sort(compareCandidates);
  rest.sort(compareCandidates);
  const must = candidates.slice(0, MUST_CAP);
  const waiting = candidates.slice(MUST_CAP);
  const recent = items
    .filter((item) => item.state !== "open" && item.closed)
    .sort((a, b) => (a.closed < b.closed ? 1 : a.closed > b.closed ? -1 : 0))
    .slice(0, 5)
    .map((item) => ({ id: item.id, title: item.title, state: item.state, closed: item.closed, how: item.how }));
  return {
    today,
    cap: MUST_CAP,
    deferLimit: DEFER_LIMIT,
    gateOpen: !gateDisabled && must.length > 0,
    gateDisabled,
    must,
    waiting,
    list: rest,
    recent
  };
}

function findOpen(items, id) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new MustError("NOT_FOUND", `항목을 찾을 수 없음: ${id}`);
  }
  if (item.state !== "open") {
    throw new MustError("NOT_OPEN", `이미 닫힌 항목: ${id}`);
  }
  return item;
}

function isCurrentMust(items, id, today) {
  return computeState(items, today).must.some((item) => item.id === id);
}

export function newId(today, random = Math.random) {
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `m-${today.slice(2).replace(/-/g, "")}-${suffix}`;
}

export function opCapture(items, { title, kind = "work", due = "", doneWhen = "", first = "" }, today, random = Math.random) {
  const cleaned = cleanTitle(title);
  if (!cleaned) {
    throw new MustError("TITLE_REQUIRED", "제목이 필요하다");
  }
  if (due && !isDateString(due)) {
    throw new MustError("BAD_DATE", `날짜 형식이 아님: ${due}`);
  }
  const item = {
    id: newId(today, random),
    title: cleaned,
    state: "open",
    kind: KINDS.includes(kind) ? kind : "work",
    due: due || addDays(today, DEFAULT_DUE_DAYS),
    defer: 0,
    tier: "list",
    doneWhen: cleanValue(doneWhen),
    first: cleanValue(first),
    created: today,
    closed: "",
    how: "",
    indent: ""
  };
  return { items: [...items, item], created: [item], log: `capture ${item.id} ${item.title} (기한 ${item.due})` };
}

export function opPromote(items, id, today) {
  const target = findOpen(items, id);
  if (isCurrentMust(items, id, today)) {
    return { items, created: [], log: "" };
  }
  const state = computeState(items, today);
  if (state.must.length >= MUST_CAP) {
    throw new MustError("CAP_FULL", `must는 ${MUST_CAP}개까지다. 먼저 하나를 끝내거나 내려야 한다.`, {
      must: state.must.map((item) => ({ id: item.id, title: item.title }))
    });
  }
  const next = items.map((item) => (item.id === id ? { ...item, tier: "must" } : item));
  return { items: next, created: [], log: `promote ${id} ${target.title}` };
}

export function opDone(items, id, { note = "" } = {}, today) {
  const target = findOpen(items, id);
  const how = cleanValue(note);
  if (target.kind === "decision" && !how) {
    throw new MustError("NOTE_REQUIRED", "결정 항목은 결정 내용 한 줄이 필요하다");
  }
  const next = items.map((item) => (item.id === id ? { ...item, state: "done", closed: today, how } : item));
  return { items: next, created: [], log: `done ${id} ${target.title}${how ? ` — ${how}` : ""}` };
}

export function opDefer(items, id, { until }, today) {
  const target = findOpen(items, id);
  if (!isDateString(until)) {
    throw new MustError("BAD_DATE", `날짜 형식이 아님: ${until}`);
  }
  if (target.defer >= DEFER_LIMIT) {
    throw new MustError("DEFER_LIMIT", `이미 ${DEFER_LIMIT}번 미뤘다. 하기·버리기·쪼개기 중 하나를 골라야 한다.`);
  }
  if (until <= today) {
    throw new MustError("BAD_DATE", "미루는 날짜는 오늘보다 뒤여야 한다");
  }
  if (until > addDays(today, DEFER_MAX_DAYS)) {
    throw new MustError("BAD_DATE", `최대 ${DEFER_MAX_DAYS}일까지만 미룰 수 있다`);
  }
  const next = items.map((item) =>
    item.id === id ? { ...item, due: until, defer: item.defer + 1, tier: "list" } : item
  );
  return { items: next, created: [], log: `defer ${id} ${target.title} → ${until} (${target.defer + 1}/${DEFER_LIMIT})` };
}

export function opDrop(items, id, { reason = "" } = {}, today) {
  const target = findOpen(items, id);
  const how = cleanValue(reason);
  if (!how && isCurrentMust(items, id, today)) {
    throw new MustError("REASON_REQUIRED", "must를 버릴 때는 이유 한 줄이 필요하다");
  }
  const next = items.map((item) => (item.id === id ? { ...item, state: "dropped", closed: today, how } : item));
  return { items: next, created: [], log: `drop ${id} ${target.title}${how ? ` — ${how}` : ""}` };
}

export function opSplit(items, id, { parts }, today, random = Math.random) {
  const target = findOpen(items, id);
  const titles = (Array.isArray(parts) ? parts : []).map(cleanTitle).filter(Boolean);
  if (titles.length < SPLIT_MIN || titles.length > SPLIT_MAX) {
    throw new MustError("BAD_PARTS", `쪼개기는 ${SPLIT_MIN}~${SPLIT_MAX}개로 해야 한다`);
  }
  const due = target.due && target.due >= today ? target.due : today;
  const children = [];
  let working = items;
  for (const title of titles) {
    const created = opCapture(working, { title, kind: target.kind, due }, today, random);
    children.push(...created.created);
    working = created.items;
  }
  const next = working.map((item) =>
    item.id === id
      ? { ...item, state: "dropped", closed: today, how: `split: ${children.map((child) => child.id).join(" ")}` }
      : item
  );
  return { items: next, created: children, log: `split ${id} ${target.title} → ${children.map((child) => child.id).join(", ")}` };
}

// Rewrites only item lines; every other line of the note is kept as written.
export function applyItemsToLines(lines, parsedItems, nextItems, { itemsHeading = "## 항목" } = {}) {
  const out = [...lines];
  const byId = new Map(nextItems.map((item) => [item.id, item]));
  for (const old of parsedItems) {
    const next = byId.get(old.id);
    if (next) {
      out[old.lineIndex] = serializeItem({ ...next, indent: old.indent });
      byId.delete(old.id);
    }
  }
  const fresh = [...byId.values()];
  if (fresh.length) {
    const lastIndex = parsedItems.length ? Math.max(...parsedItems.map((item) => item.lineIndex)) : -1;
    let insertAt = lastIndex + 1;
    if (lastIndex === -1) {
      const heading = out.findIndex((line) => line.trim() === itemsHeading);
      if (heading === -1) {
        out.push("", itemsHeading, "");
        insertAt = out.length;
      } else {
        insertAt = heading + 1;
      }
    }
    out.splice(insertAt, 0, ...fresh.map((item) => serializeItem(item)));
  }
  return out;
}

export function appendLog(lines, entry, today, { logHeading = "## 기록" } = {}) {
  if (!entry) {
    return lines;
  }
  const out = [...lines];
  if (!out.some((line) => line.trim() === logHeading)) {
    while (out.length && out[out.length - 1].trim() === "") {
      out.pop();
    }
    out.push("", logHeading, "");
  }
  while (out.length && out[out.length - 1].trim() === "") {
    out.pop();
  }
  out.push(`- ${today} ${entry}`);
  out.push("");
  return out;
}
