import { arrayOrEmpty } from "../core/utils/array.js";
import { normalizeErrorMessage } from "../core/utils/error.js";
import { parseJsonOrNull } from "../core/utils/json.js";
import { clamp } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import {
  LOCAL_AUTH_CONNECTOR_URL,
  normalizeLocalAuthConnectorUrl as normalizeConnectorUrl
} from "./shared/authConnector.js";
import {
  dateAtMinute,
  dueAutoRefreshSlotIndices,
  nextAutoRefreshSlot,
  updateAutoRefreshSlotsDoneForToday
} from "./shared/autoRefreshSlots.js";
import { formatLocalDateTimeLabel as formatDateLabel } from "./shared/dateLabels.js";
import {
  createAuthSessionStorage,
  createStoredAuthSessionForConnectorResult,
  hasActiveAuthConnection,
  hasAuthSessionStorageChange,
  loadActiveAuthSessionForConfig
} from "./shared/authSessionStorage.js";
import {
  createChromeStorageChangeSubscription,
  getChromeIdentity,
  getChromeStorageLocal
} from "./shared/chromeApi.js";
import {
  areMondayCachedBoardsEqual as areCachedBoardsEqual,
  hasMondayBoardConfig as hasBoardConfig,
  hasMondayConnectorConfig as hasConnectorConfig,
  MONDAY_AUTH_STORAGE_KEY,
  normalizeBoardId,
  normalizeBoardIds,
  normalizeCachedMondayBoardBase,
  normalizeColumnSelector,
  normalizeColumnSelectorList as normalizeSharedColumnSelectorList,
  normalizeMondayCachedBoards,
  normalizeMondayCacheTimestamp,
  parseColumnSelectorList
} from "./shared/mondayConfig.js";
import {
  connectWithMondayAuthConnector,
  formatMondayAuthConnectorErrorMessage,
  MONDAY_CONNECT_ENABLE_MESSAGE,
  MONDAY_CONNECT_REQUIRED_MESSAGE,
  MONDAY_DISCONNECT_CONFIGURED_TOKEN_MESSAGE,
  MONDAY_SYNC_CONNECT_REQUIRED_MESSAGE
} from "./shared/mondayAuth.js";
import {
  mondayFetchGraphql,
  MONDAY_WEB_URL,
  parseUrlSafely,
  resolveMondaySiteUrl
} from "./shared/mondayClient.js";

const WEEKDAY_AUTO_SLOTS_MINUTES = [9 * 60, 13 * 60];
const DEFAULT_MEETING_NOTE_COLUMN_SELECTOR = "미팅 노트, monday Doc";
const FALLBACK_LATEST_SCAN_LIMIT = 300;

function normalizeColumnSelectorList(value, fallback = DEFAULT_MEETING_NOTE_COLUMN_SELECTOR) {
  return normalizeSharedColumnSelectorList(value, {
    fallback,
    maxLength: 120
  });
}

function parseSelectorList(value) {
  return parseColumnSelectorList(value, { maxLength: 120 });
}

const authSessionStorage = createAuthSessionStorage({
  storageKey: MONDAY_AUTH_STORAGE_KEY,
  getStorageArea: getChromeStorageLocal,
  normalizeConnectorUrl
});

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function dueAutoSlotIndices(config, now = new Date()) {
  if (!isWeekday(now)) {
    return [];
  }

  return dueAutoRefreshSlotIndices(config, WEEKDAY_AUTO_SLOTS_MINUTES, now);
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
    return nextAutoRefreshSlot(config, WEEKDAY_AUTO_SLOTS_MINUTES, now, nextWeekdayStart(now));
  }

  const nextDay = nextWeekdayStart(now);
  return {
    slotIndex: 0,
    runAt: dateAtMinute(nextDay, WEEKDAY_AUTO_SLOTS_MINUTES[0])
  };
}

