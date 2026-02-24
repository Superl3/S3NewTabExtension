const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_CALENDAR_WEB_URL = "https://calendar.google.com/calendar/u/0/r";
const CALENDAR_AUTH_STORAGE_KEY = "s3newtab-calendar-auth-session-v1";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeMaxResults(value, fallback = 8) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 30);
  }
  return clamp(Math.round(num), 1, 30);
}

function normalizeDaysAhead(value, fallback = 21) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 90);
  }
  return clamp(Math.round(num), 1, 90);
}

function normalizeWeekStartsOn(value) {
  return normalizeText(value).toLowerCase() === "sunday" ? "sunday" : "monday";
}

function normalizeViewMode(value) {
  return normalizeText(value).toLowerCase() === "week" ? "week" : "month";
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
    text.includes("invalid token") ||
    text.includes("not authenticated") ||
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
    const stored = await chrome.storage.local.get(CALENDAR_AUTH_STORAGE_KEY);
    return normalizeStoredAuthSession(stored?.[CALENDAR_AUTH_STORAGE_KEY]);
  } catch {
    return null;
  }
}

async function saveStoredAuthSession(session) {
  await chrome.storage.local.set({
    [CALENDAR_AUTH_STORAGE_KEY]: {
      connectorUrl: normalizeConnectorUrl(session?.connectorUrl),
      accessToken: normalizeText(session?.accessToken),
      accountLabel: normalizeText(session?.accountLabel)
    }
  });
}

