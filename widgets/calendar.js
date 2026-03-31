const GOOGLE_CALENDAR_HOST = "https://calendar.google.com";
const GOOGLE_CALENDAR_WEB_URL = `${GOOGLE_CALENDAR_HOST}/calendar/u/0/r`;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeAccountIndex(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 0, 9);
  }
  return clamp(Math.round(num), 0, 9);
}

function calendarAppBaseUrl(accountIndex) {
  return `${GOOGLE_CALENDAR_HOST}/calendar/u/${normalizeAccountIndex(accountIndex)}/r`;
}

function calendarSettingsUrl(accountIndex) {
  return `${calendarAppBaseUrl(accountIndex)}/settings`;
}

function calendarHomeUrl(accountIndex) {
  return calendarAppBaseUrl(accountIndex);
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

function normalizeRefreshMinutes(value, fallback = 30) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 240);
  }
  return clamp(Math.round(num), 1, 240);
}

function normalizeWeekStartsOn(value) {
  return normalizeText(value).toLowerCase() === "sunday" ? "sunday" : "monday";
}

function normalizeViewMode(value) {
  return normalizeText(value).toLowerCase() === "week" ? "week" : "month";
}

function normalizeIcsUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const normalized = text.replace(/^webcal:/i, "https:");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeEventLink(value, fallback = GOOGLE_CALENDAR_WEB_URL) {
  const text = normalizeText(value);
  if (!text) {
    return fallback;
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
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

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function unfoldIcsLines(rawText) {
  const normalized = String(rawText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sourceLines = normalized.split("\n");
  const out = [];

  for (const line of sourceLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
      continue;
    }
    out.push(line);
  }

  return out;
}

function parseIcsLine(line) {
  const colonIndex = line.indexOf(":");
  if (colonIndex <= 0) {
    return null;
  }

  const left = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [rawName, ...rawParams] = left.split(";");
  const name = normalizeText(rawName).toUpperCase();
  if (!name) {
    return null;
  }

  const params = {};
  for (const paramChunk of rawParams) {
    const equalIndex = paramChunk.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }
    const key = normalizeText(paramChunk.slice(0, equalIndex)).toUpperCase();
    if (!key) {
      continue;
    }
    const paramValue = normalizeText(paramChunk.slice(equalIndex + 1)).replace(/^"|"$/g, "");
    params[key] = paramValue;
  }

  return { name, params, value };
}

function unescapeIcsText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseDateParts(parts, utc = false) {
  const [year, month, day, hour = 0, minute = 0, second = 0] = parts.map((part) => Number(part));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  const date = utc
    ? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    : new Date(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date;
}

function buildDateInfo(date, allDay) {
  return {
    allDay,
    startDate: date,
    startTs: date.getTime(),
    dateKey: toLocalDateKey(date),
    dateLabel: date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short"
    }),
    timeLabel: allDay
      ? "All day"
      : date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit"
        })
  };
}

function parseIcsStartDate(rawValue, params = {}) {
  const value = normalizeText(rawValue);
  if (!value) {
    return null;
  }

  const valueType = normalizeText(params.VALUE).toUpperCase();
  if (valueType === "DATE" || /^\d{8}$/.test(value)) {
    const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) {
      return null;
    }
    const date = parseDateParts([match[1], match[2], match[3]]);
    if (!date) {
      return null;
    }
    return buildDateInfo(date, true);
  }

  let date = null;
  const utcMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    date = parseDateParts(utcMatch.slice(1), true);
  }

  if (!date) {
    const localMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (localMatch) {
      date = parseDateParts(localMatch.slice(1), false);
    }
  }

  if (!date) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      date = parsed;
    }
  }

  if (!date) {
    return null;
  }

  return buildDateInfo(date, false);
}

