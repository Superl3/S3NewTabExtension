const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_WEB_URL = "https://monday.com/";
const MONDAY_AUTH_STORAGE_KEY = "s3newtab-monday-auth-session-v1";
const LOCAL_AUTH_CONNECTOR_URL = "http://localhost:8787/api/auth/start";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

const DONE_GROUP_TITLES = new Set(["done", "completed", "완료"]);
const DONE_STATUS_LABELS = new Set(["done", "completed", "완료"]);

function isDoneGroupTitle(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized ? DONE_GROUP_TITLES.has(normalized) : false;
}

function isDoneStatusLabel(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized ? DONE_STATUS_LABELS.has(normalized) : false;
}

function normalizeBoardId(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, Math.floor(num));
}

function splitCsvText(value) {
  return normalizeText(value)
    .split(",")
    .map((entry) => normalizeText(entry))
    .filter(Boolean);
}

function csvEntries(value) {
  if (Array.isArray(value)) {
    const out = [];
    for (const entry of value) {
      out.push(...splitCsvText(entry));
    }
    return out;
  }
  return splitCsvText(value);
}

function normalizeBoardIds(value, fallback = []) {
  const source = csvEntries(value);
  const fallbackIds = csvEntries(fallback);
  const out = [];

  for (const entry of source) {
    const id = normalizeBoardId(entry, 0);
    if (id > 0 && !out.includes(id)) {
      out.push(id);
    }
  }

  if (out.length) {
    return out;
  }

  for (const entry of fallbackIds) {
    const id = normalizeBoardId(entry, 0);
    if (id > 0 && !out.includes(id)) {
      out.push(id);
    }
  }

  return out;
}

function normalizeMaxItems(value, fallback = 15) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 120);
  }
  return clamp(Math.round(num), 1, 120);
}

function normalizeHour(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), min, max);
  }
  return clamp(Math.round(num), min, max);
}

function normalizeColumnId(value, fallback = "") {
  return normalizeText(value, fallback).slice(0, 80);
}

function normalizePeopleColumnSelector(value, fallback = "") {
  const text = normalizeText(value, fallback);
  if (text === "*") {
    return "*";
  }
  return normalizeColumnId(text);
}

function normalizePeopleColumnSelectorList(value, fallback = "") {
  const source = csvEntries(value);
  const fallbackEntries = csvEntries(fallback);
  const normalized = source.length ? source : fallbackEntries;
  return normalized
    .map((entry) => normalizePeopleColumnSelector(entry))
    .filter(Boolean)
    .join(", ");
}

function parsePeopleColumnSelectorList(value) {
  return csvEntries(value)
    .map((entry) => normalizePeopleColumnSelector(entry))
    .filter(Boolean);
}

function resolveBoardPeopleColumnSelector(config, boardIndex) {
  const selectors = parsePeopleColumnSelectorList(config?.peopleColumnId);
  if (!selectors.length) {
    return "";
  }
  if (selectors.length === 1) {
    return selectors[0];
  }
  return selectors[boardIndex] || "";
}

function normalizeConnectorUrl(value, fallback = LOCAL_AUTH_CONNECTOR_URL) {
  const text = normalizeText(value, fallback);
  if (!text) {
    return "";
  }

  try {
    const parsed = new URL(text);
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(isLocalhost && parsed.protocol === "http:")) {
      return "";
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return normalizeText(error, "Unknown error");
  }
  if (typeof error.message === "string") {
    return normalizeText(error.message, "Unknown error");
  }
  return "Unknown error";
}

function rewriteAuthorizationLoadError(message) {
  const text = normalizeText(message).toLowerCase();
  if (text.includes("authorization page") && (text.includes("load") || text.includes("not loaded"))) {
    return "Authorization page could not be loaded. Check that connector server is running at http://localhost:8787 and then try Connect again.";
  }
  return message;
}

function isAuthErrorMessage(message) {
  const text = normalizeText(message).toLowerCase();
  return (
    text.includes("unauthorized") ||
    text.includes("not authenticated") ||
    text.includes("invalid token") ||
    text.includes("forbidden") ||
    text.includes("access denied")
  );
}

function isAuthCancelledMessage(message) {
  const text = normalizeText(message).toLowerCase();
  return (
    text.includes("cancel") ||
    text.includes("canceled") ||
    text.includes("cancelled") ||
    text.includes("did not approve") ||
    text.includes("closed") ||
    text.includes("interaction")
  );
}

function toLocalDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseAutoSlotsDone(value) {
  const text = normalizeText(value);
  if (!text) {
    return new Set();
  }

  const out = new Set();
  for (const part of text.split(",")) {
    const num = Number(part);
    if (Number.isInteger(num) && num >= 0 && num <= 2) {
      out.add(num);
    }
  }
  return out;
}

function serializeAutoSlotsDone(slotSet) {
  return Array.from(slotSet)
    .sort((a, b) => a - b)
    .join(",");
}

function formatDateLabel(rawDateTime) {
  const parsed = Date.parse(rawDateTime);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toLocaleString();
}