async function clearStoredAuthSession() {
  try {
    await chrome.storage.local.remove(CALENDAR_AUTH_STORAGE_KEY);
  } catch {
  }
}

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseEventStartInfo(start) {
  const dateTime = normalizeText(start?.dateTime);
  if (dateTime) {
    const parsed = new Date(dateTime);
    const timestamp = parsed.getTime();
    if (!Number.isFinite(timestamp)) {
      return null;
    }
    return {
      allDay: false,
      startDate: parsed,
      startTs: timestamp,
      dateKey: toLocalDateKey(parsed),
      dateLabel: parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        weekday: "short"
      }),
      timeLabel: parsed.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
      })
    };
  }

  const allDayDate = normalizeText(start?.date);
  if (!allDayDate) {
    return null;
  }

  const parsed = new Date(`${allDayDate}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) {
    return {
      allDay: true,
      startDate: null,
      startTs: Number.POSITIVE_INFINITY,
      dateKey: allDayDate,
      dateLabel: allDayDate,
      timeLabel: "All day"
    };
  }

  return {
    allDay: true,
    startDate: parsed,
    startTs: parsed.getTime(),
    dateKey: allDayDate,
    dateLabel: parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short"
    }),
    timeLabel: "All day"
  };
}

function normalizeFetchConfig(config) {
  return {
    connectorUrl: normalizeConnectorUrl(config?.connectorUrl),
    maxResults: normalizeMaxResults(config?.maxResults, 8),
    daysAhead: normalizeDaysAhead(config?.daysAhead, 21),
    viewMode: normalizeViewMode(config?.viewMode),
    weekStartsOn: normalizeWeekStartsOn(config?.weekStartsOn),
    showLocation: config?.showLocation !== false
  };
}

function fetchSignature(config) {
  return `${config.connectorUrl}|${config.maxResults}|${config.daysAhead}|${config.viewMode}|${config.weekStartsOn}|${config.showLocation ? 1 : 0}`;
}

function hasConnectorConfig(config) {
  return Boolean(normalizeConnectorUrl(config?.connectorUrl));
}

function buildEventsUrl(config) {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeMax = new Date(rangeStart.getTime() + normalizeDaysAhead(config.daysAhead, 21) * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams();
  params.set("timeMin", rangeStart.toISOString());
  params.set("timeMax", timeMax.toISOString());
  params.set("maxResults", String(normalizeMaxResults(config.maxResults, 8)));
  params.set("singleEvents", "true");
  params.set("orderBy", "startTime");
  params.set("showDeleted", "false");

  const timezone = normalizeText(Intl.DateTimeFormat().resolvedOptions().timeZone);
  if (timezone) {
    params.set("timeZone", timezone);
  }

  return `${CALENDAR_API_BASE}?${params.toString()}`;
}

async function calendarFetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const body = normalizeText(await response.text());
  if (!response.ok) {
    const error = new Error(body || `HTTP ${response.status}`);
    if (response.status === 401 || response.status === 403 || isAuthErrorMessage(body)) {
      error.code = "auth";
    }
    throw error;
  }

  return body ? JSON.parse(body) : {};
}

function mapCalendarEvent(entry) {
  const status = normalizeText(entry?.status).toLowerCase();
  if (status === "cancelled") {
    return null;
  }

  const start = parseEventStartInfo(entry?.start || {});
  if (!start) {
    return null;
  }

  return {
    id: normalizeText(entry?.id),
    title: normalizeText(entry?.summary, "(No title)"),
    location: normalizeText(entry?.location),
    link: normalizeText(entry?.htmlLink, GOOGLE_CALENDAR_WEB_URL),
    allDay: start.allDay,
    startTs: start.startTs,
    dateKey: start.dateKey,
    dateLabel: start.dateLabel,
    timeLabel: start.timeLabel
  };
}

async function fetchUpcomingEvents(config, token) {
  const data = await calendarFetchJson(buildEventsUrl(config), token);
  const items = Array.isArray(data?.items) ? data.items : [];
  const mapped = items
    .map(mapCalendarEvent)
    .filter(Boolean);

  mapped.sort((a, b) => {
    if (a.startTs === b.startTs) {
      return a.title.localeCompare(b.title);
    }
    return a.startTs - b.startTs;
  });

  return mapped;
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function weekLabels(weekStartsOn) {
  if (weekStartsOn === "sunday") {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  }
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

function monthCells(viewMonthDate, weekStartsOn) {
  const first = monthStart(viewMonthDate);
  const firstDay = first.getDay();
  const offset = weekStartsOn === "sunday" ? firstDay : (firstDay + 6) % 7;
  const gridStart = addDays(first, -offset);
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    cells.push({
      date,
      key: toLocalDateKey(date),
      inMonth: date.getMonth() === viewMonthDate.getMonth()
    });
  }

  return cells;
}

function weekStart(date, weekStartsOn) {
  const anchor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = anchor.getDay();
  const offset = weekStartsOn === "sunday" ? day : (day + 6) % 7;
  return addDays(anchor, -offset);
}

function weekCells(anchorDate, weekStartsOn) {
  const start = weekStart(anchorDate, weekStartsOn);
  const cells = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(start, i);
    cells.push({
      date,
      key: toLocalDateKey(date),
      inMonth: true
    });
  }
  return cells;
}

function formatWeekRangeLabel(anchorDate, weekStartsOn) {
  const start = weekStart(anchorDate, weekStartsOn);
  const end = addDays(start, 6);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" })
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  return `${startLabel} - ${endLabel}`;
}

function buildDayCountMap(events) {
  const map = new Map();
  for (const event of events) {
    const key = normalizeText(event?.dateKey);
    if (!key) {
      continue;
    }
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

export const calendarWidget = {
  type: "calendar",
  title: "Calendar",
  defaultConfig: {
    connectorUrl: "",
    maxResults: 8,
    daysAhead: 21,
    viewMode: "month",
    weekStartsOn: "monday",
    showLocation: true
  },
  defaultLayout: {
    x: 1060,
    y: 80,
    w: 460,
    h: 420
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
      placeholder: "https://your-backend.example.com/api/google/oauth/start",
      helpText: "Connector should redirect with access_token and optional account/email/user."
    },
    {
      key: "maxResults",
      label: "Upcoming event count",
      type: "number",
      min: 1,
      max: 30,
      step: 1
    },
    {
      key: "daysAhead",
      label: "Look ahead (days)",
      type: "number",
      min: 1,
      max: 90,
      step: 1
    },
    {
      key: "viewMode",
      label: "Calendar view",
      type: "select",
      options: [
        { value: "month", label: "Monthly" },
        { value: "week", label: "Weekly" }
      ]
    },
    {
      key: "weekStartsOn",
      label: "Week starts on",
      type: "select",
      options: [
        { value: "monday", label: "Monday" },
        { value: "sunday", label: "Sunday" }
      ]
    },
    { key: "showLocation", label: "Show location", type: "checkbox" }
  ],
  create({ container, getConfig, isEditMode, openSettings }) {
    container.classList.add("calendar-widget");

    const shell = document.createElement("div");
    shell.className = "calendar-widget-shell";

    const toolbar = document.createElement("div");
    toolbar.className = "calendar-widget-toolbar";

    const status = document.createElement("p");
    status.className = "calendar-widget-status";

    const actions = document.createElement("div");
    actions.className = "calendar-widget-actions";

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

    const openCalendar = document.createElement("a");
    openCalendar.className = "btn";
    openCalendar.textContent = "Open Google Calendar";
    openCalendar.href = GOOGLE_CALENDAR_WEB_URL;
    openCalendar.target = "_blank";
    openCalendar.rel = "noreferrer";

    actions.append(connectBtn, refreshBtn, disconnectBtn, openCalendar);
    toolbar.append(status, actions);

    const monthPanel = document.createElement("section");
    monthPanel.className = "calendar-month-panel";

    const monthHead = document.createElement("div");
    monthHead.className = "calendar-month-head";

    const prevMonthBtn = document.createElement("button");
    prevMonthBtn.type = "button";
    prevMonthBtn.className = "btn calendar-month-nav";
    prevMonthBtn.textContent = "<";
    prevMonthBtn.title = "Previous month";

    const monthTitle = document.createElement("p");
    monthTitle.className = "calendar-month-title";

    const nextMonthBtn = document.createElement("button");
    nextMonthBtn.type = "button";
    nextMonthBtn.className = "btn calendar-month-nav";
    nextMonthBtn.textContent = ">";
    nextMonthBtn.title = "Next month";

    monthHead.append(prevMonthBtn, monthTitle, nextMonthBtn);

    const weekdayRow = document.createElement("div");
    weekdayRow.className = "calendar-weekdays";

    const monthGrid = document.createElement("div");
    monthGrid.className = "calendar-grid";

    monthPanel.append(monthHead, weekdayRow, monthGrid);

    const eventList = document.createElement("ul");
    eventList.className = "calendar-event-list";

    shell.append(toolbar, monthPanel, eventList);
    container.append(shell);

    let loading = false;
    let connected = false;
    let accountLabel = "";
    let accessToken = "";
    let sessionConnectorUrl = "";
    let errorMessage = "";
    let eventItems = [];
    let eventDayCountMap = new Map();
    let lastFetchSig = "";
    let requestSerial = 0;
    let viewDate = new Date();
    let sessionSyncSerial = 0;

    function hasActiveConnection(config) {
      const connectorUrl = normalizeConnectorUrl(config?.connectorUrl);
      return (
        connected &&
        Boolean(accessToken) &&
        Boolean(sessionConnectorUrl) &&
        connectorUrl === sessionConnectorUrl
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
      const cfg = normalizeFetchConfig(getConfig());
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
        const redirectUri = chrome.identity.getRedirectURL("calendar-auth");
        const startUrl = buildAuthConnectorStartUrl(cfg.connectorUrl, redirectUri, state, "google-calendar");
        const callbackUrl = await chrome.identity.launchWebAuthFlow({
          url: startUrl,
          interactive: true
        });

        const result = parseAuthFlowResult(callbackUrl);
        if (result.error || result.errorDescription) {
          throw new Error(result.errorDescription || result.error || "Google Calendar connection failed.");
        }
        if (result.state && result.state !== state) {
          throw new Error("Google Calendar connection failed (invalid state).");
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
      } catch (error) {
        await clearConnectionState({ clearStored: true });
        const message = normalizeErrorMessage(error);
        if (isAuthCancelledMessage(message)) {
          errorMessage = "Google Calendar connection was cancelled.";
        } else {
          errorMessage = message;
        }
      } finally {
        loading = false;
        render();
      }

      if (connected) {
        void loadEvents(false);
      }
    }

    function renderCalendarPanel() {
      const cfg = normalizeFetchConfig(getConfig());
      const todayKey = toLocalDateKey(new Date());

      if (cfg.viewMode === "week") {
        monthTitle.textContent = formatWeekRangeLabel(viewDate, cfg.weekStartsOn);
        prevMonthBtn.title = "Previous week";
        nextMonthBtn.title = "Next week";
      } else {
        const currentMonth = monthStart(viewDate);
        monthTitle.textContent = currentMonth.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long"
        });
        prevMonthBtn.title = "Previous month";
        nextMonthBtn.title = "Next month";
      }

      weekdayRow.replaceChildren();
      for (const label of weekLabels(cfg.weekStartsOn)) {
        const day = document.createElement("span");
        day.className = "calendar-weekday";
        day.textContent = label;
        weekdayRow.append(day);
      }

      monthGrid.replaceChildren();
      const cells = cfg.viewMode === "week" ? weekCells(viewDate, cfg.weekStartsOn) : monthCells(viewDate, cfg.weekStartsOn);
      for (const cellData of cells) {
        const cell = document.createElement("div");
        cell.className = "calendar-day";
        if (cfg.viewMode === "month" && !cellData.inMonth) {
          cell.classList.add("is-outside");
        }
        if (cellData.key === todayKey) {
          cell.classList.add("is-today");
        }

        const eventCount = eventDayCountMap.get(cellData.key) || 0;
        if (eventCount > 0) {
          cell.classList.add("has-events");
        }

        const dayNum = document.createElement("span");
        dayNum.className = "calendar-day-num";
        dayNum.textContent = String(cellData.date.getDate());
        cell.append(dayNum);

        if (eventCount > 0) {
          const marker = document.createElement("span");
          marker.className = "calendar-day-dot";
          marker.textContent = eventCount > 9 ? "9+" : String(eventCount);
          cell.append(marker);
        }

        monthGrid.append(cell);
      }
    }

    function renderEventList() {
      eventList.replaceChildren();
      const cfg = normalizeFetchConfig(getConfig());

      if (!eventItems.length) {
        const empty = document.createElement("li");
        empty.className = "calendar-event-empty";
        if (loading) {
          empty.textContent = "Loading upcoming events...";
        } else if (!hasConnectorConfig(cfg)) {
          empty.textContent = "Set auth connector URL in widget settings to enable Google Calendar connection.";
        } else if (!hasActiveConnection(cfg)) {
          empty.textContent = "Connect Google Calendar to show upcoming events.";
        } else {
          empty.textContent = "No upcoming events in this range.";
        }
        eventList.append(empty);
        return;
      }

      for (const event of eventItems) {
        const row = document.createElement("li");
        row.className = "calendar-event-item";

        const link = document.createElement("a");
        link.className = "calendar-event-link";
        link.href = event.link || GOOGLE_CALENDAR_WEB_URL;
        link.target = "_blank";
        link.rel = "noreferrer";

        link.addEventListener("click", (ev) => {
          if (!isEditMode?.()) {
            return;
          }
          ev.preventDefault();
          ev.stopPropagation();
          openSettings?.();
        });

        const top = document.createElement("div");
        top.className = "calendar-event-top";

        const title = document.createElement("span");
        title.className = "calendar-event-title";
        title.textContent = event.title;

        const time = document.createElement("span");
        time.className = "calendar-event-time";
        time.textContent = event.timeLabel;

        top.append(title, time);

        const date = document.createElement("p");
        date.className = "calendar-event-date";
        date.textContent = event.dateLabel;

        link.append(top, date);

        if (cfg.showLocation && event.location) {
          const location = document.createElement("p");
          location.className = "calendar-event-location";
          location.textContent = event.location;
          link.append(location);
        }

        row.append(link);
        eventList.append(row);
      }
    }

    function renderStatus() {
      const cfg = normalizeFetchConfig(getConfig());
      status.classList.toggle("is-error", Boolean(errorMessage));
      if (loading) {
        status.textContent = "Syncing Google Calendar...";
      } else if (errorMessage) {
        status.textContent = errorMessage;
      } else if (!hasConnectorConfig(cfg)) {
        status.textContent = "Set auth connector URL";
      } else if (connected) {
        status.textContent = accountLabel || "Connected";
      } else {
        status.textContent = "Google Calendar not connected";
      }

      connectBtn.disabled = loading || !hasConnectorConfig(cfg);
      refreshBtn.disabled = loading || !hasActiveConnection(cfg);
      disconnectBtn.disabled = loading || !connected;
    }

    function render() {
      renderStatus();
      renderCalendarPanel();
      renderEventList();
    }

    async function disconnectAccount() {
      loading = true;
      render();
      await clearConnectionState({ clearStored: true });
      errorMessage = "";
      eventItems = [];
      eventDayCountMap = new Map();
      loading = false;
      render();
    }

    async function loadEvents(interactive) {
      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        const cfg = normalizeFetchConfig(getConfig());
        if (!hasConnectorConfig(cfg)) {
          throw new Error("Set auth connector URL first.");
        }
        if (!hasActiveConnection(cfg)) {
          throw new Error("Connect Google Calendar first.");
        }

        const token = normalizeText(accessToken);
        if (!token) {
          throw new Error("Missing connector access token.");
        }

        const upcoming = await fetchUpcomingEvents(cfg, token);

        if (requestId !== requestSerial) {
          return;
        }

        connected = true;
        eventItems = upcoming;
        eventDayCountMap = buildDayCountMap(upcoming);
        lastFetchSig = fetchSignature(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }

        if (error?.code === "auth") {
          await clearConnectionState({ clearStored: true });
          eventItems = [];
          eventDayCountMap = new Map();
          errorMessage = "Session expired. Connect Google Calendar again.";
          return;
        }

        const message = normalizeErrorMessage(error);
        if (interactive && isAuthCancelledMessage(message)) {
          errorMessage = "Google Calendar connection was cancelled.";
        } else {
          errorMessage = message;
        }
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
      }
    }

    function shiftPeriod(offset) {
      const cfg = normalizeFetchConfig(getConfig());
      if (cfg.viewMode === "week") {
        viewDate = addDays(viewDate, offset * 7);
      } else {
        viewDate = monthStart(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
      }
      renderCalendarPanel();
    }

    connectBtn.addEventListener("click", () => {
      void connectAccount();
    });

    refreshBtn.addEventListener("click", () => {
      void loadEvents(false);
    });

    disconnectBtn.addEventListener("click", () => {
      void disconnectAccount();
    });

    openCalendar.addEventListener("click", (event) => {
      if (!isEditMode?.()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openSettings?.();
    });

    prevMonthBtn.addEventListener("click", () => {
      shiftPeriod(-1);
    });

    nextMonthBtn.addEventListener("click", () => {
      shiftPeriod(1);
    });

    const initialFetchConfig = normalizeFetchConfig(getConfig());
    lastFetchSig = fetchSignature(initialFetchConfig);
    render();
    void syncStoredSessionForConfig(getConfig()).finally(() => {
      render();
      if (hasActiveConnection(getConfig())) {
        void loadEvents(false);
      }
    });

    return {
      refresh() {
        const cfg = getConfig();
        const nextConfig = normalizeFetchConfig(cfg);
        const nextSig = fetchSignature(nextConfig);
        render();

        if (!loading) {
          const connectorUrl = normalizeConnectorUrl(cfg.connectorUrl);
          if (connectorUrl !== sessionConnectorUrl || (connectorUrl && !connected)) {
            void syncStoredSessionForConfig(cfg).finally(() => {
              render();
            });
            return;
          }
        }

        if (connected && !loading && nextSig !== lastFetchSig) {
          void loadEvents(false);
        }
      },
      destroy() {
        requestSerial += 1;
      }
    };
  }
};
