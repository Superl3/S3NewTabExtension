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

function isDoneGroupTitle(value) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized ? DONE_GROUP_TITLES.has(normalized) : false;
}

function normalizeBoardId(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, Math.floor(num));
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
  const boardId = normalizeBoardId(config?.boardId, 0);
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
    boardId: normalizeBoardId(config?.boardId, 0),
    peopleColumnId: normalizeColumnId(config?.peopleColumnId),
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
    config.boardId,
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
  return config.boardId > 0;
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
    boardGroups
  };
}

function resolvePeopleColumnIds(config, peopleColumns) {
  const configured = normalizeColumnId(config.peopleColumnId);
  if (configured) {
    return [configured];
  }

  const normalizedColumns = Array.isArray(peopleColumns)
    ? peopleColumns
        .map((column) => ({
          id: normalizeText(column?.id),
          title: normalizeText(column?.title).toLowerCase()
        }))
        .filter((column) => column.id)
    : [];

  if (!normalizedColumns.length) {
    throw new Error("No People column detected. Set People column ID in widget settings.");
  }

  const preferred = normalizedColumns.filter((column) => {
    return (
      column.title.includes("owner") ||
      column.title.includes("assignee") ||
      column.title.includes("assigned")
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

function mapAssignedIssues(rawItems, maxItems) {
  const seen = new Set();
  const mapped = [];

  for (const entry of rawItems || []) {
    const id = normalizeText(entry?.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);

    const updatedAt = normalizeText(entry?.updated_at);
    const updatedTs = Date.parse(updatedAt);
    mapped.push({
      id,
      title: normalizeText(entry?.name, "(Untitled issue)"),
      url: normalizeText(entry?.url, MONDAY_WEB_URL),
      groupId: normalizeText(entry?.group?.id),
      groupTitle: normalizeText(entry?.group?.title),
      isSubitem: entry?.isSubitem === true,
      updatedLabel: formatDateLabel(updatedAt),
      updatedTs: Number.isFinite(updatedTs) ? updatedTs : 0
    });
  }

  mapped.sort((a, b) => b.updatedTs - a.updatedTs);
  return mapped.slice(0, maxItems);
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
    isSubitem: entry?.isSubitem === true,
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

function readCachedSnapshot(rawConfig, cfg) {
  const cachedBoardId = normalizeBoardId(rawConfig?.cacheBoardId, 0);
  if (!cachedBoardId || cachedBoardId !== cfg.boardId) {
    return null;
  }

  const cachedIssues = Array.isArray(rawConfig?.cacheIssues)
    ? rawConfig.cacheIssues.map(normalizeCachedIssue).filter(Boolean)
    : [];
  const cacheAt = Math.max(0, Number(rawConfig?.cacheAt) || 0);
  if (!cachedIssues.length && !cacheAt) {
    return null;
  }

  const cachedGroups = Array.isArray(rawConfig?.cacheGroups)
    ? rawConfig.cacheGroups.map(normalizeCachedGroup).filter((group) => group.id || group.title)
    : [];

  return {
    boardName: normalizeText(rawConfig?.cacheBoardName, `Board ${cfg.boardId}`),
    assigneeName: normalizeText(rawConfig?.cacheAssigneeName, "me"),
    issues: cachedIssues
      .slice()
      .sort((a, b) => b.updatedTs - a.updatedTs)
      .slice(0, cfg.maxItems),
    groups: cachedGroups,
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

async function fetchAssignedFromColumn(config, meId, peopleColumnId, accessToken) {
  const fetchLimit = clamp(Math.max(config.maxItems * 4, 80), 1, 300);

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
            subitems {
              id
              name
              url
              updated_at
              group {
                id
                title
              }
              column_values(ids: [${JSON.stringify(peopleColumnId)}]) {
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

  try {
    const data = await mondayFetchGraphql(accessToken, query);
    const board = Array.isArray(data?.boards) ? data.boards[0] : null;
    const parentItems = Array.isArray(board?.items_page?.items) ? board.items_page.items : [];
    const assignedSubitems = mapAssignedSubitems(parentItems, meId);
    return [...parentItems, ...assignedSubitems];
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

async function fetchAssignedIssues(config, meId, peopleColumnIds, accessToken) {
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
      const fromColumn = await fetchAssignedFromColumn(config, meId, columnId, accessToken);
      if (Array.isArray(fromColumn) && fromColumn.length) {
        allItems.push(...fromColumn);
      }
    } catch (error) {
      if (!firstColumnError) {
        firstColumnError = error;
      }
    }
  }

  try {
    const subitems = await fetchAssignedSubitemsAcrossBoard(config, meId, columnIds, accessToken);
    if (Array.isArray(subitems) && subitems.length) {
      allItems.push(...subitems);
    }
  } catch {
  }

  if (!allItems.length && firstColumnError) {
    throw firstColumnError;
  }

  return mapAssignedIssues(allItems, config.maxItems);
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
    boardId: 0,
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
    cacheIssues: []
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
      key: "accessToken",
      label: "Access token (optional)",
      type: "password",
      placeholder: "Monday access token",
      helpText: "If set, Connect uses this token directly and skips connector popup/relay."
    },
    {
      key: "boardId",
      label: "Board ID",
      type: "number",
      min: 1,
      step: 1,
      helpText: "Use the numeric board id from your board URL, for example /boards/123456789."
    },
    {
      key: "peopleColumnId",
      label: "People column ID",
      type: "text",
      placeholder: "Optional, ex: person",
      helpText: "Optional. If empty, the first People column in the board is used."
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
  create({ container, getConfig, patchConfig, isEditMode, openSettings }) {
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
    let boardName = "";
    let assigneeName = "";
    let boardGroups = [];
    let connected = false;
    let accountLabel = "";
    let accessToken = "";
    let sessionConnectorUrl = "";
    let issues = [];
    let hasFetched = false;
    let nextAutoRunAt = null;
    let lastSignature = "";
    let requestSerial = 0;
    let timer = null;
    let sessionSyncSerial = 0;
    let storageListener = null;

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function openMondayPage() {
      const cfg = normalizedConfig(getConfig());
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

      boardName = cached.boardName;
      assigneeName = cached.assigneeName;
      boardGroups = cached.groups;
      issues = cached.issues;
      hasFetched = true;
    }

    function persistSnapshot(cfg) {
      const cacheIssues = issues.map((issue) => ({
        id: normalizeText(issue?.id),
        title: normalizeText(issue?.title),
        url: normalizeText(issue?.url),
        groupId: normalizeText(issue?.groupId),
        groupTitle: normalizeText(issue?.groupTitle),
        isSubitem: issue?.isSubitem === true,
        updatedLabel: normalizeText(issue?.updatedLabel),
        updatedTs: Number(issue?.updatedTs) || 0
      }));

      const cacheGroups = boardGroups.map((group) => ({
        id: normalizeText(group?.id),
        title: normalizeText(group?.title)
      }));

      const currentCfg = getConfig();
      const currentCacheIssues = Array.isArray(currentCfg?.cacheIssues)
        ? currentCfg.cacheIssues.map((issue) => ({
            id: normalizeText(issue?.id),
            title: normalizeText(issue?.title),
            url: normalizeText(issue?.url),
            groupId: normalizeText(issue?.groupId),
            groupTitle: normalizeText(issue?.groupTitle),
            isSubitem: issue?.isSubitem === true,
            updatedLabel: normalizeText(issue?.updatedLabel),
            updatedTs: Number(issue?.updatedTs) || 0
          }))
        : [];
      const currentCacheGroups = Array.isArray(currentCfg?.cacheGroups)
        ? currentCfg.cacheGroups.map((group) => ({
            id: normalizeText(group?.id),
            title: normalizeText(group?.title)
          }))
        : [];

      const unchanged =
        normalizeBoardId(currentCfg?.cacheBoardId, 0) === cfg.boardId &&
        normalizeText(currentCfg?.cacheBoardName) === normalizeText(boardName) &&
        normalizeText(currentCfg?.cacheAssigneeName) === normalizeText(assigneeName) &&
        JSON.stringify(currentCacheGroups) === JSON.stringify(cacheGroups) &&
        JSON.stringify(currentCacheIssues) === JSON.stringify(cacheIssues);

      if (unchanged) {
        return;
      }

      patchConfig({
        cacheBoardId: cfg.boardId,
        cacheAt: Date.now(),
        cacheBoardName: boardName,
        cacheAssigneeName: assigneeName,
        cacheGroups,
        cacheIssues
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

        const cfg = normalizedConfig(getConfig());
        if (!hasConnectorConfig(cfg)) {
          return;
        }

        void syncStoredSessionForConfig(cfg).finally(() => {
          render();
          scheduleRefresh();
          if (!loading && hasBoardConfig(cfg) && hasActiveConnection(cfg)) {
            void loadIssues({ reason: "auth-sync" });
          }
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
      const cfg = normalizedConfig(getConfig());
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

      if (connected && hasBoardConfig(normalizedConfig(getConfig()))) {
        void loadIssues({ reason: "manual" });
      }
    }

    async function disconnectAccount() {
      const cfg = normalizedConfig(getConfig());
      if (normalizeText(cfg.accessToken)) {
        errorMessage = "Remove Access token in settings to disconnect.";
        render();
        return;
      }

      loading = true;
      render();
      await clearConnectionState({ clearStored: true });
      errorMessage = "";
      boardName = "";
      assigneeName = "";
      boardGroups = [];
      issues = [];
      hasFetched = false;
      nextAutoRunAt = null;
      loading = false;
      render();
      scheduleRefresh();
    }

    function renderList() {
      list.replaceChildren();

      const cfg = normalizedConfig(getConfig());
      if (!issues.length) {
        const empty = document.createElement("li");
        empty.className = "monday-issue-empty";
        if (loading) {
          empty.textContent = "Loading assigned issues...";
        } else if (!hasConnectorConfig(cfg)) {
          empty.textContent =
            "Set auth connector URL in widget settings to enable Monday connection.";
        } else if (!hasActiveConnection(cfg)) {
          empty.textContent = "Connect Monday account to load assigned issues.";
        } else if (!hasBoardConfig(cfg)) {
          empty.textContent = "Set Board ID in widget settings. Use the numeric ID from /boards/<id>.";
        } else if (errorMessage) {
          empty.textContent = "Assigned issue list is not available.";
        } else if (!hasFetched) {
          empty.textContent = "Waiting for the next auto refresh or manual refresh.";
        } else {
          empty.textContent = "No issues assigned to you in Owner/People columns.";
        }
        list.append(empty);
        return;
      }

      const grouped = groupIssuesByGroup(issues, boardGroups);
      for (const bucket of grouped) {
        if (isDoneGroupTitle(bucket.title)) {
          continue;
        }
        const heading = document.createElement("li");
        heading.className = "monday-group-heading";
        heading.textContent = bucket.title || "Ungrouped";
        list.append(heading);

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

          const prefix = issue.isSubitem ? "- [Sub] " : "- ";
          link.textContent = `${prefix}${issue.title}`;

          row.append(link);
          list.append(row);
        }
      }
    }

    function renderStatus() {
      const cfg = normalizedConfig(getConfig());
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
      } else if (issues.length) {
        text = `${boardName || `Board ${cfg.boardId}`} · ${assigneeName || "me"} · ${issues.length} assigned`;
      } else if (hasFetched) {
        text = `${boardName || `Board ${cfg.boardId}`} · ${assigneeName || "me"} · 0 assigned`;
      } else {
        text = `${boardName || `Board ${cfg.boardId}`} connected · press Refresh`;
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
      const cfg = normalizedConfig(getConfig());
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
      const cfg = normalizedConfig(getConfig());
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
        const cfg = normalizedConfig(getConfig());
        if (!hasConnectorConfig(cfg)) {
          throw new Error("Set auth connector URL first.");
        }
        if (!hasActiveConnection(cfg)) {
          await syncStoredSessionForConfig(cfg);
        }
        if (!hasActiveConnection(cfg)) {
          throw new Error("Connect Monday account first.");
        }
        if (!hasBoardConfig(cfg)) {
          throw new Error("Set Board ID first. Use the numeric ID from /boards/<id>.");
        }

        if (reason === "auto") {
          const now = new Date();
          const dueIndices = dueAutoSlotIndices(cfg, now);
          if (!dueIndices.length) {
            return;
          }
          persistAutoSlots(cfg, now, dueIndices);
        }

        const context = await fetchContext(cfg, accessToken);
        const peopleColumnIds = resolvePeopleColumnIds(cfg, context.peopleColumns);
        const assigned = await fetchAssignedIssues(cfg, context.meId, peopleColumnIds, accessToken);

        if (requestId !== requestSerial) {
          return;
        }

        boardName = context.boardName;
        assigneeName = normalizeText(context.meName, "me");
        boardGroups = Array.isArray(context.boardGroups) ? context.boardGroups : [];
        issues = assigned;
        hasFetched = true;
        lastSignature = configSignature(cfg);
        persistSnapshot(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }

        if (!issues.length) {
          boardGroups = [];
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
      const cfg = normalizedConfig(getConfig());
      if (hasActiveConnection(cfg)) {
        await disconnectAccount();
        return;
      }
      await connectAccount();
    }

    const initialRawCfg = getConfig();
    const initialCfg = normalizedConfig(initialRawCfg);
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
        const cfg = normalizedConfig(getConfig());
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
        return hasActiveConnection(normalizedConfig(getConfig()));
      },
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
        removeStorageListener();
      }
    };
  }
};
