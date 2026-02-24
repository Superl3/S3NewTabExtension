const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_WEB_URL = "https://monday.com/";

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
    apiToken: normalizeText(config?.apiToken),
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
    config.apiToken,
    config.boardId,
    config.peopleColumnId,
    config.maxItems,
    config.workStartHour,
    config.workEndHour,
    config.openInNewTab ? 1 : 0
  ].join("|");
}

function hasRequiredConfig(config) {
  return Boolean(config.apiToken) && config.boardId > 0;
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

async function mondayFetchGraphql(apiToken, query) {
  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      Authorization: apiToken,
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
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Monday API response is empty.");
  }

  if (Array.isArray(payload.errors) && payload.errors.length) {
    const message = normalizeText(payload.errors[0]?.message, "Monday API request failed.");
    throw new Error(message);
  }

  return payload.data || {};
}

async function fetchContext(config) {
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

  const data = await mondayFetchGraphql(config.apiToken, query);
  const meId = Number(data?.me?.id);
  if (!Number.isFinite(meId) || meId <= 0) {
    throw new Error("Unable to read your Monday profile from the API token.");
  }

  const board = Array.isArray(data?.boards) ? data.boards[0] : null;
  if (!board) {
    throw new Error("Board not found or access denied for this token.");
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

async function fetchAssignedIssues(config, meId, peopleColumnId) {
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

  const data = await mondayFetchGraphql(config.apiToken, query);
  const rawItems = Array.isArray(data?.items_by_column_values)
    ? data.items_by_column_values
    : [];
  return mapAssignedIssues(rawItems, config.maxItems);
}

export const mondayAssignedWidget = {
  type: "mondayAssigned",
  title: "Monday Assigned Issues",
  defaultConfig: {
    apiToken: "",
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
      key: "apiToken",
      label: "Monday API token",
      type: "password",
      placeholder: "Your Monday API token"
    },
    {
      key: "boardId",
      label: "Board ID",
      type: "number",
      min: 1,
      step: 1
    },
    {
      key: "peopleColumnId",
      label: "People column ID",
      type: "text",
      placeholder: "Optional, ex: person"
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

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "btn";
    refreshBtn.textContent = "Refresh";

    const openMondayBtn = document.createElement("a");
    openMondayBtn.className = "btn";
    openMondayBtn.textContent = "Open Monday";
    openMondayBtn.rel = "noreferrer";

    actions.append(refreshBtn, openMondayBtn);
    toolbar.append(status, actions);

    const list = document.createElement("ul");
    list.className = "monday-issue-list";

    shell.append(toolbar, list);
    container.append(shell);

    let loading = false;
    let errorMessage = "";
    let boardName = "";
    let assigneeName = "";
    let issues = [];
    let hasFetched = false;
    let nextAutoRunAt = null;
    let lastSignature = "";
    let requestSerial = 0;
    let timer = null;

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

    function renderList() {
      list.replaceChildren();

      const cfg = normalizedConfig(getConfig());
      if (!issues.length) {
        const empty = document.createElement("li");
        empty.className = "monday-issue-empty";
        if (loading) {
          empty.textContent = "Loading assigned issues...";
        } else if (!hasRequiredConfig(cfg)) {
          empty.textContent = "Set Monday API token and board ID in widget settings.";
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
      } else if (!hasRequiredConfig(cfg)) {
        text = "Set API token and board ID";
      } else if (issues.length) {
        text = `${boardName || `Board ${cfg.boardId}`} · ${assigneeName || "me"} · ${issues.length} assigned`;
      } else if (hasFetched) {
        text = `${boardName || `Board ${cfg.boardId}`} · ${assigneeName || "me"} · 0 assigned`;
      } else {
        text = `${boardName || `Board ${cfg.boardId}`} ready`;
      }

      const nextAutoLabel = formatTimeLabel(nextAutoRunAt);
      if (!loading && nextAutoLabel) {
        text = `${text} · Next auto ${nextAutoLabel}`;
      }

      status.textContent = text;
      refreshBtn.disabled = loading || !hasRequiredConfig(cfg);
    }

    function render() {
      applyOpenMondayButton();
      renderStatus();
      renderList();
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      const cfg = normalizedConfig(getConfig());
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
      if (!hasRequiredConfig(cfg) || loading) {
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
        if (!hasRequiredConfig(cfg)) {
          throw new Error("Set Monday API token and board ID first.");
        }

        if (reason === "auto") {
          const now = new Date();
          const dueIndices = dueAutoSlotIndices(cfg, now);
          if (!dueIndices.length) {
            return;
          }
          persistAutoSlots(cfg, now, dueIndices);
        }

        const context = await fetchContext(cfg);
        const peopleColumnId = resolvePeopleColumnId(cfg, context.peopleColumns);
        const assigned = await fetchAssignedIssues(cfg, context.meId, peopleColumnId);

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
        errorMessage = normalizeErrorMessage(error);
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
        scheduleRefresh();
      }
    }

    refreshBtn.addEventListener("click", () => {
      void loadIssues({ reason: "manual" });
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
    if (shouldRunAutoNow()) {
      void loadIssues({ reason: "auto" });
    } else {
      scheduleRefresh();
    }

    return {
      refresh() {
        const cfg = normalizedConfig(getConfig());
        const nextSignature = configSignature(cfg);
        render();

        if (!loading && nextSignature !== lastSignature) {
          void loadIssues({ reason: "config" });
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
