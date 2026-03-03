const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_WEB_URL = "https://monday.com/";
const MONDAY_AUTH_STORAGE_KEY = "s3newtab-monday-auth-session-v1";
const LOCAL_AUTH_CONNECTOR_URL = "http://localhost:8787/api/auth/start";
const WEEKDAY_AUTO_SLOTS_MINUTES = [9 * 60, 13 * 60];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeBoardId(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, Math.floor(num));
}

function normalizeColumnSelector(value, fallback = "") {
  return normalizeText(value, fallback).slice(0, 120);
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

function hasStorageChangedForMondayAuth(changes) {
  return (
    changes &&
    typeof changes === "object" &&
    Object.prototype.hasOwnProperty.call(changes, MONDAY_AUTH_STORAGE_KEY)
  );
}

function toLocalDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function parseAutoSlotsDone(value) {
  const text = normalizeText(value);
  if (!text) {
    return new Set();
  }

  const out = new Set();
  for (const part of text.split(",")) {
    const num = Number(part);
    if (
      Number.isInteger(num) &&
      num >= 0 &&
      num < WEEKDAY_AUTO_SLOTS_MINUTES.length
    ) {
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
  if (!isWeekday(now)) {
    return [];
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const dayKey = toLocalDayKey(now);
  const doneSet =
    config.autoRefreshDayKey === dayKey
      ? parseAutoSlotsDone(config.autoRefreshSlotsDone)
      : new Set();

  const due = [];
  for (let index = 0; index < WEEKDAY_AUTO_SLOTS_MINUTES.length; index += 1) {
    if (doneSet.has(index)) {
      continue;
    }
    if (WEEKDAY_AUTO_SLOTS_MINUTES[index] <= nowMinutes) {
      due.push(index);
    }
  }
  return due;
}

function nextWeekdayStart(fromDate) {
  const next = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate() + 1,
    0,
    0,
    0,
    0
  );

  while (!isWeekday(next)) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function nextAutoSlot(config, now = new Date()) {
  if (isWeekday(now)) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const dayKey = toLocalDayKey(now);
    const doneSet =
      config.autoRefreshDayKey === dayKey
        ? parseAutoSlotsDone(config.autoRefreshSlotsDone)
        : new Set();

    for (let index = 0; index < WEEKDAY_AUTO_SLOTS_MINUTES.length; index += 1) {
      if (doneSet.has(index)) {
        continue;
      }
      if (WEEKDAY_AUTO_SLOTS_MINUTES[index] > nowMinutes) {
        return {
          slotIndex: index,
          runAt: dateAtMinute(now, WEEKDAY_AUTO_SLOTS_MINUTES[index])
        };
      }
    }
  }

  const nextDay = nextWeekdayStart(now);
  return {
    slotIndex: 0,
    runAt: dateAtMinute(nextDay, WEEKDAY_AUTO_SLOTS_MINUTES[0])
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

function normalizedConfig(config) {
  return {
    connectorUrl: normalizeConnectorUrl(config?.connectorUrl),
    accessToken: normalizeText(config?.accessToken),
    boardId: normalizeBoardId(config?.boardId, 0),
    meetingNoteColumnId: normalizeColumnSelector(
      config?.meetingNoteColumnId,
      normalizeColumnSelector(config?.meetingNodeColumnId)
    ),
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
    config.meetingNoteColumnId,
    config.openInNewTab ? 1 : 0
  ].join("|");
}

function hasConnectorConfig(config) {
  return Boolean(config.connectorUrl) || Boolean(config.accessToken);
}

function hasBoardConfig(config) {
  return config.boardId > 0;
}

function hasMeetingNoteColumnConfig(config) {
  return Boolean(config.meetingNoteColumnId);
}

function normalizeSelectorKey(value) {
  return normalizeText(value)
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeCachedLatest(entry) {
  const id = normalizeText(entry?.id);
  if (!id) {
    return null;
  }

  return {
    id,
    title: normalizeText(entry?.title, "(Untitled item)"),
    itemUrl: normalizeText(entry?.itemUrl),
    updatedLabel: normalizeText(entry?.updatedLabel),
    note: normalizeText(entry?.note)
  };
}

function readCachedSnapshot(rawConfig, cfg) {
  const cachedBoardId = normalizeBoardId(rawConfig?.cacheBoardId, 0);
  if (!cachedBoardId || cachedBoardId !== cfg.boardId) {
    return null;
  }

  const cachedSelectorKey = normalizeSelectorKey(rawConfig?.cacheMeetingNoteColumnId);
  if (!cachedSelectorKey || cachedSelectorKey !== normalizeSelectorKey(cfg.meetingNoteColumnId)) {
    return null;
  }

  const cachedLatest = normalizeCachedLatest(rawConfig?.cacheLatest);
  const cacheAt = Math.max(0, Number(rawConfig?.cacheAt) || 0);
  if (!cachedLatest && !cacheAt) {
    return null;
  }

  return {
    boardName: normalizeText(rawConfig?.cacheBoardName, `Board ${cfg.boardId}`),
    latest: cachedLatest,
    cacheAt
  };
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

function resolveBoardUrl(config) {
  if (hasBoardConfig(config)) {
    return `${MONDAY_WEB_URL}boards/${config.boardId}`;
  }
  return MONDAY_WEB_URL;
}

function resolveItemUrl(config, latestItemUrl) {
  const itemUrl = normalizeText(latestItemUrl);
  if (itemUrl) {
    return itemUrl;
  }
  return resolveBoardUrl(config);
}

function normalizeLineBreaks(value) {
  return normalizeText(value).replace(/\r\n?/g, "\n");
}

function pickSingleNote(value) {
  const normalized = normalizeLineBreaks(value);
  if (!normalized) {
    return "";
  }

  const lines = normalized
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean);

  if (lines.length) {
    return lines[0].slice(0, 600);
  }

  return normalized.slice(0, 600);
}

function extractColumnText(columnValue) {
  const longText = normalizeText(columnValue?.text);
  if (longText) {
    return longText;
  }

  const mirrorText = normalizeText(columnValue?.display_value);
  if (mirrorText) {
    return mirrorText;
  }

  const boardRelationDisplay = normalizeText(columnValue?.display_value);
  if (boardRelationDisplay) {
    return boardRelationDisplay;
  }

  return normalizeText(columnValue?.text);
}

function extractMeetingNote(item) {
  const columns = Array.isArray(item?.column_values) ? item.column_values : [];
  if (!columns.length) {
    return "";
  }

  for (const column of columns) {
    const value = extractColumnText(column);
    const oneNote = pickSingleNote(value);
    if (oneNote) {
      return oneNote;
    }
  }

  return "";
}

function itemTimestamp(item) {
  const updatedAt = Date.parse(normalizeText(item?.updated_at));
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }
  const createdAt = Date.parse(normalizeText(item?.created_at));
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }
  return 0;
}

function pickLatestItem(items) {
  const normalized = Array.isArray(items) ? [...items] : [];
  if (!normalized.length) {
    return null;
  }
  normalized.sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
  return normalized[0] || null;
}

function normalizeBoardColumn(column) {
  return {
    id: normalizeText(column?.id),
    title: normalizeText(column?.title)
  };
}

function parseBoardColumns(rawColumns) {
  const list = Array.isArray(rawColumns) ? rawColumns : [];
  return list
    .map(normalizeBoardColumn)
    .filter((column) => column.id || column.title);
}

function resolveMeetingNoteColumnId(columns, selector) {
  const normalizedSelector = normalizeText(selector);
  if (!normalizedSelector) {
    return "";
  }

  const normalizedColumns = Array.isArray(columns) ? columns : [];
  const exactId = normalizedColumns.find((column) => normalizeText(column?.id) === normalizedSelector);
  if (exactId?.id) {
    return normalizeText(exactId.id);
  }

  const selectorKey = normalizeSelectorKey(normalizedSelector);
  if (!selectorKey) {
    return "";
  }

  const exactTitle = normalizedColumns.find((column) => normalizeSelectorKey(column?.title) === selectorKey);
  if (exactTitle?.id) {
    return normalizeText(exactTitle.id);
  }

  const compactSelectorKey = selectorKey.replace(/\s+/g, "");
  const looseTitle = normalizedColumns.find(
    (column) => normalizeSelectorKey(column?.title).replace(/\s+/g, "") === compactSelectorKey
  );
  if (looseTitle?.id) {
    return normalizeText(looseTitle.id);
  }

  return "";
}

function buildBoardContextQuery(config) {
  return `
    query {
      boards(ids: [${config.boardId}]) {
        id
        name
        columns {
          id
          title
        }
      }
    }
  `;
}

function parseBoardContext(data) {
  const board = Array.isArray(data?.boards) ? data.boards[0] : null;
  if (!board) {
    return null;
  }

  return {
    boardName: normalizeText(board?.name),
    columns: parseBoardColumns(board?.columns)
  };
}

async function fetchBoardContext(config, accessToken) {
  const data = await mondayFetchGraphql(accessToken, buildBoardContextQuery(config));
  const context = parseBoardContext(data);
  if (!context) {
    throw new Error("Board not found or access denied for this account.");
  }
  return context;
}

function buildOrderedLatestQuery(config, columnId) {
  const columnIdLiteral = JSON.stringify(columnId);
  return `
    query {
      boards(ids: [${config.boardId}]) {
        id
        name
        items_page(
          limit: 1
          query_params: {
            order_by: [{ column_id: "__last_updated__", direction: desc }]
          }
        ) {
          items {
            id
            name
            url
            created_at
            updated_at
            column_values(ids: [${columnIdLiteral}]) {
              id
              type
              text
              ... on LongTextValue {
                text
              }
              ... on MirrorValue {
                display_value
              }
              ... on BoardRelationValue {
                display_value
              }
            }
          }
        }
      }
    }
  `;
}

function buildFallbackLatestQuery(config, columnId) {
  const columnIdLiteral = JSON.stringify(columnId);
  return `
    query {
      boards(ids: [${config.boardId}]) {
        id
        name
        items_page(limit: 40) {
          items {
            id
            name
            url
            created_at
            updated_at
            column_values(ids: [${columnIdLiteral}]) {
              id
              type
              text
              ... on LongTextValue {
                text
              }
              ... on MirrorValue {
                display_value
              }
              ... on BoardRelationValue {
                display_value
              }
            }
          }
        }
      }
    }
  `;
}

function parseQueryData(data) {
  const board = Array.isArray(data?.boards) ? data.boards[0] : null;
  const items = Array.isArray(board?.items_page?.items) ? board.items_page.items : [];
  return {
    boardName: normalizeText(board?.name),
    items
  };
}

function canFallbackWithoutOrder(error) {
  const message = normalizeErrorMessage(error);
  return (
    message.includes("Cannot query field \"items_page\"") ||
    message.includes("Unknown argument \"query_params\"") ||
    message.includes("Unknown argument \"order_by\"")
  );
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

async function fetchLatestMeetingNote(config, accessToken) {
  const boardContext = await fetchBoardContext(config, accessToken);
  const resolvedColumnId = resolveMeetingNoteColumnId(
    boardContext.columns,
    config.meetingNoteColumnId
  );
  if (!resolvedColumnId) {
    throw new Error(
      `Meeting note column \"${config.meetingNoteColumnId}\" not found on this board.`
    );
  }

  let parsed;
  try {
    const orderedData = await mondayFetchGraphql(
      accessToken,
      buildOrderedLatestQuery(config, resolvedColumnId)
    );
    parsed = parseQueryData(orderedData);
  } catch (error) {
    if (!canFallbackWithoutOrder(error)) {
      throw error;
    }
    const fallbackData = await mondayFetchGraphql(
      accessToken,
      buildFallbackLatestQuery(config, resolvedColumnId)
    );
    parsed = parseQueryData(fallbackData);
  }

  const latestItem = pickLatestItem(parsed?.items);
  if (!latestItem) {
    return {
      boardName: normalizeText(parsed?.boardName, `Board ${config.boardId}`),
      latest: null
    };
  }

  return {
    boardName: normalizeText(parsed?.boardName, `Board ${config.boardId}`),
    latest: {
      id: normalizeText(latestItem?.id),
      title: normalizeText(latestItem?.name, "(Untitled item)"),
      itemUrl: normalizeText(latestItem?.url),
      updatedLabel: formatDateLabel(normalizeText(latestItem?.updated_at, latestItem?.created_at)),
      note: extractMeetingNote(latestItem)
    }
  };
}

export const mondayMeetingNoteWidget = {
  type: "mondayMeetingNote",
  title: "Monday Meeting Note",
  defaultConfig: {
    connectorUrl: LOCAL_AUTH_CONNECTOR_URL,
    accessToken: "",
    boardId: 0,
    meetingNoteColumnId: "",
    openInNewTab: true,
    autoRefreshDayKey: "",
    autoRefreshSlotsDone: "",
    cacheBoardId: 0,
    cacheMeetingNoteColumnId: "",
    cacheAt: 0,
    cacheBoardName: "",
    cacheLatest: null
  },
  defaultLayout: {
    x: 1100,
    y: 140,
    w: 320,
    h: 360
  },
  defaultGridSize: {
    w: 1,
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
      key: "meetingNoteColumnId",
      label: "Meeting note column (ID or name)",
      type: "text",
      placeholder: "Example: 미팅 노트 or long_text_mks2ab",
      helpText: "You can enter column ID or exact column title (for example, 미팅 노트)."
    },
    { key: "openInNewTab", label: "Open links in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, patchConfig, isEditMode, openSettings }) {
    container.classList.add("monday-meeting-widget");

    const shell = document.createElement("div");
    shell.className = "monday-meeting-widget-shell";

    const panel = document.createElement("div");
    panel.className = "monday-meeting-panel";

    const status = document.createElement("p");
    status.className = "monday-meeting-status";

    shell.append(panel, status);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let boardName = "";
    let latest = null;
    let hasFetched = false;
    let connected = false;
    let accountLabel = "";
    let accessToken = "";
    let sessionConnectorUrl = "";
    let sessionSyncSerial = 0;
    let requestSerial = 0;
    let lastSignature = "";
    let nextAutoRunAt = null;
    let timer = null;
    let storageListener = null;

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
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

    function clearSnapshotState() {
      boardName = "";
      latest = null;
      hasFetched = false;
    }

    function applyCachedSnapshotIfPresent(rawConfig, cfg) {
      const cached = readCachedSnapshot(rawConfig, cfg);
      if (!cached) {
        return false;
      }

      boardName = cached.boardName;
      latest = cached.latest;
      hasFetched = Boolean(cached.latest);
      return true;
    }

    function persistSnapshot(cfg) {
      const cacheLatest = latest
        ? {
            id: normalizeText(latest?.id),
            title: normalizeText(latest?.title, "(Untitled item)"),
            itemUrl: normalizeText(latest?.itemUrl),
            updatedLabel: normalizeText(latest?.updatedLabel),
            note: normalizeText(latest?.note)
          }
        : null;

      const currentCfg = getConfig();
      const currentLatest = normalizeCachedLatest(currentCfg?.cacheLatest);
      const unchanged =
        normalizeBoardId(currentCfg?.cacheBoardId, 0) === cfg.boardId &&
        normalizeSelectorKey(currentCfg?.cacheMeetingNoteColumnId) ===
          normalizeSelectorKey(cfg.meetingNoteColumnId) &&
        normalizeText(currentCfg?.cacheBoardName) === normalizeText(boardName) &&
        JSON.stringify(currentLatest) === JSON.stringify(cacheLatest);

      if (unchanged) {
        return;
      }

      patchConfig({
        cacheBoardId: cfg.boardId,
        cacheMeetingNoteColumnId: normalizeText(cfg.meetingNoteColumnId),
        cacheAt: Date.now(),
        cacheBoardName: normalizeText(boardName),
        cacheLatest
      });
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
      if (
        loading ||
        !hasBoardConfig(cfg) ||
        !hasMeetingNoteColumnConfig(cfg) ||
        !hasActiveConnection(cfg)
      ) {
        return false;
      }
      return dueAutoSlotIndices(cfg, new Date()).length > 0;
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      const cfg = normalizedConfig(getConfig());
      if (
        !hasBoardConfig(cfg) ||
        !hasMeetingNoteColumnConfig(cfg) ||
        !hasActiveConnection(cfg)
      ) {
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
        void loadLatest({ reason: "auto" });
      }, delayMs);
    }

    function renderStatus() {
      const cfg = normalizedConfig(getConfig());
      status.classList.toggle("is-error", Boolean(errorMessage));

      let text = "";
      if (loading) {
        text = "Syncing Monday meeting note...";
      } else if (errorMessage) {
        text = errorMessage;
      } else if (!hasConnectorConfig(cfg)) {
        text = "Set auth connector URL";
      } else if (!hasActiveConnection(cfg)) {
        text = "Monday not connected";
      } else if (!hasBoardConfig(cfg)) {
        text = `${accountLabel || "Connected"} · Set board ID (from /boards/<id>)`;
      } else if (!hasMeetingNoteColumnConfig(cfg)) {
        text = `${boardName || `Board ${cfg.boardId}`} · Set meeting note column (ID or name)`;
      } else if (latest) {
        text = `${boardName || `Board ${cfg.boardId}`} · Latest item`;
      } else if (hasFetched) {
        text = `${boardName || `Board ${cfg.boardId}`} · No items`;
      } else {
        text = `${boardName || `Board ${cfg.boardId}`} connected · press Refresh`;
      }

      const nextAutoLabel = formatTimeLabel(nextAutoRunAt);
      if (!loading && nextAutoLabel && hasBoardConfig(cfg) && hasMeetingNoteColumnConfig(cfg) && hasActiveConnection(cfg)) {
        text = `${text} · Next auto ${nextAutoLabel}`;
      }

      status.textContent = text;
    }

    function makeEmptyMessage(text) {
      const empty = document.createElement("p");
      empty.className = "monday-meeting-empty";
      empty.textContent = text;
      return empty;
    }

    function renderPanel() {
      panel.replaceChildren();
      const cfg = normalizedConfig(getConfig());

      if (!latest) {
        if (loading) {
          panel.append(makeEmptyMessage("Loading latest meeting note..."));
        } else if (!hasConnectorConfig(cfg)) {
          panel.append(makeEmptyMessage("Set auth connector URL in widget settings to enable Monday connection."));
        } else if (!hasActiveConnection(cfg)) {
          panel.append(makeEmptyMessage("Connect Monday account to load latest meeting note."));
        } else if (!hasBoardConfig(cfg)) {
          panel.append(makeEmptyMessage("Set Board ID in widget settings. Use the numeric ID from /boards/<id>."));
        } else if (!hasMeetingNoteColumnConfig(cfg)) {
          panel.append(makeEmptyMessage("Set Meeting note column (ID or name) in widget settings."));
        } else if (errorMessage) {
          panel.append(makeEmptyMessage("Meeting note is not available."));
        } else {
          panel.append(makeEmptyMessage("No latest item found for this board."));
        }
        return;
      }

      const link = document.createElement("a");
      link.className = "monday-meeting-link";
      link.href = resolveItemUrl(cfg, latest.itemUrl);
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

      const heading = document.createElement("div");
      heading.className = "monday-meeting-top";

      const title = document.createElement("strong");
      title.className = "monday-meeting-title";
      title.textContent = latest.title || "(Untitled item)";

      const updated = document.createElement("span");
      updated.className = "monday-meeting-updated";
      updated.textContent = latest.updatedLabel || "";

      const note = document.createElement("p");
      note.className = "monday-meeting-note";
      note.textContent = latest.note || "(No meeting note found in this column.)";

      heading.append(title, updated);
      link.append(heading, note);
      panel.append(link);
    }

    function render() {
      renderStatus();
      renderPanel();
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
          if (result.state && result.state !== state) {
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

      if (connected && shouldRunAutoNow()) {
        void loadLatest({ reason: "auto" });
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
      clearSnapshotState();
      nextAutoRunAt = null;
      clearRefreshTimer();
      loading = false;
      render();
    }

    async function loadLatest({ reason = "manual" } = {}) {
      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        const cfg = normalizedConfig(getConfig());
        if (!hasConnectorConfig(cfg)) {
          throw new Error("Set auth connector URL first.");
        }
        if (!hasBoardConfig(cfg)) {
          throw new Error("Set Board ID first. Use the numeric ID from /boards/<id>.");
        }
        if (!hasMeetingNoteColumnConfig(cfg)) {
          throw new Error("Set Meeting note column (ID or name) first.");
        }

        if (reason === "auto") {
          const now = new Date();
          const dueIndices = dueAutoSlotIndices(cfg, now);
          if (!dueIndices.length) {
            return;
          }
          persistAutoSlots(cfg, now, dueIndices);
        }

        if (!hasActiveConnection(cfg)) {
          await syncStoredSessionForConfig(cfg);
        }
        if (!hasActiveConnection(cfg)) {
          throw new Error("Connect Monday account first.");
        }

        const result = await fetchLatestMeetingNote(cfg, accessToken);
        if (requestId !== requestSerial) {
          return;
        }

        boardName = result.boardName;
        latest = result.latest;
        hasFetched = true;
        lastSignature = configSignature(cfg);

        const now = new Date();
        const dueAfterFetch = dueAutoSlotIndices(cfg, now);
        if (dueAfterFetch.length) {
          persistAutoSlots(cfg, now, dueAfterFetch);
        }

        persistSnapshot(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }
        if (error?.code === "auth") {
          await clearConnectionState({ clearStored: true });
          errorMessage = "Session expired. Connect Monday again.";
        } else {
          errorMessage = normalizeErrorMessage(error);
        }
        if (!latest) {
          hasFetched = false;
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

    function installStorageListener() {
      if (storageListener || !chrome?.storage?.onChanged?.addListener) {
        return;
      }

      storageListener = (changes, areaName) => {
        if (areaName !== "local" || !hasStorageChangedForMondayAuth(changes)) {
          return;
        }

        const cfg = normalizedConfig(getConfig());
        if (!hasConnectorConfig(cfg)) {
          return;
        }

        void syncStoredSessionForConfig(cfg).finally(() => {
          render();
          if (!loading && shouldRunAutoNow()) {
            void loadLatest({ reason: "auto" });
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

    function openMondayPage() {
      const cfg = normalizedConfig(getConfig());
      const href = resolveItemUrl(cfg, latest?.itemUrl);
      const target = cfg.openInNewTab ? "_blank" : "_self";
      if (target === "_blank") {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
    }

    const initialRawCfg = getConfig();
    const initialCfg = normalizedConfig(initialRawCfg);
    if (!applyCachedSnapshotIfPresent(initialRawCfg, initialCfg)) {
      clearSnapshotState();
    }
    lastSignature = configSignature(initialCfg);
    render();
    installStorageListener();
    void syncStoredSessionForConfig(initialCfg).finally(() => {
      render();
      if (shouldRunAutoNow()) {
        void loadLatest({ reason: "auto" });
        return;
      }
      scheduleRefresh();
    });

    return {
      refresh() {
        const cfg = normalizedConfig(getConfig());
        const nextSignature = configSignature(cfg);
        render();

        if (loading) {
          return;
        }

        if (nextSignature !== lastSignature) {
          lastSignature = nextSignature;

          if (!applyCachedSnapshotIfPresent(getConfig(), cfg)) {
            clearSnapshotState();
          }

          if (cfg.connectorUrl !== sessionConnectorUrl || !hasActiveConnection(cfg)) {
            void syncStoredSessionForConfig(cfg).finally(() => {
              render();
              if (shouldRunAutoNow()) {
                void loadLatest({ reason: "auto" });
                return;
              }
              scheduleRefresh();
            });
            return;
          }

          if (shouldRunAutoNow()) {
            void loadLatest({ reason: "auto" });
            return;
          }

          scheduleRefresh();
          return;
        }

        if (shouldRunAutoNow()) {
          void loadLatest({ reason: "auto" });
          return;
        }

        scheduleRefresh();
      },
      manualRefresh() {
        return loadLatest({ reason: "manual" });
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
