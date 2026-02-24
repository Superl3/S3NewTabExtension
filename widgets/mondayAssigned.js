const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_WEB_URL = "https://monday.com/";
const MONDAY_AUTH_STORAGE_KEY = "s3newtab-monday-auth-session-v1";

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

function normalizeConnectorUrl(value, fallback = "") {
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

function createAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildAuthConnectorStartUrl(connectorUrl, redirectUri, state) {
  const url = new URL(connectorUrl);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
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
    accessToken: read("access_token") || read("token"),
    accountLabel: read("account") || read("email") || read("user"),
    error: read("error"),
    errorDescription: read("error_description")
  };
}

function normalizeStoredAuthSession(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const connectorUrl = normalizeConnectorUrl(raw.connectorUrl);
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
      connectorUrl: normalizeConnectorUrl(session?.connectorUrl),
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
    config.boardId,
    config.peopleColumnId,
    config.maxItems,
    config.workStartHour,
    config.workEndHour,
    config.openInNewTab ? 1 : 0
  ].join("|");
}

function hasConnectorConfig(config) {
  return Boolean(config.connectorUrl);
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
    return type === "people" || type === "multiple-person" || type === "person";
  });

  return {
    meId,
    meName: normalizeText(data?.me?.name),
    boardName: normalizeText(board?.name, `Board ${config.boardId}`),
    peopleColumns
  };
}

function resolvePeopleColumnId(config, peopleColumns) {
  const configured = normalizeColumnId(config.peopleColumnId);
  if (configured) {
    return configured;
  }

  const first = normalizeText(peopleColumns?.[0]?.id);
  if (first) {
    return first;
  }

  throw new Error("No People column detected. Set People column ID in widget settings.");
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
      groupTitle: normalizeText(entry?.group?.title),
      updatedLabel: formatDateLabel(updatedAt),
      updatedTs: Number.isFinite(updatedTs) ? updatedTs : 0
    });
  }

  mapped.sort((a, b) => b.updatedTs - a.updatedTs);
  return mapped.slice(0, maxItems);
}

async function fetchAssignedIssues(config, meId, peopleColumnId, accessToken) {
  const personFilter = JSON.stringify({
    personsAndTeams: [{ id: meId, kind: "person" }]
  });

  const query = `
    query {
      items_by_column_values(
        board_id: ${config.boardId}
        column_id: ${JSON.stringify(peopleColumnId)}
        column_value: ${JSON.stringify(personFilter)}
      ) {
        id
        name
        url
        updated_at
        group {
          title
        }
      }
    }
  `;

  const data = await mondayFetchGraphql(accessToken, query);
  const rawItems = Array.isArray(data?.items_by_column_values)
    ? data.items_by_column_values
    : [];
  return mapAssignedIssues(rawItems, config.maxItems);
}