function parseIcsEvents(icsText, fallbackLink) {
  const lines = unfoldIcsLines(icsText);
  const rawEvents = [];
  let current = null;

  for (const line of lines) {
    const upper = normalizeText(line).toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (upper === "END:VEVENT") {
      if (current) {
        rawEvents.push(current);
      }
      current = null;
      continue;
    }
    if (!current) {
      continue;
    }

    const parsed = parseIcsLine(line);
    if (!parsed) {
      continue;
    }

    const { name, params, value } = parsed;
    if (!Object.prototype.hasOwnProperty.call(current, name)) {
      current[name] = { value, params };
    }
  }

  const events = [];
  let fallbackIndex = 0;
  for (const entry of rawEvents) {
    const status = normalizeText(entry.STATUS?.value).toUpperCase();
    if (status === "CANCELLED") {
      continue;
    }

    const start = parseIcsStartDate(entry.DTSTART?.value, entry.DTSTART?.params || {});
    if (!start) {
      continue;
    }

    const title = normalizeText(unescapeIcsText(entry.SUMMARY?.value), "(No title)");
    const location = normalizeText(unescapeIcsText(entry.LOCATION?.value));
    const id = normalizeText(unescapeIcsText(entry.UID?.value), `event-${fallbackIndex}`);
    const link = normalizeEventLink(unescapeIcsText(entry.URL?.value), fallbackLink);
    fallbackIndex += 1;

    events.push({
      id,
      title,
      location,
      link,
      allDay: start.allDay,
      startTs: start.startTs,
      dateKey: start.dateKey,
      dateLabel: start.dateLabel,
      timeLabel: start.timeLabel
    });
  }

  return events;
}

export function parseIcsEventsForContractTest(icsText, fallbackLink = GOOGLE_CALENDAR_WEB_URL) {
  return parseIcsEvents(icsText, fallbackLink);
}

function filterUpcomingEvents(events, daysAhead) {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rangeEnd = rangeStart + normalizeDaysAhead(daysAhead, 21) * 24 * 60 * 60 * 1000;

  return events.filter((event) => {
    if (!event || !Number.isFinite(event.startTs)) {
      return false;
    }
    return event.startTs >= rangeStart && event.startTs < rangeEnd;
  });
}

function normalizeFetchConfig(config) {
  return {
    accountIndex: normalizeAccountIndex(config?.accountIndex, 0),
    icsUrl: normalizeIcsUrl(config?.icsUrl),
    maxResults: normalizeMaxResults(config?.maxResults, 8),
    daysAhead: normalizeDaysAhead(config?.daysAhead, 21),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, 30),
    viewMode: normalizeViewMode(config?.viewMode),
    weekStartsOn: normalizeWeekStartsOn(config?.weekStartsOn),
    showLocation: config?.showLocation !== false,
    openInNewTab: config?.openInNewTab !== false
  };
}