function formatTimeLabel(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function resolveMondayUrl(config) {
  const boardId = normalizeBoardIds(config?.boardIds, [config?.boardId])[0] || 0;
  if (boardId > 0) {
    return `${MONDAY_WEB_URL}boards/${boardId}`;
  }
  return MONDAY_WEB_URL;
}

function createAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildAuthConnectorStartUrl(connectorUrl, redirectUri, state, provider = "") {
  const url = new URL(connectorUrl);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (provider) {
    url.searchParams.set("provider", provider);
  }
  return url.toString();
}

function parseAuthFlowResult(callbackUrl) {
  const parsed = new URL(callbackUrl);
  const hashText = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  const hashParams = new URLSearchParams(hashText);
  const queryParams = parsed.searchParams;
  const read = (key) => normalizeText(queryParams.get(key) || hashParams.get(key));

  return {
    state: read("state"),
    accessToken:
      read("access_token") ||
      read("accessToken") ||
      read("token") ||
      read("id_token"),
    accountLabel: read("account") || read("email") || read("user") || read("name"),
    error: read("error"),
    errorDescription: read("error_description")
  };
}

function tryParseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

async function fetchConnectorToken(connectorUrl, provider) {
  const url = new URL(connectorUrl);
  url.searchParams.set("mode", "token");
  url.searchParams.set("provider", provider);
  const response = await fetch(url.toString());
  const text = normalizeText(await response.text());
  const payload = tryParseJson(text);
  if (!response.ok) {
    const message =
      normalizeText(payload?.message) ||
      normalizeText(payload?.error) ||
      normalizeText(payload?.error_description) ||
      `Token relay failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  const token =
    normalizeText(payload?.access_token) ||
    normalizeText(payload?.accessToken) ||
    normalizeText(payload?.token) ||
    normalizeText(payload?.id_token);
  if (!token) {
    throw new Error("Token relay response missing access_token.");
  }
  const accountLabel =
    normalizeText(payload?.account) ||
    normalizeText(payload?.email) ||
    normalizeText(payload?.user) ||
    normalizeText(payload?.name);
  return { accessToken: token, accountLabel };
}

function normalizeStoredAuthSession(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const rawConnector = normalizeText(raw.connectorUrl);
  if (!rawConnector) {
    return null;
  }
  const connectorUrl = normalizeConnectorUrl(rawConnector, "");
  const accessToken = normalizeText(raw.accessToken);
  if (!connectorUrl || !accessToken) {
    return null;
  }

  return {
    connectorUrl,
    accessToken,
    accountLabel: normalizeText(raw.accountLabel)
  };
}

async function loadStoredAuthSession() {
  try {
    const stored = await chrome.storage.local.get(MONDAY_AUTH_STORAGE_KEY);
    return normalizeStoredAuthSession(stored?.[MONDAY_AUTH_STORAGE_KEY]);
  } catch {
    return null;
  }
}

async function saveStoredAuthSession(session) {
  await chrome.storage.local.set({
    [MONDAY_AUTH_STORAGE_KEY]: {
      connectorUrl: normalizeConnectorUrl(session?.connectorUrl, ""),
      accessToken: normalizeText(session?.accessToken),
      accountLabel: normalizeText(session?.accountLabel)
    }
  });
}

async function clearStoredAuthSession() {
  try {
    await chrome.storage.local.remove(MONDAY_AUTH_STORAGE_KEY);
  } catch {
  }
}

function normalizedConfig(config) {
  const boardIds = normalizeBoardIds(config?.boardIds, [config?.boardId]);
  let workStartHour = normalizeHour(config?.workStartHour, 9, 0, 23);
  let workEndHour = normalizeHour(config?.workEndHour, 18, 1, 24);

  if (workEndHour <= workStartHour) {
    workEndHour = Math.min(24, workStartHour + 9);
    if (workEndHour <= workStartHour) {
      workStartHour = Math.max(0, workEndHour - 1);
    }
  }

  return {
    connectorUrl: normalizeConnectorUrl(config?.connectorUrl),
    accessToken: normalizeText(config?.accessToken),
    boardIds,
    boardId: boardIds[0] || 0,
    peopleColumnId: normalizePeopleColumnSelectorList(config?.peopleColumnId),
    maxItems: normalizeMaxItems(config?.maxItems, 15),
    workStartHour,
    workEndHour,
    openInNewTab: config?.openInNewTab !== false,
    autoRefreshDayKey: normalizeText(config?.autoRefreshDayKey),
    autoRefreshSlotsDone: normalizeText(config?.autoRefreshSlotsDone)
  };
}

function configSignature(config) {
  return [
    config.connectorUrl,
    config.accessToken,
    config.boardIds.join(","),
    config.peopleColumnId,
    config.maxItems,
    config.workStartHour,
    config.workEndHour,
    config.openInNewTab ? 1 : 0
  ].join("|");
}

function hasConnectorConfig(config) {
  return Boolean(config.connectorUrl) || Boolean(config.accessToken);
}

function hasBoardConfig(config) {
  return Array.isArray(config.boardIds) && config.boardIds.length > 0;
}

function autoSlotMinutes(config) {
  const start = config.workStartHour * 60;
  const end = config.workEndHour * 60;
  const span = Math.max(60, end - start);
  const slots = [];

  for (let index = 0; index < 3; index += 1) {
    const minute = Math.min(end - 1, start + Math.round((span * index) / 3));
    if (!slots.includes(minute)) {
      slots.push(minute);
    }
  }

  while (slots.length < 3) {
    const candidate = Math.min(end - 1, (slots[slots.length - 1] ?? start) + 1);
    if (slots.includes(candidate)) {
      break;
    }
    slots.push(candidate);
  }

  return slots;
}

function dateAtMinute(sourceDate, minuteOfDay) {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return new Date(
    sourceDate.getFullYear(),
    sourceDate.getMonth(),
    sourceDate.getDate(),
    hours,
    minutes,
    0,
    0
  );
}

function dueAutoSlotIndices(config, now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const workStart = config.workStartHour * 60;
  const workEnd = config.workEndHour * 60;
  if (nowMinutes < workStart || nowMinutes >= workEnd) {
    return [];
  }

  const slots = autoSlotMinutes(config);
  const dayKey = toLocalDayKey(now);
  const doneSet =
    config.autoRefreshDayKey === dayKey
      ? parseAutoSlotsDone(config.autoRefreshSlotsDone)
      : new Set();

  const due = [];
  for (let index = 0; index < slots.length; index += 1) {
    if (doneSet.has(index)) {
      continue;
    }
    if (slots[index] <= nowMinutes) {
      due.push(index);
    }
  }
  return due;
}

function nextAutoSlot(config, now = new Date()) {
  const slots = autoSlotMinutes(config);
  const dayKey = toLocalDayKey(now);
  const doneSet =
    config.autoRefreshDayKey === dayKey
      ? parseAutoSlotsDone(config.autoRefreshSlotsDone)
      : new Set();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (let index = 0; index < slots.length; index += 1) {
    if (doneSet.has(index)) {
      continue;
    }
    if (slots[index] > nowMinutes) {
      return {
        slotIndex: index,
        runAt: dateAtMinute(now, slots[index])
      };
    }
  }

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return {
    slotIndex: 0,
    runAt: dateAtMinute(tomorrow, slots[0])
  };
}

function updateDoneSlotsForToday(config, now, indicesToMark) {
  const dayKey = toLocalDayKey(now);
  const doneSet =
    config.autoRefreshDayKey === dayKey
      ? parseAutoSlotsDone(config.autoRefreshSlotsDone)
      : new Set();

  for (const index of indicesToMark) {
    doneSet.add(index);
  }

  return {
    dayKey,
    slotsDone: serializeAutoSlotsDone(doneSet)
  };
}

async function mondayFetchGraphql(accessToken, query) {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      Authorization: accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query }),
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      normalizeText(payload?.errors?.[0]?.message) ||
      normalizeText(payload?.error_message) ||
      `HTTP ${response.status}`;
    const error = new Error(message);
    if (response.status === 401 || response.status === 403) {
      error.code = "auth";
    }
    throw error;
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Monday API response is empty.");
  }

  if (Array.isArray(payload.errors) && payload.errors.length) {
    const message = normalizeText(payload.errors[0]?.message, "Monday API request failed.");
    const error = new Error(message);
    if (isAuthErrorMessage(message)) {
      error.code = "auth";
    }
    throw error;
  }

  return payload.data || {};
}

async function fetchContext(config, accessToken) {
  const query = `
    query {
      me {
        id
        name
      }
      boards(ids: ${config.boardId}) {
        id
        name
        groups {
          id
          title
        }
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const data = await mondayFetchGraphql(accessToken, query);
  const meId = Number(data?.me?.id);
  if (!Number.isFinite(meId) || meId <= 0) {
    throw new Error("Unable to read your Monday profile from the connected account.");
  }

  const board = Array.isArray(data?.boards) ? data.boards[0] : null;
  if (!board) {
    throw new Error("Board not found or access denied for this account.");
  }

  const allColumns = Array.isArray(board?.columns) ? board.columns : [];
  const peopleColumns = allColumns.filter((column) => {
    const type = normalizeText(column?.type).toLowerCase();
    const title = normalizeText(column?.title).toLowerCase();
    return (
      type === "people" ||
      type === "multiple-person" ||
      type === "person" ||
      title.includes("owner") ||
      title.includes("assignee") ||
      title.includes("assigned")
    );
  });
  const statusColumnIds = allColumns
    .filter((column) => {
      const type = normalizeText(column?.type).toLowerCase();
      const title = normalizeText(column?.title).toLowerCase();
      return (
        type === "status" ||
        type === "color" ||
        title === "status" ||
        title.includes("status") ||
        title.includes("상태")
      );
    })
    .map((column) => normalizeText(column?.id))
    .filter(Boolean);
  const boardGroups = Array.isArray(board?.groups)
    ? board.groups
        .map((group) => ({
          id: normalizeText(group?.id),
          title: normalizeText(group?.title)
        }))
        .filter((group) => group.id || group.title)
    : [];

  return {
    meId,
    meName: normalizeText(data?.me?.name),
    boardName: normalizeText(board?.name, `Board ${config.boardId}`),
    peopleColumns,
    statusColumnIds,
    boardGroups
  };
}

function resolvePeopleColumnIds(peopleColumns, configuredSelector = "") {
  const configured = normalizePeopleColumnSelector(configuredSelector);

  const normalizedColumns = Array.isArray(peopleColumns)
    ? peopleColumns
        .map((column) => ({
          id: normalizeText(column?.id),
          idKey: normalizeText(column?.id).toLowerCase(),
          title: normalizeText(column?.title),
          titleKey: normalizeText(column?.title).toLowerCase()
        }))
        .filter((column) => column.id)
    : [];

  if (!normalizedColumns.length) {
    throw new Error(
      "No People column detected for this board. Set People column ID(s) in widget settings or use * for all tasks."
    );
  }

  if (configured && configured !== "*") {
    const selectorKey = configured.toLowerCase();

    const exactId = normalizedColumns.find((column) => column.id === configured || column.idKey === selectorKey);
    if (exactId) {
      return [exactId.id];
    }

    const exactTitleMatches = normalizedColumns.filter((column) => column.titleKey === selectorKey);
    if (exactTitleMatches.length) {
      return Array.from(new Set(exactTitleMatches.map((column) => column.id)));
    }

    const partialTitleMatches = normalizedColumns.filter((column) => column.titleKey.includes(selectorKey));
    if (partialTitleMatches.length) {
      return Array.from(new Set(partialTitleMatches.map((column) => column.id)));
    }

    throw new Error(`People column selector "${configured}" not found in this board.`);
  }

  const preferred = normalizedColumns.filter((column) => {
    return (
      column.titleKey.includes("owner") ||
      column.titleKey.includes("assignee") ||
      column.titleKey.includes("assigned")
    );
  });

  const ordered = [...preferred, ...normalizedColumns];
  const unique = [];
  const seen = new Set();
  for (const column of ordered) {
    if (!column.id || seen.has(column.id)) {
      continue;
    }
    seen.add(column.id);
    unique.push(column.id);
  }
  return unique;
}

function resolveBoardPeopleScope(config, boardIndex, peopleColumns) {
  const selector = resolveBoardPeopleColumnSelector(config, boardIndex);
  if (selector === "*") {
    return {
      mode: "all",
      columnIds: []
    };
  }

  return {
    mode: "assigned",
    columnIds: resolvePeopleColumnIds(peopleColumns, selector)
  };
}

function normalizeStatusColumnIds(statusColumnIds) {
  return Array.isArray(statusColumnIds)
    ? statusColumnIds.map((value) => normalizeColumnId(value)).filter(Boolean)
    : [];
}

function buildStatusColumnValuesSelection(statusColumnIds) {
  const ids = normalizeStatusColumnIds(statusColumnIds);
  if (!ids.length) {
    return "";
  }
  const idsLiteral = ids.map((id) => JSON.stringify(id)).join(", ");
  return `
            column_values(ids: [${idsLiteral}]) {
              id
              text
            }
  `;
}

function hasDoneStatusOnItem(item, statusColumnIds = []) {
  const values = Array.isArray(item?.column_values) ? item.column_values : [];
  if (!values.length) {
    return false;
  }

  const targetIds = new Set(normalizeStatusColumnIds(statusColumnIds));
  if (!targetIds.size) {
    return false;
  }

  for (const value of values) {
    const id = normalizeText(value?.id);
    if (!id || !targetIds.has(id)) {
      continue;
    }
    if (isDoneStatusLabel(value?.text)) {
      return true;
    }
  }

  return false;
}

function mapAssignedIssues(rawItems, maxItems, statusColumnIds = []) {
  const seen = new Set();
  const mapped = [];

  for (const entry of rawItems || []) {
    const id = normalizeText(entry?.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);

    if (hasDoneStatusOnItem(entry, statusColumnIds)) {
      continue;
    }

    const updatedAt = normalizeText(entry?.updated_at);
    const updatedTs = Date.parse(updatedAt);
    mapped.push({
      id,
      title: normalizeText(entry?.name, "(Untitled issue)"),
      url: normalizeText(entry?.url, MONDAY_WEB_URL),
      groupId: normalizeText(entry?.group?.id),
      groupTitle: normalizeText(entry?.group?.title),
      updatedLabel: formatDateLabel(updatedAt),
      updatedTs: Number.isFinite(updatedTs) ? updatedTs : 0
    });
  }

  mapped.sort((a, b) => b.updatedTs - a.updatedTs);
  if (Number.isFinite(maxItems) && maxItems > 0) {
    return mapped.slice(0, maxItems);
  }
  return mapped;
}

function normalizeCachedIssue(entry) {
  const id = normalizeText(entry?.id);
  if (!id) {
    return null;
  }
  const updatedTs = Number(entry?.updatedTs);
  return {
    id,
    title: normalizeText(entry?.title, "(Untitled issue)"),
    url: normalizeText(entry?.url, MONDAY_WEB_URL),
    groupId: normalizeText(entry?.groupId),
    groupTitle: normalizeText(entry?.groupTitle),
    updatedLabel: normalizeText(entry?.updatedLabel),
    updatedTs: Number.isFinite(updatedTs) ? updatedTs : 0
  };
}

function normalizeCachedGroup(entry) {
  return {
    id: normalizeText(entry?.id),
    title: normalizeText(entry?.title)
  };
}

function normalizeCachedBoardSnapshot(entry) {
  const boardId = normalizeBoardId(entry?.boardId, 0);
  if (!boardId) {
    return null;
  }

  const issues = Array.isArray(entry?.issues)
    ? entry.issues.map(normalizeCachedIssue).filter(Boolean)
    : [];
  const groups = Array.isArray(entry?.groups)
    ? entry.groups.map(normalizeCachedGroup).filter((group) => group.id || group.title)
    : [];

  return {
    boardId,
    boardName: normalizeText(entry?.boardName, `Board ${boardId}`),
    assigneeName: normalizeText(entry?.assigneeName, "me"),
    scopeMode: normalizeText(entry?.scopeMode) === "all" ? "all" : "assigned",
    groups,
    issues
  };
}

function readCachedSnapshot(rawConfig, cfg) {
  const cacheAt = Math.max(0, Number(rawConfig?.cacheAt) || 0);
  const configuredBoards = new Set(cfg.boardIds);
  const cacheBoards = Array.isArray(rawConfig?.cacheBoards)
    ? rawConfig.cacheBoards.map(normalizeCachedBoardSnapshot).filter(Boolean)
    : [];

  if (cacheBoards.length) {
    const boards = cacheBoards
      .filter((entry) => configuredBoards.has(entry.boardId))
      .map((entry) => ({
        boardId: entry.boardId,
        boardName: entry.boardName,
        assigneeName: entry.assigneeName,
        scopeMode: entry.scopeMode === "all" ? "all" : "assigned",
        groups: entry.groups,
        issues: (() => {
          const sorted = entry.issues
            .slice()
            .sort((a, b) => b.updatedTs - a.updatedTs);
          return entry.scopeMode === "all" ? sorted : sorted.slice(0, cfg.maxItems);
        })()
      }));

    if (!boards.length) {
      return null;
    }

    return { boards, cacheAt };
  }

  const cachedBoardId = normalizeBoardId(rawConfig?.cacheBoardId, 0);
  if (!cachedBoardId || !configuredBoards.has(cachedBoardId)) {
    return null;
  }

  const cachedIssues = Array.isArray(rawConfig?.cacheIssues)
    ? rawConfig.cacheIssues.map(normalizeCachedIssue).filter(Boolean)
    : [];
  if (!cachedIssues.length && !cacheAt) {
    return null;
  }

  const cachedGroups = Array.isArray(rawConfig?.cacheGroups)
    ? rawConfig.cacheGroups.map(normalizeCachedGroup).filter((group) => group.id || group.title)
    : [];

  return {
    boards: [
      {
        boardId: cachedBoardId,
        boardName: normalizeText(rawConfig?.cacheBoardName, `Board ${cachedBoardId}`),
        assigneeName: normalizeText(rawConfig?.cacheAssigneeName, "me"),
        scopeMode: "assigned",
        issues: cachedIssues
          .slice()
          .sort((a, b) => b.updatedTs - a.updatedTs)
          .slice(0, cfg.maxItems),
        groups: cachedGroups
      }
    ],
    cacheAt
  };
}

function parsePeopleIdsFromValue(columnValue) {
  const parsed = tryParseJson(normalizeText(columnValue?.value));
  const people = Array.isArray(parsed?.personsAndTeams)
    ? parsed.personsAndTeams
    : Array.isArray(parsed?.persons_and_teams)
      ? parsed.persons_and_teams
      : [];

  const ids = [];
  for (const person of people) {
    const id = normalizeText(person?.id);
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

function isAssignedToMe(columnValues, meId) {
  const target = normalizeText(meId);
  if (!target) {
    return false;
  }

  const values = Array.isArray(columnValues) ? columnValues : [];
  for (const value of values) {
    const ids = parsePeopleIdsFromValue(value);
    if (ids.includes(target)) {
      return true;
    }
  }
  return false;
}

function mapAssignedSubitems(parentItems, meId) {
  const out = [];
  const parents = Array.isArray(parentItems) ? parentItems : [];
  for (const parent of parents) {
    const parentTitle = normalizeText(parent?.name, "(Untitled issue)");
    const parentGroup = parent?.group;
    const subitems = Array.isArray(parent?.subitems) ? parent.subitems : [];
    for (const subitem of subitems) {
      if (!isAssignedToMe(subitem?.column_values, meId)) {
        continue;
      }
      out.push({
        id: normalizeText(subitem?.id),
        name: `${parentTitle} / ${normalizeText(subitem?.name, "(Untitled issue)")}`,
        url: normalizeText(subitem?.url, parent?.url || MONDAY_WEB_URL),
        updated_at: normalizeText(subitem?.updated_at, parent?.updated_at),
        group: subitem?.group || parentGroup,
        isSubitem: true
      });
    }
  }
  return out;
}

function mapAllSubitems(parentItems) {
  const out = [];
  const parents = Array.isArray(parentItems) ? parentItems : [];
  for (const parent of parents) {
    const parentTitle = normalizeText(parent?.name, "(Untitled issue)");
    const parentGroup = parent?.group;
    const subitems = Array.isArray(parent?.subitems) ? parent.subitems : [];
    for (const subitem of subitems) {
      out.push({
        id: normalizeText(subitem?.id),
        name: `${parentTitle} / ${normalizeText(subitem?.name, "(Untitled issue)")}`,
        url: normalizeText(subitem?.url, parent?.url || MONDAY_WEB_URL),
        updated_at: normalizeText(subitem?.updated_at, parent?.updated_at),
        group: subitem?.group || parentGroup,
        isSubitem: true
      });
    }
  }
  return out;
}

async function fetchBoardIssues(config, accessToken, statusColumnIds = []) {
  const scanLimit = 300;
  const statusColumnValuesSelection = buildStatusColumnValuesSelection(statusColumnIds);
  const query = `
    query {
      boards(ids: [${config.boardId}]) {
        items_page(limit: ${scanLimit}) {
          items {
            id
            name
            url
            updated_at
            group {
              id
              title
            }
            ${statusColumnValuesSelection}
          }
        }
      }
    }
  `;

  try {
    const data = await mondayFetchGraphql(accessToken, query);
    const board = Array.isArray(data?.boards) ? data.boards[0] : null;
    const parentItems = Array.isArray(board?.items_page?.items) ? board.items_page.items : [];
    return mapAssignedIssues(parentItems, 0, statusColumnIds);
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const noItemsPage = message.includes("Cannot query field \"items_page\"");
    if (!noItemsPage) {
      throw error;
    }

    const legacyQuery = `
      query {
        boards(ids: [${config.boardId}]) {
          items(limit: ${scanLimit}) {
            id
            name
            url
            updated_at
            group {
              id
              title
            }
            ${statusColumnValuesSelection}
          }
        }
      }
    `;

    const legacyData = await mondayFetchGraphql(accessToken, legacyQuery);
    const legacyBoard = Array.isArray(legacyData?.boards) ? legacyData.boards[0] : null;
    const parentItems = Array.isArray(legacyBoard?.items) ? legacyBoard.items : [];
    return mapAssignedIssues(parentItems, 0, statusColumnIds);
  }
}

async function fetchAssignedFromColumn(config, meId, peopleColumnId, accessToken, statusColumnIds = []) {
  const fetchLimit = clamp(Math.max(config.maxItems * 4, 80), 1, 300);
  const statusColumnValuesSelection = buildStatusColumnValuesSelection(statusColumnIds);

  const query = `
    query {
      boards(ids: [${config.boardId}]) {
        items_page(
          limit: ${fetchLimit}
          query_params: {
            rules: [
              {
                column_id: ${JSON.stringify(peopleColumnId)}
                operator: any_of
                compare_value: ["assigned_to_me"]
              }
            ]
            operator: and
          }
        ) {
          items {
            id
            name
            url
            updated_at
            group {
              id
              title
            }
            ${statusColumnValuesSelection}
          }
        }
      }
    }
  `;

  try {
    const data = await mondayFetchGraphql(accessToken, query);
    const board = Array.isArray(data?.boards) ? data.boards[0] : null;
    const parentItems = Array.isArray(board?.items_page?.items) ? board.items_page.items : [];
    return parentItems;
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const noItemsPage =
      message.includes("Cannot query field \"items_page\"") ||
      message.includes("Unknown argument \"query_params\"");
    if (!noItemsPage) {
      throw error;
    }

    const legacyFilter = JSON.stringify({
      personsAndTeams: [{ id: meId, kind: "person" }]
    });
    const legacyQuery = `
      query {
        items_by_column_values(
          board_id: ${config.boardId}
          column_id: ${JSON.stringify(peopleColumnId)}
          column_value: ${JSON.stringify(legacyFilter)}
        ) {
          id
          name
          url
          updated_at
          group {
            id
            title
          }
          ${statusColumnValuesSelection}
        }
      }
    `;

    const legacyData = await mondayFetchGraphql(accessToken, legacyQuery);
    const legacyItems = Array.isArray(legacyData?.items_by_column_values)
      ? legacyData.items_by_column_values
      : [];
    return legacyItems;
  }
}

async function fetchAssignedSubitemsAcrossBoard(config, meId, peopleColumnIds, accessToken) {
  const columnIds = Array.isArray(peopleColumnIds)
    ? peopleColumnIds.map((value) => normalizeColumnId(value)).filter(Boolean)
    : [];

  if (!columnIds.length) {
    return [];
  }

  const scanLimit = clamp(Math.max(config.maxItems * 20, 120), 50, 300);
  const idsLiteral = columnIds.map((id) => JSON.stringify(id)).join(", ");
  const query = `
    query {
      boards(ids: [${config.boardId}]) {
        items_page(limit: ${scanLimit}) {
          items {
            id
            name
            url
            updated_at
            group {
              id
              title
            }
            subitems {
              id
              name
              url
              updated_at
              group {
                id
                title
              }
              column_values(ids: [${idsLiteral}]) {
                id
                value
                text
              }
            }
          }
        }
      }
    }
  `;

  const data = await mondayFetchGraphql(accessToken, query);
  const board = Array.isArray(data?.boards) ? data.boards[0] : null;
  const parentItems = Array.isArray(board?.items_page?.items) ? board.items_page.items : [];
  return mapAssignedSubitems(parentItems, meId);
}

async function fetchAssignedIssues(config, meId, peopleColumnIds, accessToken, statusColumnIds = []) {
  const columnIds = Array.isArray(peopleColumnIds)
    ? peopleColumnIds.map((value) => normalizeColumnId(value)).filter(Boolean)
    : [];

  if (!columnIds.length) {
    return [];
  }

  const allItems = [];
  let firstColumnError = null;
  for (const columnId of columnIds) {
    try {
      const fromColumn = await fetchAssignedFromColumn(
        config,
        meId,
        columnId,
        accessToken,
        statusColumnIds
      );
      if (Array.isArray(fromColumn) && fromColumn.length) {
        allItems.push(...fromColumn);
      }
    } catch (error) {
      if (!firstColumnError) {
        firstColumnError = error;
      }
    }
  }

  if (!allItems.length && firstColumnError) {
    throw firstColumnError;
  }

  return mapAssignedIssues(allItems, config.maxItems, statusColumnIds);
}

function groupIssuesByGroup(items, boardGroups) {
  const bucketByKey = new Map();

  for (const issue of items || []) {
    const groupId = normalizeText(issue?.groupId);
    const groupTitle = normalizeText(issue?.groupTitle, "Ungrouped");
    const key = groupId || groupTitle;
    let bucket = bucketByKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        groupId,
        title: groupTitle,
        items: []
      };
      bucketByKey.set(key, bucket);
    }
    bucket.items.push(issue);
  }

  const result = [];
  const used = new Set();
  for (const group of boardGroups || []) {
    const key = normalizeText(group?.id);
    if (!key || used.has(key)) {
      continue;
    }
    const bucket = bucketByKey.get(key);
    if (!bucket) {
      continue;
    }
    bucket.title = normalizeText(group?.title, bucket.title);
    result.push(bucket);
    used.add(key);
  }

  const remaining = [];
  for (const bucket of bucketByKey.values()) {
    if (used.has(bucket.key)) {
      continue;
    }
    remaining.push(bucket);
  }
  remaining.sort((a, b) => a.title.localeCompare(b.title));
  result.push(...remaining);

  for (const bucket of result) {
    bucket.items.sort((a, b) => b.updatedTs - a.updatedTs);
  }

  return result;
}

export const mondayAssignedWidget = {
  type: "mondayAssigned",
  title: "Monday Assigned Issues",
  defaultConfig: {
    connectorUrl: LOCAL_AUTH_CONNECTOR_URL,
    accessToken: "",
    boardId: "",
    peopleColumnId: "",
    maxItems: 15,
    workStartHour: 9,
    workEndHour: 18,
    openInNewTab: true,
    autoRefreshDayKey: "",
    autoRefreshSlotsDone: "",
    cacheBoardId: 0,
    cacheAt: 0,
    cacheBoardName: "",
    cacheAssigneeName: "",
    cacheGroups: [],
    cacheIssues: [],
    cacheBoards: []
  },
  defaultLayout: {
    x: 1080,
    y: 520,
    w: 520,
    h: 360
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [
    {
      key: "connectorUrl",
      label: "Auth connector URL",
      type: "url",
      placeholder: "https://your-backend.example.com/api/monday/oauth/start",
      helpText: "Backend OAuth start endpoint. It must return to this extension with access_token."
    },
    {
      key: "boardId",
      label: "Board ID(s)",
      type: "text",
      placeholder: "123456789 or 123456789,987654321",
      helpText: "Use numeric board IDs from /boards/<id>. Comma-separated IDs are supported."
    },
    {
      key: "peopleColumnId",
      label: "People column ID(s)",
      type: "text",
      placeholder: "person or person,owner,*",
      helpText: "Comma-separated selectors follow board index order. Each selector can be column ID/title, and * shows all tasks in that board."
    },
    {
      key: "maxItems",
      label: "Items to show",
      type: "number",
      min: 1,
      max: 120,
      step: 1
    },
    {
      key: "workStartHour",
      label: "Work start hour",
      type: "number",
      min: 0,
      max: 23,
      step: 1,
      helpText: "Auto refresh runs 3 times between start/end hours"
    },
    {
      key: "workEndHour",
      label: "Work end hour",
      type: "number",
      min: 1,
      max: 24,
      step: 1
    },
    { key: "openInNewTab", label: "Open issue in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, getUi, patchConfig, isEditMode, openSettings }) {
    container.classList.add("monday-widget");

    const shell = document.createElement("div");
    shell.className = "monday-widget-shell";

    const status = document.createElement("p");
    status.className = "monday-widget-status";

    const list = document.createElement("ul");
    list.className = "monday-issue-list";

    shell.append(list, status);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let boardSnapshots = [];
    let connected = false;
    let accountLabel = "";
    let accessToken = "";
    let sessionConnectorUrl = "";
    let hasFetched = false;
    let nextAutoRunAt = null;
    let lastSignature = "";
    let requestSerial = 0;
    let timer = null;
    let sessionSyncSerial = 0;
    let storageListener = null;
    const collapsedGroupKeys = new Set();

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function resolveConfig() {
      const cfg = normalizedConfig(getConfig());
      const globalAccessToken = normalizeText(getUi?.()?.monday?.accessToken);
      if (!globalAccessToken) {
        return cfg;
      }
      return {
        ...cfg,
        accessToken: globalAccessToken
      };
    }

    function openMondayPage() {
      const cfg = resolveConfig();
      const href = resolveMondayUrl(cfg);
      const target = cfg.openInNewTab ? "_blank" : "_self";
      if (target === "_blank") {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
    }

    function applyCachedSnapshotIfPresent(rawConfig, cfg) {
      const cached = readCachedSnapshot(rawConfig, cfg);
      if (!cached) {
        return;
      }

      boardSnapshots = Array.isArray(cached.boards)
        ? cached.boards.map((entry) => ({
            boardId: normalizeBoardId(entry?.boardId, 0),
            boardName: normalizeText(entry?.boardName),
            assigneeName: normalizeText(entry?.assigneeName, "me"),
            scopeMode: normalizeText(entry?.scopeMode) === "all" ? "all" : "assigned",
            boardGroups: Array.isArray(entry?.groups) ? entry.groups : [],
            issues: Array.isArray(entry?.issues) ? entry.issues : []
          }))
        : [];
      hasFetched = boardSnapshots.length > 0;
    }

    function persistSnapshot(cfg) {
      const cacheBoards = boardSnapshots
        .map((snapshot) => {
          const boardId = normalizeBoardId(snapshot?.boardId, 0);
          if (!boardId) {
            return null;
          }

          const issues = Array.isArray(snapshot?.issues)
            ? snapshot.issues.map((issue) => ({
                id: normalizeText(issue?.id),
                title: normalizeText(issue?.title),
                url: normalizeText(issue?.url),
                groupId: normalizeText(issue?.groupId),
                groupTitle: normalizeText(issue?.groupTitle),
                updatedLabel: normalizeText(issue?.updatedLabel),
                updatedTs: Number(issue?.updatedTs) || 0
              }))
            : [];

          const groups = Array.isArray(snapshot?.boardGroups)
            ? snapshot.boardGroups.map((group) => ({
                id: normalizeText(group?.id),
                title: normalizeText(group?.title)
              }))
            : [];

          return {
            boardId,
            boardName: normalizeText(snapshot?.boardName, `Board ${boardId}`),
            assigneeName: normalizeText(snapshot?.assigneeName, "me"),
            scopeMode: normalizeText(snapshot?.scopeMode) === "all" ? "all" : "assigned",
            groups,
            issues
          };
        })
        .filter(Boolean);

      const primary = cacheBoards[0] || null;
      const cacheIssues = primary?.issues || [];
      const cacheGroups = primary?.groups || [];
      const cacheBoardName = primary?.boardName || "";
      const cacheAssigneeName = primary?.assigneeName || "";
      const cacheBoardId = primary?.boardId || 0;

      const currentCfg = getConfig();
      const currentCacheBoards = Array.isArray(currentCfg?.cacheBoards)
        ? currentCfg.cacheBoards.map(normalizeCachedBoardSnapshot).filter(Boolean)
        : [];

      const unchanged = JSON.stringify(currentCacheBoards) === JSON.stringify(cacheBoards);

      if (unchanged) {
        return;
      }

      patchConfig({
        cacheBoardId,
        cacheAt: Date.now(),
        cacheBoardName,
        cacheAssigneeName,
        cacheGroups,
        cacheIssues,
        cacheBoards
      });
    }

    function hasActiveConnection(config) {
      const configuredToken = normalizeText(config?.accessToken);
      if (configuredToken && accessToken === configuredToken) {
        return true;
      }
      return (
        connected &&
        Boolean(accessToken) &&
        Boolean(sessionConnectorUrl) &&
        config.connectorUrl === sessionConnectorUrl
      );
    }

    async function clearConnectionState({ clearStored = true } = {}) {
      connected = false;
      accountLabel = "";
      accessToken = "";
      sessionConnectorUrl = "";
      if (clearStored) {
        await clearStoredAuthSession();
      }
    }

    async function syncStoredSessionForConfig(config) {
      const syncId = ++sessionSyncSerial;
      const connectorUrl = normalizeConnectorUrl(config?.connectorUrl);
      const configuredToken = normalizeText(config?.accessToken);
      if (configuredToken) {
        connected = true;
        accessToken = configuredToken;
        accountLabel = "Configured token";
        sessionConnectorUrl = connectorUrl;
        return true;
      }

      if (!connectorUrl) {
        await clearConnectionState({ clearStored: false });
        return false;
      }

      const stored = await loadStoredAuthSession();
      if (syncId !== sessionSyncSerial) {
        return false;
      }

      if (stored && stored.connectorUrl === connectorUrl) {
        connected = true;
        accessToken = stored.accessToken;
        accountLabel = stored.accountLabel;
        sessionConnectorUrl = stored.connectorUrl;
        return true;
      }

      await clearConnectionState({ clearStored: false });
      return false;
    }

    function installStorageListener() {
      if (storageListener || !chrome?.storage?.onChanged?.addListener) {
        return;
      }

      storageListener = (changes, areaName) => {
        if (
          areaName !== "local" ||
          !changes ||
          !Object.prototype.hasOwnProperty.call(changes, MONDAY_AUTH_STORAGE_KEY)
        ) {
          return;
        }

        const cfg = resolveConfig();
        if (!hasConnectorConfig(cfg)) {
          return;
        }

        void syncStoredSessionForConfig(cfg).finally(() => {
          render();
          if (!loading && hasBoardConfig(cfg) && hasActiveConnection(cfg) && shouldRunAutoNow()) {
            void loadIssues({ reason: "auto" });
            return;
          }
          scheduleRefresh();
        });
      };

      chrome.storage.onChanged.addListener(storageListener);
    }

    function removeStorageListener() {
      if (!storageListener || !chrome?.storage?.onChanged?.removeListener) {
        return;
      }
      chrome.storage.onChanged.removeListener(storageListener);
      storageListener = null;
    }

    async function connectAccount() {
      const cfg = resolveConfig();
      if (!hasConnectorConfig(cfg)) {
        errorMessage = "Set auth connector URL in widget settings first.";
        render();
        return;
      }

      loading = true;
      errorMessage = "";
      render();

      try {
        let token = normalizeText(cfg.accessToken);
        let tokenAccount = token ? "Configured token" : "";
        let tokenRelayFailureMessage = "";
        if (!token && cfg.connectorUrl) {
          try {
            const fallback = await fetchConnectorToken(cfg.connectorUrl, "monday");
            token = fallback.accessToken;
            tokenAccount = fallback.accountLabel;
          } catch (relayError) {
            tokenRelayFailureMessage = normalizeErrorMessage(relayError);
          }
        }

        if (!token && chrome.identity?.launchWebAuthFlow && chrome.identity?.getRedirectURL) {
          const state = createAuthState();
          const redirectUri = chrome.identity.getRedirectURL("monday-auth");
          const startUrl = buildAuthConnectorStartUrl(cfg.connectorUrl, redirectUri, state, "monday");
          const callbackUrl = await chrome.identity.launchWebAuthFlow({
            url: startUrl,
            interactive: true
          });

          const result = parseAuthFlowResult(callbackUrl);
          if (result.error || result.errorDescription) {
            throw new Error(result.errorDescription || result.error || "Monday connection failed.");
          }
          if (!result.state || result.state !== state) {
            throw new Error("Monday connection failed (invalid state).");
          }

          token = normalizeText(result.accessToken);
          if (!token) {
            throw new Error("Auth connector did not return access_token.");
          }

          tokenAccount = normalizeText(result.accountLabel);
        }

        if (!token) {
          throw new Error(
            tokenRelayFailureMessage ||
              "Unable to obtain Monday connector token. Try Connect again."
          );
        }

        connected = true;
        accessToken = token;
        accountLabel = tokenAccount;
        sessionConnectorUrl = cfg.connectorUrl;
        if (!normalizeText(cfg.accessToken)) {
          await saveStoredAuthSession({
            connectorUrl: cfg.connectorUrl,
            accessToken: token,
            accountLabel
          });
        }

        errorMessage = "";
        hasFetched = false;
      } catch (error) {
        await clearConnectionState({ clearStored: true });
        let message = normalizeErrorMessage(error);
        message = rewriteAuthorizationLoadError(message);
        if (isAuthCancelledMessage(message)) {
          errorMessage = "Monday connection was cancelled.";
        } else {
          errorMessage = message;
        }
      } finally {
        loading = false;
        render();
        scheduleRefresh();
      }

      if (connected && hasBoardConfig(resolveConfig())) {
        void loadIssues({ reason: "manual" });
      }
    }

    async function disconnectAccount() {
      const cfg = resolveConfig();
      if (normalizeText(cfg.accessToken)) {
        errorMessage = "Remove Monday access token in Global settings to disconnect.";
        render();
        return;
      }

      loading = true;
      render();
      await clearConnectionState({ clearStored: true });
      errorMessage = "";
      boardSnapshots = [];
      hasFetched = false;
      nextAutoRunAt = null;
      loading = false;
      render();
      scheduleRefresh();
    }

    function renderGroupedIssues(targetList, grouped, cfg, scopeKey = "") {
      for (const bucket of grouped) {
        if (isDoneGroupTitle(bucket.title)) {
          continue;
        }

        const section = document.createElement("li");
        section.className = "monday-group-section";

        const details = document.createElement("details");
        details.className = "monday-group-details";
        const groupKey = `${scopeKey}:${bucket.key || bucket.title || "group"}`;
        details.open = !collapsedGroupKeys.has(groupKey);
        details.addEventListener("toggle", () => {
          if (details.open) {
            collapsedGroupKeys.delete(groupKey);
          } else {
            collapsedGroupKeys.add(groupKey);
          }
        });

        const heading = document.createElement("summary");
        heading.className = "monday-group-heading";
        heading.textContent = `${bucket.title || "Ungrouped"} (${bucket.items.length})`;

        const itemsList = document.createElement("ul");
        itemsList.className = "monday-group-items";

        for (const issue of bucket.items) {
          const row = document.createElement("li");
          row.className = "monday-group-item";

          const link = document.createElement("a");
          link.className = "monday-group-link";
          link.href = issue.url || MONDAY_WEB_URL;
          link.target = cfg.openInNewTab ? "_blank" : "_self";
          link.rel = "noreferrer";

          link.addEventListener("click", (event) => {
            if (!isEditMode?.()) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            openSettings?.();
          });

          link.textContent = issue.title;
          row.append(link);
          itemsList.append(row);
        }

        details.append(heading, itemsList);
        section.append(details);
        targetList.append(section);
      }
    }

    function getVisibleSnapshots(cfg) {
      const ids = Array.isArray(cfg.boardIds) ? cfg.boardIds : [];
      const byId = new Map(boardSnapshots.map((entry) => [normalizeBoardId(entry?.boardId, 0), entry]));
      const out = [];

      for (const boardId of ids) {
        const snapshot = byId.get(boardId);
        if (snapshot) {
          out.push(snapshot);
        }
      }

      return out;
    }

    function renderList() {
      list.replaceChildren();
      const cfg = resolveConfig();
      list.classList.remove("is-board-cards");
      const visibleSnapshots = getVisibleSnapshots(cfg);
      const multiBoard = cfg.boardIds.length > 1;
      const hasAnyIssues = visibleSnapshots.some(
        (entry) => Array.isArray(entry?.issues) && entry.issues.length > 0
      );
      const hasAllScope = visibleSnapshots.some((entry) => entry?.scopeMode === "all");

      if (!hasAnyIssues) {
        if (multiBoard && hasFetched && hasBoardConfig(cfg) && hasActiveConnection(cfg)) {
          list.classList.add("is-board-cards");
          for (const snapshot of visibleSnapshots) {
            const card = document.createElement("li");
            card.className = "monday-board-card";

            const cardHeader = document.createElement("div");
            cardHeader.className = "monday-board-card-header";
            cardHeader.textContent = `${snapshot.boardName || `Board ${snapshot.boardId}`} (0)`;

            const emptyText = document.createElement("p");
            emptyText.className = "monday-board-card-empty";
            emptyText.textContent =
              snapshot?.scopeMode === "all" ? "No issues in this board." : "No assigned issues in this board.";

            card.append(cardHeader, emptyText);
            list.append(card);
          }
          return;
        }

        const empty = document.createElement("li");
        empty.className = "monday-issue-empty";
        if (loading) {
          empty.textContent = hasAllScope ? "Loading board issues..." : "Loading assigned issues...";
        } else if (!hasConnectorConfig(cfg)) {
          empty.textContent =
            "Set auth connector URL in widget settings to enable Monday connection.";
        } else if (!hasActiveConnection(cfg)) {
          empty.textContent = hasAllScope
            ? "Connect Monday account to load board issues."
            : "Connect Monday account to load assigned issues.";
        } else if (!hasBoardConfig(cfg)) {
          empty.textContent = "Set Board ID(s) in widget settings. Use numeric IDs from /boards/<id>.";
        } else if (errorMessage) {
          empty.textContent = hasAllScope ? "Board issue list is not available." : "Assigned issue list is not available.";
        } else if (!hasFetched) {
          empty.textContent = "Waiting for the next auto refresh or manual refresh.";
        } else {
          empty.textContent = hasAllScope
            ? "No issues found in configured boards."
            : "No issues assigned to you in Owner/People columns.";
        }
        list.append(empty);
        return;
      }

      list.classList.toggle("is-board-cards", multiBoard);

      if (!multiBoard) {
        const first = visibleSnapshots[0];
        const grouped = groupIssuesByGroup(first?.issues || [], first?.boardGroups || []);
        renderGroupedIssues(list, grouped, cfg, `board-${first?.boardId || cfg.boardId}`);
        return;
      }

      for (const snapshot of visibleSnapshots) {
        const boardIssues = Array.isArray(snapshot?.issues) ? snapshot.issues : [];
        const isAllScope = snapshot?.scopeMode === "all";

        const card = document.createElement("li");
        card.className = "monday-board-card";

        const cardHeader = document.createElement("div");
        cardHeader.className = "monday-board-card-header";
        cardHeader.textContent = `${snapshot.boardName || `Board ${snapshot.boardId}`} (${boardIssues.length} ${isAllScope ? "items" : "assigned"})`;

        if (!boardIssues.length) {
          const emptyText = document.createElement("p");
          emptyText.className = "monday-board-card-empty";
          emptyText.textContent = isAllScope
            ? "No issues in this board."
            : "No assigned issues in this board.";
          card.append(cardHeader, emptyText);
          list.append(card);
          continue;
        }

        const grouped = groupIssuesByGroup(boardIssues, snapshot?.boardGroups || []);
        const boardList = document.createElement("ul");
        boardList.className = "monday-board-card-list";
        renderGroupedIssues(boardList, grouped, cfg, `board-${snapshot.boardId}`);

        card.append(cardHeader, boardList);
        list.append(card);
      }
    }

    function renderStatus() {
      const cfg = resolveConfig();
      status.classList.toggle("is-error", Boolean(errorMessage));

      let text = "";
      if (loading) {
        text = "Syncing Monday issues...";
      } else if (errorMessage) {
        text = errorMessage;
      } else if (!hasConnectorConfig(cfg)) {
        text = "Set auth connector URL";
      } else if (!hasActiveConnection(cfg)) {
        text = "Monday not connected";
      } else if (!hasBoardConfig(cfg)) {
        text = `${accountLabel || "Connected"} · Set board ID (from /boards/<id>)`;
      } else if (cfg.boardIds.length > 1) {
        const total = boardSnapshots.reduce((count, entry) => {
          const boardIssues = Array.isArray(entry?.issues) ? entry.issues.length : 0;
          return count + boardIssues;
        }, 0);
        const hasAllScope = boardSnapshots.some((entry) => entry?.scopeMode === "all");
        text = `${cfg.boardIds.length} boards · ${total} ${hasAllScope ? "items" : "assigned"}`;
      } else if (boardSnapshots[0]?.issues?.length) {
        const first = boardSnapshots[0];
        const isAllScope = first?.scopeMode === "all";
        text = isAllScope
          ? `${first.boardName || `Board ${cfg.boardId}`} · all tasks · ${first.issues.length} items`
          : `${first.boardName || `Board ${cfg.boardId}`} · ${first.assigneeName || "me"} · ${first.issues.length} assigned`;
      } else if (hasFetched) {
        const first = boardSnapshots[0];
        const isAllScope = first?.scopeMode === "all";
        text = isAllScope
          ? `${first?.boardName || `Board ${cfg.boardId}`} · all tasks · 0 items`
          : `${first?.boardName || `Board ${cfg.boardId}`} · ${first?.assigneeName || "me"} · 0 assigned`;
      } else {
        text = `${boardSnapshots[0]?.boardName || `Board ${cfg.boardId}`} connected · press Refresh`;
      }

      const nextAutoLabel = formatTimeLabel(nextAutoRunAt);
      if (!loading && nextAutoLabel && hasBoardConfig(cfg) && hasActiveConnection(cfg)) {
        text = `${text} · Next auto ${nextAutoLabel}`;
      }

      status.textContent = text;
    }

    function render() {
      renderStatus();
      renderList();
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      const cfg = resolveConfig();
      if (!hasBoardConfig(cfg) || !hasActiveConnection(cfg)) {
        nextAutoRunAt = null;
        renderStatus();
        return;
      }
      const next = nextAutoSlot(cfg, new Date());
      nextAutoRunAt = next?.runAt || null;
      renderStatus();

      if (!next) {
        return;
      }

      const delayMs = Math.max(1000, next.runAt.getTime() - Date.now());
      timer = setTimeout(() => {
        void loadIssues({ reason: "auto" });
      }, delayMs);
    }

    function persistAutoSlots(config, now, dueIndices) {
      if (!dueIndices.length) {
        return;
      }

      const next = updateDoneSlotsForToday(config, now, dueIndices);
      if (
        next.dayKey === config.autoRefreshDayKey &&
        next.slotsDone === config.autoRefreshSlotsDone
      ) {
        return;
      }

      patchConfig({
        autoRefreshDayKey: next.dayKey,
        autoRefreshSlotsDone: next.slotsDone
      });
    }

    function shouldRunAutoNow() {
      const cfg = resolveConfig();
      if (!hasBoardConfig(cfg) || !hasActiveConnection(cfg) || loading) {
        return false;
      }
      return dueAutoSlotIndices(cfg, new Date()).length > 0;
    }

    async function loadIssues({ reason = "manual" } = {}) {
      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        const cfg = resolveConfig();
        if (!hasConnectorConfig(cfg)) {
          throw new Error("Set auth connector URL first.");
        }
        if (!hasActiveConnection(cfg)) {
          throw new Error("Connect Monday account first.");
        }
        if (!hasBoardConfig(cfg)) {
          throw new Error("Set Board ID(s) first. Use numeric IDs from /boards/<id>.");
        }

        if (reason === "auto") {
          const now = new Date();
          const dueIndices = dueAutoSlotIndices(cfg, now);
          if (!dueIndices.length) {
            return;
          }
          persistAutoSlots(cfg, now, dueIndices);
        }

        const snapshots = [];
        const boardWarnings = [];
        for (let boardIndex = 0; boardIndex < cfg.boardIds.length; boardIndex += 1) {
          const boardId = cfg.boardIds[boardIndex];
          const boardCfg = { ...cfg, boardId };
          const selector = resolveBoardPeopleColumnSelector(cfg, boardIndex);
          const fallbackScopeMode = selector === "*" ? "all" : "assigned";

          try {
            const context = await fetchContext(boardCfg, accessToken);
            const scope = resolveBoardPeopleScope(cfg, boardIndex, context.peopleColumns);
            const statusColumnIds = Array.isArray(context.statusColumnIds)
              ? context.statusColumnIds
              : [];
            const issues =
              scope.mode === "all"
                ? await fetchBoardIssues(boardCfg, accessToken, statusColumnIds)
                : await fetchAssignedIssues(
                    boardCfg,
                    context.meId,
                    scope.columnIds,
                    accessToken,
                    statusColumnIds
                  );

            snapshots.push({
              boardId,
              boardName: context.boardName,
              assigneeName: scope.mode === "all" ? "all tasks" : normalizeText(context.meName, "me"),
              scopeMode: scope.mode,
              boardGroups: Array.isArray(context.boardGroups) ? context.boardGroups : [],
              issues
            });
          } catch (boardError) {
            if (boardError?.code === "auth") {
              throw boardError;
            }

            boardWarnings.push(`${boardId}: ${normalizeErrorMessage(boardError)}`);
            snapshots.push({
              boardId,
              boardName: `Board ${boardId}`,
              assigneeName: fallbackScopeMode === "all" ? "all tasks" : "me",
              scopeMode: fallbackScopeMode,
              boardGroups: [],
              issues: []
            });
          }
        }

        if (requestId !== requestSerial) {
          return;
        }

        boardSnapshots = snapshots;
        hasFetched = true;
        lastSignature = configSignature(cfg);
        persistSnapshot(cfg);

        if (boardWarnings.length) {
          errorMessage =
            boardWarnings.length >= cfg.boardIds.length
              ? boardWarnings[0]
              : `Some boards failed to sync (${boardWarnings.length}/${cfg.boardIds.length}).`;
        }
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }

        if (!boardSnapshots.length) {
          hasFetched = false;
        } else {
          hasFetched = true;
        }
        if (error?.code === "auth") {
          await clearConnectionState({ clearStored: true });
          errorMessage = "Session expired. Connect Monday again.";
        } else {
          errorMessage = normalizeErrorMessage(error);
        }
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
        scheduleRefresh();
      }
    }

    async function toggleConnection() {
      const cfg = resolveConfig();
      if (hasActiveConnection(cfg)) {
        await disconnectAccount();
        return;
      }
      await connectAccount();
    }

    const initialRawCfg = getConfig();
    const initialCfg = resolveConfig();
    applyCachedSnapshotIfPresent(initialRawCfg, initialCfg);
    lastSignature = configSignature(initialCfg);
    render();
    installStorageListener();
    void syncStoredSessionForConfig(initialCfg).finally(() => {
      render();
      if (shouldRunAutoNow()) {
        void loadIssues({ reason: "auto" });
      } else {
        scheduleRefresh();
      }
    });

    return {
      refresh() {
        const cfg = resolveConfig();
        const nextSignature = configSignature(cfg);
        render();

        if (!loading && nextSignature !== lastSignature) {
          lastSignature = nextSignature;

          if (cfg.connectorUrl !== sessionConnectorUrl || !hasActiveConnection(cfg)) {
            void syncStoredSessionForConfig(cfg).finally(() => {
              render();
              if (shouldRunAutoNow()) {
                void loadIssues({ reason: "auto" });
              } else {
                scheduleRefresh();
              }
            });
            return;
          }

          if (hasBoardConfig(cfg) && hasActiveConnection(cfg)) {
            void loadIssues({ reason: "config" });
            return;
          }

          scheduleRefresh();
          return;
        }

        if (!loading && shouldRunAutoNow()) {
          void loadIssues({ reason: "auto" });
          return;
        }

        scheduleRefresh();
      },
      manualRefresh() {
        return loadIssues({ reason: "manual" });
      },
      openMonday() {
        openMondayPage();
      },
      toggleConnection() {
        return toggleConnection();
      },
      isConnected() {
        return hasActiveConnection(resolveConfig());
      },
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
        removeStorageListener();
      }
    };
  }
};
