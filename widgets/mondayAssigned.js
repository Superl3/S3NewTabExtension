import { arrayOrEmpty } from "../core/utils/array.js";
import { normalizeErrorMessage } from "../core/utils/error.js";
import { parseJsonOrNull } from "../core/utils/json.js";
import { clamp, normalizeIntegerInRange } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import {
  LOCAL_AUTH_CONNECTOR_URL,
  normalizeLocalAuthConnectorUrl as normalizeConnectorUrl
} from "./shared/authConnector.js";
import {
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
  normalizeColumnSelectorList,
  normalizeMondayCachedBoards,
  normalizeMondayCacheNumber,
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
  resolveMondaySiteUrl
} from "./shared/mondayClient.js";

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

function normalizeMaxItems(value, fallback = 15) {
  return normalizeIntegerInRange(value, fallback, 1, 120);
}

function normalizeHour(value, fallback, min, max) {
  return normalizeIntegerInRange(value, fallback, min, max);
}

function normalizePeopleColumnSelectorList(value, fallback = "") {
  return normalizeColumnSelectorList(value, {
    fallback,
    maxLength: 80,
    allowWildcard: true,
    unique: false
  });
}

function parsePeopleColumnSelectorList(value) {
  return parseColumnSelectorList(value, {
    maxLength: 80,
    allowWildcard: true
  });
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

function formatTimeLabel(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function resolveMondayUrl(boardSnapshots, accountValue) {
  const candidateUrls = [];

  for (const snapshot of arrayOrEmpty(boardSnapshots)) {
    candidateUrls.push(snapshot?.boardUrl);

    for (const issue of arrayOrEmpty(snapshot?.issues)) {
      candidateUrls.push(issue?.url);
    }
  }

  return resolveMondaySiteUrl(accountValue, candidateUrls);
}

function resolveBoardDisplayName(snapshot, fallbackBoardId = 0) {
  const boardId = normalizeBoardId(snapshot?.boardId, fallbackBoardId);
  return normalizeText(snapshot?.boardName, boardId ? `Board ${boardId}` : "Board");
}

function createFallbackBoardSnapshot(boardId, fallbackScopeMode, context = null, previousSnapshot = null) {
  const previousGroups = arrayOrEmpty(previousSnapshot?.boardGroups);
  const contextGroups = Array.isArray(context?.boardGroups) ? context.boardGroups : previousGroups;
  const assigneeName =
    fallbackScopeMode === "all"
      ? "all tasks"
      : normalizeText(context?.meName || previousSnapshot?.assigneeName, "me");

  return {
    boardId,
    boardName: resolveBoardDisplayName({
      boardId,
      boardName: normalizeText(context?.boardName || previousSnapshot?.boardName)
    }, boardId),
    boardUrl: normalizeText(context?.boardUrl || previousSnapshot?.boardUrl),
    assigneeName,
    scopeMode: fallbackScopeMode === "all" ? "all" : "assigned",
    boardGroups: contextGroups,
    issues: []
  };
}

function buildBoardHeaderText(snapshot, issueCount, isAllScope) {
  const displayName = resolveBoardDisplayName(snapshot);
  if (issueCount > 0) {
    return `${displayName} (${issueCount} ${isAllScope ? "items" : "assigned"})`;
  }
  return `${displayName} (Empty)`;
}

function isFallbackBoardName(boardName, boardId) {
  const normalizedId = normalizeBoardId(boardId, 0);
  if (!normalizedId) {
    return false;
  }
  return normalizeText(boardName) === `Board ${normalizedId}`;
}

function hasIncompleteBoardMetadata(boardSnapshots) {
  return arrayOrEmpty(boardSnapshots).some((snapshot) => {
    const boardId = normalizeBoardId(snapshot?.boardId, 0);
    if (!boardId) {
      return false;
    }

    const boardName = normalizeText(snapshot?.boardName);
    const boardUrl = normalizeText(snapshot?.boardUrl);
    return !boardName || !boardUrl || isFallbackBoardName(boardName, boardId);
  });
}

function openHref(href, openInNewTab, locationRef = window.location, openImpl = window.open) {
  if (!href) {
    return;
  }
  if (openInNewTab) {
    openImpl(href, "_blank", "noopener,noreferrer");
    return;
  }
  locationRef.href = href;
}

const authSessionStorage = createAuthSessionStorage({
  storageKey: MONDAY_AUTH_STORAGE_KEY,
  getStorageArea: getChromeStorageLocal,
  normalizeConnectorUrl
});

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

function dueAutoSlotIndices(config, now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const workStart = config.workStartHour * 60;
  const workEnd = config.workEndHour * 60;
  if (nowMinutes < workStart || nowMinutes >= workEnd) {
    return [];
  }

  return dueAutoRefreshSlotIndices(config, autoSlotMinutes(config), now);
}

function nextAutoSlot(config, now = new Date()) {
  return nextAutoRefreshSlot(config, autoSlotMinutes(config), now);
}

async function fetchContext(config, accessToken) {
  const queryWithBoardUrl = `
    query {
      me {
        id
        name
      }
      boards(ids: ${config.boardId}) {
        id
        name
        url
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

  const queryWithoutBoardUrl = `
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

  let data;
  try {
    data = await mondayFetchGraphql(accessToken, queryWithBoardUrl);
  } catch (error) {
    const message = normalizeErrorMessage(error);
    if (!message.includes("Cannot query field \"url\"")) {
      throw error;
    }
    data = await mondayFetchGraphql(accessToken, queryWithoutBoardUrl);
  }
  const meId = Number(data?.me?.id);
  if (!Number.isFinite(meId) || meId <= 0) {
    throw new Error("Unable to read your Monday profile from the connected account.");
  }

  const board = Array.isArray(data?.boards) ? data.boards[0] : null;
  if (!board) {
    throw new Error("Board not found or access denied for this account.");
  }

  const allColumns = arrayOrEmpty(board?.columns);
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
    boardUrl: normalizeText(board?.url),
    peopleColumns,
    statusColumnIds,
    boardGroups
  };
}

function resolvePeopleColumnIds(peopleColumns, configuredSelector = "") {
  const configured = normalizeColumnSelector(configuredSelector);

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

function normalizeColumnIds(columnIds) {
  return arrayOrEmpty(columnIds)
    .map((value) => normalizeColumnSelector(value))
    .filter(Boolean);
}

function buildStatusColumnValuesSelection(statusColumnIds) {
  const ids = normalizeColumnIds(statusColumnIds);
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
  const values = arrayOrEmpty(item?.column_values);
  if (!values.length) {
    return false;
  }

  const targetIds = new Set(normalizeColumnIds(statusColumnIds));
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
      updatedTs: normalizeMondayCacheNumber(updatedTs)
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
  return {
    id,
    title: normalizeText(entry?.title, "(Untitled issue)"),
    url: normalizeText(entry?.url, MONDAY_WEB_URL),
    groupId: normalizeText(entry?.groupId),
    groupTitle: normalizeText(entry?.groupTitle),
    updatedLabel: normalizeText(entry?.updatedLabel),
    updatedTs: normalizeMondayCacheNumber(entry?.updatedTs)
  };
}

function normalizeCachedGroup(entry) {
  return {
    id: normalizeText(entry?.id),
    title: normalizeText(entry?.title)
  };
}

function normalizeCachedBoardSnapshot(entry) {
  const base = normalizeCachedMondayBoardBase(entry);
  if (!base) {
    return null;
  }

  const issues = arrayOrEmpty(entry?.issues).map(normalizeCachedIssue).filter(Boolean);
  const groups = arrayOrEmpty(entry?.groups).map(normalizeCachedGroup).filter((group) => group.id || group.title);

  return {
    ...base,
    assigneeName: normalizeText(entry?.assigneeName, "me"),
    scopeMode: normalizeText(entry?.scopeMode) === "all" ? "all" : "assigned",
    groups,
    issues
  };
}

function readCachedSnapshot(rawConfig, cfg) {
  const cacheAt = normalizeMondayCacheTimestamp(rawConfig?.cacheAt);
  const configuredBoards = new Set(cfg.boardIds);
  const cacheBoards = normalizeMondayCachedBoards(rawConfig?.cacheBoards, normalizeCachedBoardSnapshot);

  if (cacheBoards.length) {
    const boards = cacheBoards
      .filter((entry) => configuredBoards.has(entry.boardId))
      .map((entry) => ({
        boardId: entry.boardId,
        boardName: entry.boardName,
        boardUrl: entry.boardUrl,
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

  const cachedIssues = arrayOrEmpty(rawConfig?.cacheIssues).map(normalizeCachedIssue).filter(Boolean);
  if (!cachedIssues.length && !cacheAt) {
    return null;
  }

  const cachedGroups = arrayOrEmpty(rawConfig?.cacheGroups)
    .map(normalizeCachedGroup)
    .filter((group) => group.id || group.title);

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
  const parsed = parseJsonOrNull(normalizeText(columnValue?.value));
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

  for (const value of arrayOrEmpty(columnValues)) {
    const ids = parsePeopleIdsFromValue(value);
    if (ids.includes(target)) {
      return true;
    }
  }
  return false;
}

function mapAssignedSubitems(parentItems, meId) {
  const out = [];
  for (const parent of arrayOrEmpty(parentItems)) {
    const parentTitle = normalizeText(parent?.name, "(Untitled issue)");
    const parentGroup = parent?.group;
    for (const subitem of arrayOrEmpty(parent?.subitems)) {
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
  for (const parent of arrayOrEmpty(parentItems)) {
    const parentTitle = normalizeText(parent?.name, "(Untitled issue)");
    const parentGroup = parent?.group;
    for (const subitem of arrayOrEmpty(parent?.subitems)) {
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
    const parentItems = arrayOrEmpty(board?.items_page?.items);
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
    const parentItems = arrayOrEmpty(legacyBoard?.items);
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
    const parentItems = arrayOrEmpty(board?.items_page?.items);
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
  const columnIds = normalizeColumnIds(peopleColumnIds);

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
  const parentItems = arrayOrEmpty(board?.items_page?.items);
  return mapAssignedSubitems(parentItems, meId);
}

async function fetchAssignedIssues(config, meId, peopleColumnIds, accessToken, statusColumnIds = []) {
  const columnIds = normalizeColumnIds(peopleColumnIds);

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
      const href = resolveMondayUrl(boardSnapshots, accountLabel);
      openHref(href, cfg.openInNewTab);
    }

    function createBoardHeader(snapshot, cfg, issueCount) {
      const href = normalizeText(snapshot?.boardUrl);
      const header = document.createElement(href ? "a" : "div");
      header.className = "monday-board-card-header";
      header.textContent = buildBoardHeaderText(snapshot, issueCount, snapshot?.scopeMode === "all");

      if (!href) {
        return header;
      }

      header.href = href;
      header.target = cfg.openInNewTab ? "_blank" : "_self";
      header.rel = "noreferrer";
      header.addEventListener("click", (event) => {
        if (!isEditMode?.()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openSettings?.();
      });
      return header;
    }

    function applyCachedSnapshotIfPresent(rawConfig, cfg) {
      const cached = readCachedSnapshot(rawConfig, cfg);
      if (!cached) {
        return;
      }

      boardSnapshots = arrayOrEmpty(cached.boards)
        .map((entry) => ({
            boardId: normalizeBoardId(entry?.boardId, 0),
            boardName: normalizeText(entry?.boardName),
            boardUrl: normalizeText(entry?.boardUrl),
            assigneeName: normalizeText(entry?.assigneeName, "me"),
            scopeMode: normalizeText(entry?.scopeMode) === "all" ? "all" : "assigned",
            boardGroups: arrayOrEmpty(entry?.groups),
            issues: arrayOrEmpty(entry?.issues)
          }))
      hasFetched = boardSnapshots.length > 0;
    }

    function persistSnapshot(cfg) {
      const cacheBoards = boardSnapshots
        .map((snapshot) => {
          const boardId = normalizeBoardId(snapshot?.boardId, 0);
          if (!boardId) {
            return null;
          }

          const issues = arrayOrEmpty(snapshot?.issues)
            .map((issue) => ({
                id: normalizeText(issue?.id),
                title: normalizeText(issue?.title),
                url: normalizeText(issue?.url),
                groupId: normalizeText(issue?.groupId),
                groupTitle: normalizeText(issue?.groupTitle),
                updatedLabel: normalizeText(issue?.updatedLabel),
                updatedTs: normalizeMondayCacheNumber(issue?.updatedTs)
              }));

          const groups = arrayOrEmpty(snapshot?.boardGroups)
            .map((group) => ({
                id: normalizeText(group?.id),
                title: normalizeText(group?.title)
              }));

          return {
            boardId,
            boardName: normalizeText(snapshot?.boardName, `Board ${boardId}`),
            boardUrl: normalizeText(snapshot?.boardUrl),
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
      const unchanged = areCachedBoardsEqual(currentCfg?.cacheBoards, cacheBoards, normalizeCachedBoardSnapshot);

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
      }, { mutationKind: "system" });
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
        if (!loading && hasBoardConfig(cfg) && hasActiveConnection(cfg) && shouldRunAutoNow()) {
          void loadIssues({ reason: "auto" });
          return;
        }
        scheduleRefresh();
      });
    });

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

      if (connected && hasBoardConfig(resolveConfig())) {
        void loadIssues({ reason: "manual" });
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
      const ids = arrayOrEmpty(cfg.boardIds);
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
        if (visibleSnapshots.length && hasFetched && hasBoardConfig(cfg) && hasActiveConnection(cfg)) {
          list.classList.toggle("is-board-cards", multiBoard);
          for (const snapshot of visibleSnapshots) {
            const card = document.createElement("li");
            card.className = "monday-board-card";

            const cardHeader = createBoardHeader(snapshot, cfg, 0);

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
          empty.textContent = MONDAY_CONNECT_ENABLE_MESSAGE;
        } else if (!hasActiveConnection(cfg)) {
          empty.textContent = hasAllScope
            ? "Connect Monday account to load board issues."
            : "Connect Monday account to load assigned issues.";
        } else if (!hasBoardConfig(cfg)) {
          empty.textContent = "Add Board ID(s) in widget settings. Use numeric IDs from /boards/<id>.";
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
        if (first) {
          const boardHeaderRow = document.createElement("li");
          boardHeaderRow.className = "monday-board-inline-header";
          boardHeaderRow.append(createBoardHeader(first, cfg, arrayOrEmpty(first?.issues).length));
          list.append(boardHeaderRow);
        }
        const grouped = groupIssuesByGroup(first?.issues || [], first?.boardGroups || []);
        renderGroupedIssues(list, grouped, cfg, `board-${first?.boardId || cfg.boardId}`);
        return;
      }

      for (const snapshot of visibleSnapshots) {
        const boardIssues = arrayOrEmpty(snapshot?.issues);
        const isAllScope = snapshot?.scopeMode === "all";

        const card = document.createElement("li");
        card.className = "monday-board-card";

        const cardHeader = createBoardHeader(snapshot, cfg, boardIssues.length);

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
        text = "Add Monday connection settings";
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

      const next = updateAutoRefreshSlotsDoneForToday(
        config,
        now,
        dueIndices,
        autoSlotMinutes(config).length
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
          throw new Error(MONDAY_SYNC_CONNECT_REQUIRED_MESSAGE);
        }
        if (!hasActiveConnection(cfg)) {
          throw new Error("Connect Monday account first.");
        }
        if (!hasBoardConfig(cfg)) {
          throw new Error("Add Board ID(s) in settings before syncing. Use numeric IDs from /boards/<id>.");
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
        const previousSnapshots = new Map(
          boardSnapshots.map((entry) => [normalizeBoardId(entry?.boardId, 0), entry])
        );
        for (let boardIndex = 0; boardIndex < cfg.boardIds.length; boardIndex += 1) {
          const boardId = cfg.boardIds[boardIndex];
          const boardCfg = { ...cfg, boardId };
          const selector = resolveBoardPeopleColumnSelector(cfg, boardIndex);
          const fallbackScopeMode = selector === "*" ? "all" : "assigned";
          const previousSnapshot = previousSnapshots.get(boardId) || null;
          let context = null;

          try {
            context = await fetchContext(boardCfg, accessToken);
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
              boardUrl: context.boardUrl,
              assigneeName: scope.mode === "all" ? "all tasks" : normalizeText(context.meName, "me"),
              scopeMode: scope.mode,
              boardGroups: arrayOrEmpty(context.boardGroups),
              issues
            });
          } catch (boardError) {
            if (boardError?.code === "auth") {
              throw boardError;
            }

            boardWarnings.push(`${boardId}: ${normalizeErrorMessage(boardError)}`);
            snapshots.push(
              createFallbackBoardSnapshot(boardId, fallbackScopeMode, context, previousSnapshot)
            );
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
    storageSubscription.install();
    void syncStoredSessionForConfig(initialCfg).finally(() => {
      render();
      const shouldLoadImmediately =
        hasBoardConfig(initialCfg) &&
        hasActiveConnection(initialCfg) &&
        (!hasFetched || hasIncompleteBoardMetadata(boardSnapshots) || shouldRunAutoNow());
      if (shouldLoadImmediately) {
        void loadIssues({ reason: "config" });
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
        storageSubscription.remove();
      }
    };
  }
};