export const mondayAssignedWidget = {
  type: "mondayAssigned",
  title: "Monday Assigned Issues",
  defaultConfig: {
    connectorUrl: "",
    boardId: 0,
    peopleColumnId: "",
    maxItems: 15,
    workStartHour: 9,
    workEndHour: 18,
    openInNewTab: true,
    autoRefreshDayKey: "",
    autoRefreshSlotsDone: ""
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

    const toolbar = document.createElement("div");
    toolbar.className = "monday-widget-toolbar";

    const status = document.createElement("p");
    status.className = "monday-widget-status";

    const actions = document.createElement("div");
    actions.className = "monday-widget-actions";

    const connectBtn = document.createElement("button");
    connectBtn.type = "button";
    connectBtn.className = "btn btn-primary";
    connectBtn.textContent = "Connect";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "btn";
    refreshBtn.textContent = "Refresh";

    const disconnectBtn = document.createElement("button");
    disconnectBtn.type = "button";
    disconnectBtn.className = "btn";
    disconnectBtn.textContent = "Disconnect";

    const openMondayBtn = document.createElement("a");
    openMondayBtn.className = "btn";
    openMondayBtn.textContent = "Open Monday";
    openMondayBtn.rel = "noreferrer";

    actions.append(connectBtn, refreshBtn, disconnectBtn, openMondayBtn);
    toolbar.append(status, actions);

    const list = document.createElement("ul");
    list.className = "monday-issue-list";

    shell.append(toolbar, list);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let boardName = "";
    let assigneeName = "";
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

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function applyOpenMondayButton() {
      const cfg = normalizedConfig(getConfig());
      openMondayBtn.href = MONDAY_WEB_URL;
      openMondayBtn.target = cfg.openInNewTab ? "_blank" : "_self";
    }

    function hasActiveConnection(config) {
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
        if (!chrome.identity?.launchWebAuthFlow || !chrome.identity?.getRedirectURL) {
          throw new Error("chrome.identity.launchWebAuthFlow is not available.");
        }

        const state = createAuthState();
        const redirectUri = chrome.identity.getRedirectURL("monday-auth");
        const startUrl = buildAuthConnectorStartUrl(cfg.connectorUrl, redirectUri, state);
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

        const token = normalizeText(result.accessToken);
        if (!token) {
          throw new Error("Auth connector did not return access_token.");
        }

        connected = true;
        accessToken = token;
        accountLabel = normalizeText(result.accountLabel);
        sessionConnectorUrl = cfg.connectorUrl;
        await saveStoredAuthSession({
          connectorUrl: cfg.connectorUrl,
          accessToken: token,
          accountLabel
        });

        errorMessage = "";
        hasFetched = false;
      } catch (error) {
        await clearConnectionState({ clearStored: true });
        const message = normalizeErrorMessage(error);
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
      loading = true;
      render();
      await clearConnectionState({ clearStored: true });
      errorMessage = "";
      boardName = "";
      assigneeName = "";
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
          empty.textContent = "No assigned issues in this board.";
        }
        list.append(empty);
        return;
      }

      for (const issue of issues) {
        const row = document.createElement("li");
        row.className = "monday-issue-item";

        const link = document.createElement("a");
        link.className = "monday-issue-link";
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

        const top = document.createElement("div");
        top.className = "monday-issue-top";

        const title = document.createElement("span");
        title.className = "monday-issue-title";
        title.textContent = issue.title;

        const updated = document.createElement("span");
        updated.className = "monday-issue-updated";
        updated.textContent = issue.updatedLabel;

        top.append(title, updated);
        link.append(top);

        if (issue.groupTitle) {
          const group = document.createElement("p");
          group.className = "monday-issue-group";
          group.textContent = issue.groupTitle;
          link.append(group);
        }

        row.append(link);
        list.append(row);
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
        text = `${boardName || `Board ${cfg.boardId}`} ready`;
      }

      const nextAutoLabel = formatTimeLabel(nextAutoRunAt);
      if (!loading && nextAutoLabel && hasBoardConfig(cfg) && hasActiveConnection(cfg)) {
        text = `${text} · Next auto ${nextAutoLabel}`;
      }

      status.textContent = text;
      connectBtn.disabled = loading || !hasConnectorConfig(cfg);
      refreshBtn.disabled = loading || !hasBoardConfig(cfg) || !hasActiveConnection(cfg);
      disconnectBtn.disabled = loading || !connected;
    }

    function render() {
      applyOpenMondayButton();
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
        const peopleColumnId = resolvePeopleColumnId(cfg, context.peopleColumns);
        const assigned = await fetchAssignedIssues(cfg, context.meId, peopleColumnId, accessToken);

        if (requestId !== requestSerial) {
          return;
        }

        boardName = context.boardName;
        assigneeName = normalizeText(context.meName, "me");
        issues = assigned;
        hasFetched = true;
        lastSignature = configSignature(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }

        issues = [];
        hasFetched = false;
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

    connectBtn.addEventListener("click", () => {
      void connectAccount();
    });

    refreshBtn.addEventListener("click", () => {
      void loadIssues({ reason: "manual" });
    });

    disconnectBtn.addEventListener("click", () => {
      void disconnectAccount();
    });

    openMondayBtn.addEventListener("click", (event) => {
      if (!isEditMode?.()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openSettings?.();
    });

    const initialCfg = normalizedConfig(getConfig());
    lastSignature = configSignature(initialCfg);
    render();
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

          if (cfg.connectorUrl !== sessionConnectorUrl || (cfg.connectorUrl && !connected)) {
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
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
      }
    };
  }
};