function fetchSignature(config) {
  return `${config.accountIndex}|${config.icsUrl}|${config.maxResults}|${config.daysAhead}|${config.refreshMinutes}|${config.viewMode}|${config.weekStartsOn}|${config.showLocation ? 1 : 0}|${config.openInNewTab ? 1 : 0}`;
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
    accountIndex: 0,
    icsUrl: "",
    maxResults: 8,
    daysAhead: 21,
    refreshMinutes: 30,
    viewMode: "month",
    weekStartsOn: "monday",
    showLocation: true,
    openInNewTab: true
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
      key: "accountIndex",
      label: "Account index (u/N)",
      type: "number",
      min: 0,
      max: 9,
      step: 1,
      helpText: "Use 0 for the primary signed-in Google account (used for auto setup)."
    },
    {
      key: "icsUrl",
      label: "Calendar ICS URL",
      type: "url",
      placeholder: "https://calendar.google.com/calendar/ical/.../basic.ics",
      helpText: "Optional. Leave empty to auto-detect from your signed-in Google Calendar session."
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
      key: "refreshMinutes",
      label: "Refresh every (minutes)",
      type: "number",
      min: 1,
      max: 240,
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
    { key: "showLocation", label: "Show location", type: "checkbox" },
    { key: "openInNewTab", label: "Open event in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, patchConfig, isEditMode, openSettings }) {
    container.classList.add("calendar-widget");

    const shell = document.createElement("div");
    shell.className = "calendar-widget-shell";

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

    const status = document.createElement("p");
    status.className = "calendar-widget-status";

    shell.append(monthPanel, eventList, status);
    container.append(shell);

    let loading = false;
    let setupInProgress = false;
    let autoSetupAttempted = false;
    let errorMessage = "";
    let eventItems = [];
    let eventDayCountMap = new Map();
    let lastFetchSig = "";
    let requestSerial = 0;
    let viewDate = new Date();
    let timer = null;

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      const cfg = normalizeFetchConfig(getConfig());
      if (!cfg.icsUrl) {
        return;
      }
      timer = setTimeout(() => {
        void loadEvents();
      }, cfg.refreshMinutes * 60000);
    }

    function openCalendarPage() {
      const cfg = normalizeFetchConfig(getConfig());
      const href = cfg.icsUrl ? calendarHomeUrl(cfg.accountIndex) : calendarSettingsUrl(cfg.accountIndex);
      if (cfg.openInNewTab) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = href;
      }
    }

    function canSwitchAccount() {
      return typeof patchConfig === "function";
    }

    function switchAccount() {
      const cfg = normalizeFetchConfig(getConfig());
      const nextAccountIndex = (cfg.accountIndex + 1) % 10;
      const patch = {
        accountIndex: nextAccountIndex,
        icsUrl: ""
      };
      autoSetupAttempted = false;
      errorMessage = "";
      if (typeof patchConfig === "function") {
        patchConfig(patch);
      }
      void loadEvents();
      return nextAccountIndex;
    }

    function decodeCalendarPageText(rawText) {
      return String(rawText || "")
        .replace(/\\u003d/gi, "=")
        .replace(/\\u0026/gi, "&")
        .replace(/\\u002f/gi, "/")
        .replace(/\\\//g, "/")
        .replace(/&amp;/gi, "&");
    }

    function extractIcsUrlFromPage(rawText) {
      const decoded = decodeCalendarPageText(rawText);
      const matches = decoded.match(
        /(?:https?:\/\/|webcal:\/\/)calendar\.google\.com\/calendar\/ical\/[^"'\s<>]+\/(?:basic|full)\.ics/gi
      );
      if (!matches?.length) {
        return "";
      }

      const normalized = Array.from(new Set(matches.map((match) => normalizeIcsUrl(match)).filter(Boolean)));
      if (!normalized.length) {
        return "";
      }

      const privateFeed = normalized.find((url) => /\/private[-/]/i.test(url));
      return privateFeed || normalized[0];
    }

    function isCalendarLoginPage(responseUrl, bodyText) {
      const body = String(bodyText || "").toLowerCase();
      return (
        String(responseUrl || "").includes("accounts.google.com") ||
        body.includes("servicelogin") ||
        body.includes("interactive login")
      );
    }

    function settingsCandidateUrls(accountIndex) {
      const settingsUrl = calendarSettingsUrl(accountIndex);
      return [
        settingsUrl,
        `${settingsUrl}?tab=mc`,
        `${settingsUrl}/calendar`,
        `${settingsUrl}/calendar/primary`,
        `${settingsUrl}/export`
      ];
    }

    async function fetchCandidateIcsFromUrl(url) {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
        redirect: "follow"
      });
      const bodyText = await response.text();

      if (isCalendarLoginPage(response.url, bodyText)) {
        throw new Error("Google Calendar web session not found. Sign in to Calendar in this browser first.");
      }
      if (!response.ok) {
        return "";
      }

      return extractIcsUrlFromPage(bodyText);
    }

    async function autoSetupIcsFromSession() {
      const cfg = normalizeFetchConfig(getConfig());
      const candidates = Array.from(new Set(settingsCandidateUrls(cfg.accountIndex)));
      let lastError = null;

      for (const candidateUrl of candidates) {
        try {
          const found = await fetchCandidateIcsFromUrl(candidateUrl);
          if (!found) {
            continue;
          }
          if (typeof patchConfig === "function" && found !== cfg.icsUrl) {
            patchConfig({ icsUrl: found });
          }
          return found;
        } catch (error) {
          const message = normalizeErrorMessage(error).toLowerCase();
          if (message.includes("web session not found") || message.includes("sign in")) {
            throw error;
          }
          lastError = error;
        }
      }

      if (lastError) {
        throw lastError;
      }
      return "";
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
      const cells =
        cfg.viewMode === "week"
          ? weekCells(viewDate, cfg.weekStartsOn)
          : monthCells(viewDate, cfg.weekStartsOn);

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
      const calendarHomeHref = calendarHomeUrl(cfg.accountIndex);

      if (!eventItems.length) {
        const empty = document.createElement("li");
        empty.className = "calendar-event-empty";
        if (loading || setupInProgress) {
          empty.textContent = "Loading upcoming events...";
        } else if (!cfg.icsUrl) {
          empty.textContent = "Trying auto setup. If it fails, click Open Google Calendar once and press Refresh.";
        } else if (errorMessage) {
          empty.textContent = "Calendar feed is not available.";
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
        link.href = normalizeEventLink(event.link, calendarHomeHref);
        link.target = cfg.openInNewTab ? "_blank" : "_self";
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
      if (setupInProgress) {
        status.textContent = "Detecting Calendar ICS from your signed-in browser session...";
      } else if (loading) {
        status.textContent = "Syncing calendar feed...";
      } else if (errorMessage) {
        status.textContent = errorMessage;
      } else if (!cfg.icsUrl) {
        status.textContent = "Calendar auto setup pending";
      } else {
        status.textContent = `${eventItems.length} upcoming event${eventItems.length === 1 ? "" : "s"}`;
      }
    }

    function render() {
      renderStatus();
      renderCalendarPanel();
      renderEventList();
    }

    async function loadEvents() {
      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        let cfg = normalizeFetchConfig(getConfig());
        if (!cfg.icsUrl) {
          if (autoSetupAttempted) {
            throw new Error("Auto setup did not find ICS. Click Open Google Calendar once, then press Refresh.");
          }

          autoSetupAttempted = true;
          setupInProgress = true;
          render();

          try {
            const foundIcs = await autoSetupIcsFromSession();
            if (requestId !== requestSerial) {
              return;
            }
            if (!foundIcs) {
              throw new Error("Could not auto-detect ICS from Calendar settings.");
            }
            cfg = normalizeFetchConfig({
              ...getConfig(),
              icsUrl: foundIcs
            });
          } finally {
            if (requestId === requestSerial) {
              setupInProgress = false;
            }
          }
        }

        const response = await fetch(cfg.icsUrl, {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error(`Calendar feed request failed: HTTP ${response.status}`);
        }

        const icsText = await response.text();
        const calendarHomeHref = calendarHomeUrl(cfg.accountIndex);
        const parsedEvents = parseIcsEvents(icsText, calendarHomeHref);
        const upcoming = filterUpcomingEvents(parsedEvents, cfg.daysAhead).sort((a, b) => {
          if (a.startTs === b.startTs) {
            return a.title.localeCompare(b.title);
          }
          return a.startTs - b.startTs;
        });

        if (requestId !== requestSerial) {
          return;
        }

        eventItems = upcoming.slice(0, cfg.maxResults);
        eventDayCountMap = buildDayCountMap(upcoming);
        lastFetchSig = fetchSignature(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }

        eventItems = [];
        eventDayCountMap = new Map();
        errorMessage = normalizeErrorMessage(error);
      } finally {
        if (requestId !== requestSerial) {
          return;
        }

        loading = false;
        setupInProgress = false;
        render();
        scheduleRefresh();
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

    prevMonthBtn.addEventListener("click", () => {
      shiftPeriod(-1);
    });

    nextMonthBtn.addEventListener("click", () => {
      shiftPeriod(1);
    });

    const initialConfig = normalizeFetchConfig(getConfig());
    lastFetchSig = fetchSignature(initialConfig);
    render();
    void loadEvents();

    return {
      refresh() {
        const cfg = normalizeFetchConfig(getConfig());
        const nextSig = fetchSignature(cfg);

        if (!cfg.icsUrl) {
          clearRefreshTimer();
          eventItems = [];
          eventDayCountMap = new Map();
          errorMessage = "";
          lastFetchSig = nextSig;
          render();
          if (!loading && !setupInProgress && !autoSetupAttempted) {
            void loadEvents();
          }
          return;
        }

        autoSetupAttempted = false;
        render();
        if (!loading && nextSig !== lastFetchSig) {
          void loadEvents();
          return;
        }
        scheduleRefresh();
      },
      manualRefresh() {
        autoSetupAttempted = false;
        return loadEvents();
      },
      openCalendar() {
        openCalendarPage();
      },
      switchAccount() {
        return switchAccount();
      },
      canSwitchAccount() {
        return canSwitchAccount();
      },
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
      }
    };
  }
};