function normalizedConfig(config) {
  const boardIds = normalizeBoardIds(config?.boardIds, [config?.boardId]);
  return {
    connectorUrl: normalizeConnectorUrl(config?.connectorUrl),
    accessToken: normalizeText(config?.accessToken),
    boardIds,
    boardId: boardIds[0] || 0,
    meetingNoteColumnId: normalizeColumnSelectorList(
      config?.meetingNoteColumnId,
      normalizeColumnSelectorList(config?.meetingNodeColumnId)
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
    config.boardIds.join(","),
    config.meetingNoteColumnId,
    config.openInNewTab ? 1 : 0
  ].join("|");
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

function normalizeCachedBoardSnapshot(entry) {
  const base = normalizeCachedMondayBoardBase(entry);
  if (!base) {
    return null;
  }

  return {
    ...base,
    latest: normalizeCachedLatest(entry?.latest)
  };
}

function readCachedSnapshot(rawConfig, cfg) {
  const cacheAt = normalizeMondayCacheTimestamp(rawConfig?.cacheAt);
  const cachedSelectorKey = normalizeSelectorKey(rawConfig?.cacheMeetingNoteColumnId);
  const selectorMatches =
    !cachedSelectorKey ||
    cachedSelectorKey === normalizeSelectorKey(cfg.meetingNoteColumnId);

  if (!selectorMatches) {
    return null;
  }

  const cacheBoards = normalizeMondayCachedBoards(rawConfig?.cacheBoards, normalizeCachedBoardSnapshot);

  if (cacheBoards.length) {
    const configBoards = new Set(cfg.boardIds);
    const matchedBoards = cacheBoards.filter((entry) => configBoards.has(entry.boardId));
    if (!matchedBoards.length) {
      return null;
    }

    return {
      boards: matchedBoards,
      cacheAt
    };
  }

  const cachedBoardId = normalizeBoardId(rawConfig?.cacheBoardId, 0);
  if (!cachedBoardId || !cfg.boardIds.includes(cachedBoardId)) {
    return null;
  }

  const cachedLatest = normalizeCachedLatest(rawConfig?.cacheLatest);
  if (!cachedLatest && !cacheAt) {
    return null;
  }

  return {
    boards: [
      {
        boardId: cachedBoardId,
        boardName: normalizeText(rawConfig?.cacheBoardName, `Board ${cachedBoardId}`),
        latest: cachedLatest
      }
    ],
    cacheAt
  };
}

function resolveBoardUrl(boardId) {
  const normalizedBoardId = normalizeBoardId(boardId, 0);
  if (normalizedBoardId > 0) {
    return `${MONDAY_WEB_URL}boards/${normalizedBoardId}`;
  }
  return MONDAY_WEB_URL;
}

function resolveItemUrl(boardId, latestItemUrl) {
  const itemUrl = normalizeText(latestItemUrl);
  if (itemUrl) {
    return itemUrl;
  }
  return resolveBoardUrl(boardId);
}

function resolveMondayUrl(boardEntries, accountValue) {
  const candidateUrls = [];

  for (const entry of arrayOrEmpty(boardEntries)) {
    candidateUrls.push(entry?.boardUrl, entry?.latest?.itemUrl);
  }

  return resolveMondaySiteUrl(accountValue, candidateUrls);
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

function pushUnique(list, value) {
  const normalized = normalizeText(value);
  if (!normalized || list.includes(normalized)) {
    return;
  }
  list.push(normalized);
}

function sortColumnsByPreference(columns, preferredColumnIds = []) {
  const normalized = arrayOrEmpty(columns);
  if (!preferredColumnIds.length) {
    return normalized;
  }

  const preferred = preferredColumnIds.map((id) => normalizeText(id)).filter(Boolean);
  const indexById = new Map(preferred.map((id, index) => [id, index]));

  return [...normalized].sort((left, right) => {
    const leftIndex = indexById.has(normalizeText(left?.id))
      ? indexById.get(normalizeText(left?.id))
      : Number.MAX_SAFE_INTEGER;
    const rightIndex = indexById.has(normalizeText(right?.id))
      ? indexById.get(normalizeText(right?.id))
      : Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

function normalizeDocId(value) {
  const text = normalizeText(value);
  if (!/^\d{4,}$/.test(text)) {
    return "";
  }
  return text;
}

function extractDocIdFromUrl(urlText) {
  const parsed = parseUrlSafely(urlText);
  if (parsed) {
    const fromQuery = normalizeDocId(parsed.searchParams.get("doc_id"));
    if (fromQuery) {
      return fromQuery;
    }
  }

  const text = normalizeText(urlText);
  const match = text.match(/[?&#]doc_id=(\d{4,})/i);
  if (match?.[1]) {
    return normalizeDocId(match[1]);
  }

  return "";
}

function extractDocIdFromText(textValue) {
  const text = normalizeText(textValue);
  if (!text) {
    return "";
  }

  const directUrlDocId = extractDocIdFromUrl(text);
  if (directUrlDocId) {
    return directUrlDocId;
  }

  const match = text.match(/doc[_-]?id[^\d]*(\d{4,})/i);
  if (match?.[1]) {
    return normalizeDocId(match[1]);
  }

  return normalizeDocId(text);
}

function buildDocUrlFromItemUrl(itemUrl, docId) {
  const normalizedDocId = normalizeDocId(docId);
  if (!normalizedDocId) {
    return "";
  }

  const parsed = parseUrlSafely(itemUrl);
  if (parsed) {
    parsed.searchParams.set("doc_id", normalizedDocId);
    parsed.hash = "";
    return parsed.toString();
  }

  const text = normalizeText(itemUrl);
  const baseMatch = text.match(/^(https?:\/\/[^/]+\/boards\/\d+\/pulses\/\d+)/i);
  if (baseMatch?.[1]) {
    return `${baseMatch[1]}?doc_id=${normalizedDocId}`;
  }

  return "";
}

function extractUrlsFromText(rawValue) {
  const text = normalizeText(rawValue);
  if (!text) {
    return [];
  }

  const matches = text.match(/https?:\/\/[^\s"'<>]+/gi);
  if (!matches) {
    return [];
  }

  return matches.map((entry) => entry.replace(/[),.;]+$/g, ""));
}

function collectNestedStringValues(value, output, depth = 0) {
  if (depth > 4 || output.length > 120) {
    return;
  }

  if (typeof value === "string") {
    const text = normalizeText(value);
    if (text) {
      output.push(text);
    }
    return;
  }

  if (typeof value === "number") {
    output.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectNestedStringValues(entry, output, depth + 1);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectNestedStringValues(entry, output, depth + 1);
    }
  }
}

function collectColumnTextCandidates(columnValue) {
  const out = [];
  pushUnique(out, columnValue?.text);
  pushUnique(out, columnValue?.display_value);
  pushUnique(out, columnValue?.url);
  pushUnique(out, columnValue?.url_text);

  const rawValue = normalizeText(columnValue?.value);
  if (rawValue) {
    pushUnique(out, rawValue);
    const parsed = parseJsonOrNull(rawValue);
    const nestedValues = [];
    collectNestedStringValues(parsed, nestedValues, 0);
    for (const entry of nestedValues) {
      pushUnique(out, entry);
    }
  }

  return out;
}

function extractDocUrlFromCandidates(candidates, itemUrl) {
  const normalizedItemUrl = normalizeText(itemUrl);

  for (const candidate of arrayOrEmpty(candidates)) {
    const text = normalizeText(candidate);
    if (!text) {
      continue;
    }

    const directDocId = extractDocIdFromUrl(text);
    if (directDocId) {
      return buildDocUrlFromItemUrl(normalizedItemUrl, directDocId) || text;
    }

    const embeddedUrls = extractUrlsFromText(text);
    for (const urlEntry of embeddedUrls) {
      const embeddedDocId = extractDocIdFromUrl(urlEntry);
      if (embeddedDocId) {
        return buildDocUrlFromItemUrl(normalizedItemUrl, embeddedDocId) || urlEntry;
      }
    }

    const docIdFromText = extractDocIdFromText(text);
    if (docIdFromText) {
      const built = buildDocUrlFromItemUrl(normalizedItemUrl, docIdFromText);
      if (built) {
        return built;
      }
    }
  }

  return "";
}

function extractDocUrlFromColumnValue(columnValue, itemUrl) {
  return extractDocUrlFromCandidates(collectColumnTextCandidates(columnValue), itemUrl);
}

function extractMeetingNote(item, preferredColumnIds = [], selectorText = "") {
  const columns = arrayOrEmpty(item?.column_values);
  const itemUrl = normalizeText(item?.url);
  const orderedColumns = sortColumnsByPreference(columns, preferredColumnIds);

  let note = "";
  let docUrl = "";

  for (const column of orderedColumns) {
    if (!note) {
      const value = extractColumnText(column);
      const oneNote = pickSingleNote(value);
      if (oneNote) {
        note = oneNote;
      }
    }

    if (!docUrl) {
      docUrl = extractDocUrlFromColumnValue(column, itemUrl);
    }

    if (note && docUrl) {
      break;
    }
  }

  if (!docUrl) {
    docUrl = extractDocUrlFromCandidates([itemUrl, selectorText], itemUrl);
  }

  if (!note && docUrl) {
    note = "미팅 노트 문서 열기";
  }

  return {
    note,
    docUrl
  };
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
  const normalized = [...arrayOrEmpty(items)];
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
  return arrayOrEmpty(rawColumns)
    .map(normalizeBoardColumn)
    .filter((column) => column.id || column.title);
}

function resolveMeetingNoteColumnIds(columns, selectorList) {
  const selectors = arrayOrEmpty(selectorList);
  if (!selectors.length) {
    return [];
  }

  const out = [];
  const normalizedColumns = arrayOrEmpty(columns);
  const selectorKeys = selectors.map((entry) => normalizeSelectorKey(entry)).filter(Boolean);
  const compactSelectorKeys = selectorKeys.map((entry) => entry.replace(/\s+/g, ""));

  for (const selector of selectors) {
    const normalizedSelector = normalizeText(selector);
    if (!normalizedSelector) {
      continue;
    }
    for (const column of normalizedColumns) {
      if (normalizeText(column?.id) === normalizedSelector) {
        pushUnique(out, column?.id);
      }
    }
  }
  for (const column of normalizedColumns) {
    const titleKey = normalizeSelectorKey(column?.title);
    if (titleKey && selectorKeys.includes(titleKey)) {
      pushUnique(out, column?.id);
    }
  }
  for (const column of normalizedColumns) {
    const titleKey = normalizeSelectorKey(column?.title);
    const compactTitle = titleKey.replace(/\s+/g, "");
    if (!titleKey || !compactTitle) {
      continue;
    }

    for (let index = 0; index < selectorKeys.length; index += 1) {
      const selectorKey = selectorKeys[index];
      const compactSelectorKey = compactSelectorKeys[index];
      if (!selectorKey || !compactSelectorKey) {
        continue;
      }

      if (
        compactTitle === compactSelectorKey ||
        compactTitle.includes(compactSelectorKey) ||
        compactSelectorKey.includes(compactTitle) ||
        titleKey.includes(selectorKey) ||
        selectorKey.includes(titleKey)
      ) {
        pushUnique(out, column?.id);
        break;
      }
    }
  }

  return out;
}

function buildBoardContextQuery(boardId, includeUrl = true) {
  const boardUrlField = includeUrl ? "\n        url" : "";
  return `
    query {
      boards(ids: [${boardId}]) {
        id
        name
${boardUrlField}
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
    boardUrl: normalizeText(board?.url),
    columns: parseBoardColumns(board?.columns)
  };
}

async function fetchBoardContext(boardId, accessToken) {
  let data;
  try {
    data = await mondayFetchGraphql(accessToken, buildBoardContextQuery(boardId, true));
  } catch (error) {
    const message = normalizeErrorMessage(error);
    if (!message.includes("Cannot query field \"url\"")) {
      throw error;
    }
    data = await mondayFetchGraphql(accessToken, buildBoardContextQuery(boardId, false));
  }
  const context = parseBoardContext(data);
  if (!context) {
    throw new Error("Board not found or access denied for this account.");
  }
  return context;
}

function buildColumnValuesSelection(columnIds) {
  const normalizedIds = [];
  for (const entry of arrayOrEmpty(columnIds)) {
    pushUnique(normalizedIds, entry);
  }

  const idsFragment = normalizedIds.length
    ? `(ids: [${normalizedIds.map((id) => JSON.stringify(id)).join(", ")}])`
    : "";

  return `
            column_values${idsFragment} {
              id
              type
              text
              value
              ... on LongTextValue {
                text
              }
              ... on MirrorValue {
                display_value
              }
              ... on BoardRelationValue {
                display_value
              }
            }`;
}

function buildOrderedLatestQuery(boardId, columnIds = []) {
  const columnValuesSelection = buildColumnValuesSelection(columnIds);
  return `
    query {
      boards(ids: [${boardId}]) {
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
${columnValuesSelection}
          }
        }
      }
    }
  `;
}

function buildFallbackLatestQuery(boardId, columnIds = []) {
  const columnValuesSelection = buildColumnValuesSelection(columnIds);
  return `
    query {
      boards(ids: [${boardId}]) {
        id
        name
        items_page(limit: ${FALLBACK_LATEST_SCAN_LIMIT}) {
          items {
            id
            name
            url
            created_at
            updated_at
${columnValuesSelection}
          }
        }
      }
    }
  `;
}

function parseQueryData(data) {
  const board = Array.isArray(data?.boards) ? data.boards[0] : null;
  const items = arrayOrEmpty(board?.items_page?.items);
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

async function fetchLatestMeetingNote(boardId, selectorText, accessToken) {
  const boardContext = await fetchBoardContext(boardId, accessToken);
  const selectorList = parseSelectorList(selectorText);
  const resolvedColumnIds = resolveMeetingNoteColumnIds(
    boardContext.columns,
    selectorList
  );

  let parsed;
  try {
    const orderedData = await mondayFetchGraphql(
      accessToken,
      buildOrderedLatestQuery(boardId, resolvedColumnIds)
    );
    parsed = parseQueryData(orderedData);
  } catch (error) {
    if (!canFallbackWithoutOrder(error)) {
      throw error;
    }
    const fallbackData = await mondayFetchGraphql(
      accessToken,
      buildFallbackLatestQuery(boardId, resolvedColumnIds)
    );
    parsed = parseQueryData(fallbackData);
  }

  const latestItem = pickLatestItem(parsed?.items);
  if (!latestItem) {
    return {
      boardName: normalizeText(parsed?.boardName, `Board ${boardId}`),
      boardUrl: normalizeText(boardContext?.boardUrl),
      boardId,
      latest: null
    };
  }

  const extracted = extractMeetingNote(
    latestItem,
    resolvedColumnIds,
    selectorText
  );

  return {
    boardId,
    boardName: normalizeText(parsed?.boardName, `Board ${boardId}`),
    boardUrl: normalizeText(boardContext?.boardUrl),
    latest: {
      id: normalizeText(latestItem?.id),
      title: normalizeText(latestItem?.name, "(Untitled item)"),
      itemUrl: extracted.docUrl || normalizeText(latestItem?.url),
      updatedLabel: formatDateLabel(normalizeText(latestItem?.updated_at, latestItem?.created_at)),
      note: extracted.note
    }
  };
}

export const mondayMeetingNoteWidget = {
  type: "mondayMeetingNote",
  title: "Monday Meeting Note",
  defaultConfig: {
    connectorUrl: LOCAL_AUTH_CONNECTOR_URL,
    accessToken: "",
    boardId: "",
    meetingNoteColumnId: DEFAULT_MEETING_NOTE_COLUMN_SELECTOR,
    openInNewTab: true,
    autoRefreshDayKey: "",
    autoRefreshSlotsDone: "",
    cacheBoardId: 0,
    cacheMeetingNoteColumnId: "",
    cacheAt: 0,
    cacheBoardName: "",
    cacheLatest: null,
    cacheBoards: []
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
      key: "boardId",
      label: "Board ID(s)",
      type: "text",
      placeholder: "123456789 or 123456789,987654321",
      helpText: "Use numeric board IDs from /boards/<id>. Comma-separated IDs are supported."
    },
    {
      key: "meetingNoteColumnId",
      label: "Meeting note column selector(s)",
      type: "text",
      placeholder: "미팅 노트, monday Doc",
      helpText: "Column ID/title selectors for note/doc lookup. Comma-separated selectors are supported."
    },
    { key: "openInNewTab", label: "Open links in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, getUi, patchConfig, isEditMode, openSettings }) {
    container.classList.add("monday-meeting-widget");

    const shell = document.createElement("div");
    shell.className = "monday-meeting-widget-shell";

    const panel = document.createElement("div");
    panel.className = "monday-meeting-panel";

    shell.append(panel);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let boardEntries = [];
    let hasFetched = false;
    let connected = false;
    let accountLabel = "";
    let accessToken = "";
    let sessionConnectorUrl = "";
    let sessionSyncSerial = 0;
    let requestSerial = 0;
    let lastSignature = "";
    let timer = null;

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

    function hasActiveConnection(config) {
      return hasActiveAuthConnection({
        config,
        connected,
        accessToken,
        sessionConnectorUrl
      });
    }

    async function clearConnectionState({ clearStored = true } = {}) {
      connected = false;
      accountLabel = "";
      accessToken = "";
      sessionConnectorUrl = "";
      if (clearStored) {
        await authSessionStorage.clear();
      }
    }

    async function syncStoredSessionForConfig(config) {
      const syncId = ++sessionSyncSerial;
      const activeSession = await loadActiveAuthSessionForConfig({
        config,
        loadStoredSession: () => authSessionStorage.load(),
        normalizeConnectorUrl
      });
      if (syncId !== sessionSyncSerial) {
        return false;
      }

      if (activeSession) {
        connected = true;
        accessToken = activeSession.accessToken;
        accountLabel = activeSession.accountLabel;
        sessionConnectorUrl = activeSession.connectorUrl;
        return true;
      }

      await clearConnectionState({ clearStored: false });
      return false;
    }

    function clearSnapshotState() {
      boardEntries = [];
      hasFetched = false;
    }

    function applyCachedSnapshotIfPresent(rawConfig, cfg) {
      const cached = readCachedSnapshot(rawConfig, cfg);
      if (!cached) {
        return false;
      }

      boardEntries = arrayOrEmpty(cached.boards)
        .map((entry) => ({
            boardId: normalizeBoardId(entry?.boardId, 0),
            boardName: normalizeText(entry?.boardName),
            boardUrl: normalizeText(entry?.boardUrl),
            latest: normalizeCachedLatest(entry?.latest)
          }));
      hasFetched = boardEntries.some((entry) => Boolean(entry?.latest));
      return true;
    }

    function persistSnapshot(cfg) {
      const cacheBoards = normalizeMondayCachedBoards(
        boardEntries,
        (entry) => {
          const boardId = normalizeBoardId(entry?.boardId, 0);
          if (!boardId) {
            return null;
          }

          const cacheLatest = entry?.latest
            ? {
                id: normalizeText(entry.latest?.id),
                title: normalizeText(entry.latest?.title, "(Untitled item)"),
                itemUrl: normalizeText(entry.latest?.itemUrl),
                updatedLabel: normalizeText(entry.latest?.updatedLabel),
                note: normalizeText(entry.latest?.note)
              }
            : null;

          return {
            boardId,
            boardName: normalizeText(entry?.boardName, `Board ${boardId}`),
            boardUrl: normalizeText(entry?.boardUrl),
            latest: cacheLatest
          };
        }
      );

      const primary = cacheBoards[0] || null;
      const cacheLatest = primary ? primary.latest : null;
      const cacheBoardId = primary ? primary.boardId : 0;
      const cacheBoardName = primary ? primary.boardName : "";

      const currentCfg = getConfig();
      const unchanged =
        normalizeSelectorKey(currentCfg?.cacheMeetingNoteColumnId) ===
          normalizeSelectorKey(cfg.meetingNoteColumnId) &&
        areCachedBoardsEqual(currentCfg?.cacheBoards, cacheBoards, normalizeCachedBoardSnapshot);

      if (unchanged) {
        return;
      }

      patchConfig({
        cacheBoardId,
        cacheMeetingNoteColumnId: normalizeText(cfg.meetingNoteColumnId),
        cacheAt: Date.now(),
        cacheBoardName,
        cacheLatest,
        cacheBoards
      }, { mutationKind: "system" });
    }

    function persistAutoSlots(config, now, dueIndices) {
      if (!dueIndices.length) {
        return;
      }

      const next = updateAutoRefreshSlotsDoneForToday(
        config,
        now,
        dueIndices,
        WEEKDAY_AUTO_SLOTS_MINUTES.length
      );
      if (
        next.dayKey === config.autoRefreshDayKey &&
        next.slotsDone === config.autoRefreshSlotsDone
      ) {
        return;
      }

      patchConfig({
        autoRefreshDayKey: next.dayKey,
        autoRefreshSlotsDone: next.slotsDone
      }, { mutationKind: "system" });
    }

    function shouldRunAutoNow() {
      const cfg = resolveConfig();
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
      const cfg = resolveConfig();
      if (
        !hasBoardConfig(cfg) ||
        !hasMeetingNoteColumnConfig(cfg) ||
        !hasActiveConnection(cfg)
      ) {
        renderStatus();
        return;
      }

      const next = nextAutoSlot(cfg, new Date());
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
      return;
    }

    function makeEmptyMessage(text) {
      const empty = document.createElement("p");
      empty.className = "monday-meeting-empty";
      empty.textContent = text;
      return empty;
    }

    function renderPanel() {
      panel.replaceChildren();
      const cfg = resolveConfig();

      const visibleEntries = boardEntries.filter((entry) => normalizeBoardId(entry?.boardId, 0) > 0);
      const hasLatest = visibleEntries.some((entry) => Boolean(entry?.latest));

      if (!hasLatest) {
        if (loading) {
          panel.append(makeEmptyMessage("Loading latest meeting note..."));
        } else if (!hasConnectorConfig(cfg)) {
          panel.append(makeEmptyMessage(MONDAY_CONNECT_ENABLE_MESSAGE));
        } else if (!hasActiveConnection(cfg)) {
          panel.append(makeEmptyMessage("Connect Monday account to load latest meeting note."));
        } else if (!hasBoardConfig(cfg)) {
          panel.append(makeEmptyMessage("Add Board ID(s) in widget settings. Use numeric IDs from /boards/<id>."));
        } else if (!hasMeetingNoteColumnConfig(cfg)) {
          panel.append(makeEmptyMessage("Add meeting note column selector(s) in widget settings."));
        } else if (errorMessage) {
          panel.append(makeEmptyMessage("Meeting note is not available. Check Monday settings and try again."));
        } else {
          panel.append(makeEmptyMessage("No latest item found for configured boards."));
        }
        return;
      }

      for (const entry of visibleEntries) {
        const latest = entry.latest;
        if (!latest) {
          continue;
        }

        const link = document.createElement("a");
        link.className = "monday-meeting-link";
        link.href = resolveItemUrl(entry.boardId, latest.itemUrl);
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

        const boardLine = document.createElement("div");
        boardLine.className = "monday-meeting-board";
        boardLine.textContent = entry.boardName || `Board ${entry.boardId}`;

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
        link.append(boardLine, heading, note);
        panel.append(link);
      }
    }

    function render() {
      renderStatus();
      renderPanel();
    }

    async function connectAccount() {
      const cfg = resolveConfig();
      if (!hasConnectorConfig(cfg)) {
        errorMessage = MONDAY_CONNECT_REQUIRED_MESSAGE;
        render();
        return;
      }

      loading = true;
      errorMessage = "";
      render();

      try {
        const result = await connectWithMondayAuthConnector({
          connectorUrl: cfg.connectorUrl,
          accessToken: cfg.accessToken,
          getIdentityApi: getChromeIdentity
        });

        connected = true;
        accessToken = result.accessToken;
        accountLabel = result.accountLabel;
        sessionConnectorUrl = cfg.connectorUrl;
        const storedSession = createStoredAuthSessionForConnectorResult({
          connectorUrl: cfg.connectorUrl,
          configuredAccessToken: cfg.accessToken,
          result
        });
        if (storedSession) {
          await authSessionStorage.save(storedSession);
        }

        errorMessage = "";
        hasFetched = false;
      } catch (error) {
        await clearConnectionState({ clearStored: true });
        errorMessage = formatMondayAuthConnectorErrorMessage(error);
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
      const cfg = resolveConfig();
      if (normalizeText(cfg.accessToken)) {
        errorMessage = MONDAY_DISCONNECT_CONFIGURED_TOKEN_MESSAGE;
        render();
        return;
      }

      loading = true;
      render();
      await clearConnectionState({ clearStored: true });
      errorMessage = "";
      clearSnapshotState();
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
        const cfg = resolveConfig();
        if (!hasConnectorConfig(cfg)) {
          throw new Error(MONDAY_SYNC_CONNECT_REQUIRED_MESSAGE);
        }
        if (!hasBoardConfig(cfg)) {
          throw new Error("Add Board ID(s) in settings before syncing. Use numeric IDs from /boards/<id>.");
        }
        if (!hasMeetingNoteColumnConfig(cfg)) {
          throw new Error("Add meeting note column selector(s) in settings before syncing.");
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

        const results = await Promise.all(
          cfg.boardIds.map((boardId) => fetchLatestMeetingNote(boardId, cfg.meetingNoteColumnId, accessToken))
        );
        if (requestId !== requestSerial) {
          return;
        }

        boardEntries = results;
        hasFetched = results.some((entry) => Boolean(entry?.latest));
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
        if (!boardEntries.some((entry) => Boolean(entry?.latest))) {
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
      const cfg = resolveConfig();
      if (hasActiveConnection(cfg)) {
        await disconnectAccount();
        return;
      }
      await connectAccount();
    }

    const storageSubscription = createChromeStorageChangeSubscription((changes, areaName) => {
      if (areaName !== "local" || !hasAuthSessionStorageChange(changes, MONDAY_AUTH_STORAGE_KEY)) {
        return;
      }

      const cfg = resolveConfig();
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
    });

    function openMondayPage() {
      const cfg = resolveConfig();
      const href = resolveMondayUrl(boardEntries, accountLabel);
      if (!href) {
        return;
      }
      const target = cfg.openInNewTab ? "_blank" : "_self";
      if (target === "_blank") {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
    }

    const initialRawCfg = getConfig();
    const initialCfg = resolveConfig();
    if (!applyCachedSnapshotIfPresent(initialRawCfg, initialCfg)) {
      clearSnapshotState();
    }
    lastSignature = configSignature(initialCfg);
    render();
    storageSubscription.install();
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
        const cfg = resolveConfig();
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
        return hasActiveConnection(resolveConfig());
      },
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
        storageSubscription.remove();
      }
    };
  }
};
