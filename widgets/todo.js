import { dispatchAlarmNotification } from "../core/alarm/notification-dispatcher.js";
import { createAlarmRuntime } from "../core/alarm/alarm-runtime.js";

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

const REPEAT_VALUES = new Set(["none", "daily", "weekdays", "weekly"]);
const INTERVAL_VALUES = new Set(["off", "10m", "15m", "30m", "60m"]);
const REMINDER_VALUES = new Set(["none", "5m", "10m", "30m", "60m"]);
const MINUTE_MS = 60 * 1000;
const TODO_ALARM_TICK_MS = 30 * 1000;
const TODO_ALARM_DEDUPE_TTL_MS = 3 * 24 * 60 * MINUTE_MS;
const TODO_ALARM_MAX_CATCHUP_MS = 2 * 60 * MINUTE_MS;
const TODO_ALARM_RUNTIME_KEY = "__s3TodoAlarmRuntime";
const TODO_SWIPE_START_THRESHOLD_PX = 8;
const TODO_SWIPE_COLOR_START_RATIO = 0.3;
const TODO_SWIPE_DELETE_THRESHOLD_RATIO = 0.5;
const TODO_SWIPE_DELETE_ANIM_MS = 220;
const TODO_SWIPE_RESET_ANIM_MS = 180;
const TODO_SWIPE_RESET_CLICK_SUPPRESS_MS = 140;
const TODO_COMPLETE_ANIM_MS = 520;

const OPTION_MINUTES = {
  off: 0,
  none: 0,
  "5m": 5,
  "10m": 10,
  "15m": 15,
  "30m": 30,
  "60m": 60
};

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number.parseInt(yearPart, 10);
  const month = Number.parseInt(monthPart, 10);
  const day = Number.parseInt(dayPart, 10);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function addDays(date, count) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + count);
  return next;
}

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextDayStart(date) {
  return addDays(dayStart(date), 1);
}

function parseOptionMinutes(value) {
  return OPTION_MINUTES[value] || 0;
}

function resolveWidgetScopeId(container) {
  if (!(container instanceof Element)) {
    return "todo-global";
  }
  const scopeNode = container.closest("[data-widget-id]");
  const scopeId = scopeNode instanceof HTMLElement ? scopeNode.dataset.widgetId : "";
  return typeof scopeId === "string" && scopeId ? scopeId : "todo-global";
}

function canRunNotificationApi() {
  return typeof Notification !== "undefined";
}

function resolveNotificationPermission(notificationApi) {
  if (typeof notificationApi === "undefined") {
    return "unsupported";
  }
  return notificationApi.permission;
}

function buildAlarmEvents(item, scopeId, rangeStartMs, rangeEndMs) {
  if (!item || rangeEndMs <= rangeStartMs) {
    return [];
  }

  const alarm = normalizeAlarm(item.alarm);
  if (!alarm.time) {
    return [];
  }

  const [hourPart, minutePart] = alarm.time.split(":");
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);
  const reminderMinutes = parseOptionMinutes(alarm.reminderBefore);
  const intervalMinutes = parseOptionMinutes(alarm.interval);
  const startDate = addDays(dayStart(new Date(rangeStartMs)), -1);
  const endDate = dayStart(new Date(rangeEndMs));
  const events = [];

  for (let cursor = dayStart(startDate); cursor.getTime() <= endDate.getTime(); cursor = addDays(cursor, 1)) {
    const cycleDateKey = formatDateKey(cursor);
    const cursorDay = cursor.getDay();
    const weeklyDay = resolveItemWeeklyDay(item, new Date(rangeEndMs));
    const isCycleDate =
      alarm.repeat === "daily" ||
      (alarm.repeat === "weekdays" && cursorDay >= 1 && cursorDay <= 5) ||
      (alarm.repeat === "weekly" && weeklyDay !== null && weeklyDay === cursorDay) ||
      (alarm.repeat === "none" && alarm.singleDate === cycleDateKey);

    if (!isCycleDate) {
      continue;
    }

    if (isItemHiddenForCycle(item, cycleDateKey)) {
      continue;
    }

    const dueAt = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hour, minute, 0, 0).getTime();
    const cycleEnd = nextDayStart(cursor).getTime();

    if (reminderMinutes > 0) {
      const reminderAt = dueAt - reminderMinutes * MINUTE_MS;
      events.push({
        key: `${scopeId}|${item.id}|reminder|${reminderAt}`,
        at: reminderAt,
        title: "TODO reminder",
        body: `${item.text} (${reminderMinutes} min before)`
      });
    }

    events.push({
      key: `${scopeId}|${item.id}|due|${dueAt}`,
      at: dueAt,
      title: "TODO due",
      body: item.text
    });

    if (intervalMinutes > 0) {
      for (let intervalAt = dueAt + intervalMinutes * MINUTE_MS; intervalAt < cycleEnd; intervalAt += intervalMinutes * MINUTE_MS) {
        events.push({
          key: `${scopeId}|${item.id}|interval|${intervalAt}`,
          at: intervalAt,
          title: "TODO follow-up",
          body: item.text
        });
      }
    }
  }

  return events.filter((event) => event.at > rangeStartMs && event.at <= rangeEndMs);
}

export function createTodoAlarmRuntimeAdapterForTest(deps = {}) {
  const notificationApi = deps.notificationApi ?? globalThis.Notification;
  const dispatchNotification = typeof deps.dispatchNotification === "function" ? deps.dispatchNotification : dispatchAlarmNotification;

  return {
    listOwnerEvents(owner, rangeStartMs, rangeEndMs) {
      const items = typeof owner?.getItems === "function" ? owner.getItems() : [];
      return items.flatMap((item) => buildAlarmEvents(item, owner?.scopeId, rangeStartMs, rangeEndMs));
    },
    emitEvent(event) {
      if (resolveNotificationPermission(notificationApi) !== "granted") {
        return false;
      }
      dispatchNotification(event, { notificationApi });
      return true;
    }
  };
}

function createTodoAlarmRuntime() {
  return createAlarmRuntime({
    tickMs: TODO_ALARM_TICK_MS,
    dedupeTtlMs: TODO_ALARM_DEDUPE_TTL_MS,
    maxCatchupMs: TODO_ALARM_MAX_CATCHUP_MS,
    ...createTodoAlarmRuntimeAdapterForTest()
  });
}

function getTodoAlarmRuntime() {
  const root = globalThis;
  if (!root[TODO_ALARM_RUNTIME_KEY]) {
    root[TODO_ALARM_RUNTIME_KEY] = createTodoAlarmRuntime();
  }
  return root[TODO_ALARM_RUNTIME_KEY];
}

function normalizeAlarm(alarm) {
  const source = alarm && typeof alarm === "object" ? alarm : {};
  const repeat = typeof source.repeat === "string" && REPEAT_VALUES.has(source.repeat) ? source.repeat : "none";
  const interval = typeof source.interval === "string" && INTERVAL_VALUES.has(source.interval) ? source.interval : "off";
  const reminderBefore =
    typeof source.reminderBefore === "string" && REMINDER_VALUES.has(source.reminderBefore) ? source.reminderBefore : "none";
  const time = typeof source.time === "string" ? source.time.trim() : "";
  const timeValue = /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) ? time : "";
  const singleDate = parseDateKey(source.singleDate) ? source.singleDate : "";
  const weeklyDay = Number.isInteger(source.weeklyDay) && source.weeklyDay >= 0 && source.weeklyDay <= 6 ? source.weeklyDay : null;

  return {
    repeat,
    time: timeValue,
    interval,
    reminderBefore,
    singleDate,
    weeklyDay
  };
}

function normalizeItem(item) {
  const source = item && typeof item === "object" ? item : {};
  const id = typeof source.id === "string" && source.id ? source.id : uid();
  const text = typeof source.text === "string" ? source.text : "";
  const alarm = normalizeAlarm(source.alarm);
  const repeat = typeof source.repeat === "string" && REPEAT_VALUES.has(source.repeat) ? source.repeat : alarm.repeat;
  const completedCycle = parseDateKey(source.completedCycle) ? source.completedCycle : "";

  return {
    ...source,
    id,
    text,
    done: Boolean(source.done),
    repeat,
    hidden: Boolean(source.hidden),
    completedCycle,
    alarm
  };
}

function resolveItemRepeat(item) {
  if (item && typeof item.repeat === "string" && REPEAT_VALUES.has(item.repeat)) {
    return item.repeat;
  }
  return normalizeAlarm(item && item.alarm).repeat;
}

function resolveItemWeeklyDay(item, fallbackDate = null) {
  if (Number.isInteger(item?.weeklyDay) && item.weeklyDay >= 0 && item.weeklyDay <= 6) {
    return item.weeklyDay;
  }
  const alarm = normalizeAlarm(item && item.alarm);
  if (Number.isInteger(alarm.weeklyDay)) {
    return alarm.weeklyDay;
  }
  const completedCycleDate = parseDateKey(item?.completedCycle);
  if (completedCycleDate) {
    return completedCycleDate.getDay();
  }
  if (fallbackDate instanceof Date) {
    return fallbackDate.getDay();
  }
  return null;
}

function getActiveCycleDateKey(repeat, date, weeklyDay) {
  const dateKey = formatDateKey(date);
  if (repeat === "daily") {
    return dateKey;
  }
  if (repeat === "weekdays") {
    const day = date.getDay();
    return day >= 1 && day <= 5 ? dateKey : "";
  }
  if (repeat === "weekly") {
    return Number.isInteger(weeklyDay) && weeklyDay === date.getDay() ? dateKey : "";
  }
  return "";
}

function shouldHideItemInCurrentCycle(item, now) {
  if (!item || !item.hidden) {
    return false;
  }
  const repeat = resolveItemRepeat(item);
  if (repeat === "none") {
    return false;
  }
  const cycleDateKey = getActiveCycleDateKey(repeat, now, resolveItemWeeklyDay(item, now));
  if (!cycleDateKey) {
    return true;
  }
  return item.completedCycle === cycleDateKey;
}

function isItemHiddenForCycle(item, cycleDateKey) {
  if (!item || !item.hidden || !cycleDateKey) {
    return false;
  }
  return resolveItemRepeat(item) !== "none" && item.completedCycle === cycleDateKey;
}

function hasAlarmSettings(item) {
  const alarm = normalizeAlarm(item.alarm);
  return alarm.repeat !== "none" || Boolean(alarm.time) || alarm.interval !== "off" || alarm.reminderBefore !== "none";
}

function formatAlarmBadge(item) {
  if (!hasAlarmSettings(item)) {
    return "";
  }

  const alarm = normalizeAlarm(item.alarm);
  const repeatLabels = {
    daily: "Daily",
    weekdays: "Weekdays",
    weekly: "Weekly"
  };
  const chunks = [];

  if (alarm.repeat !== "none") {
    chunks.push(repeatLabels[alarm.repeat] || "Repeat");
  }
  if (alarm.time) {
    chunks.push(alarm.time);
  }

  if (chunks.length === 0) {
    return "Alarm set";
  }
  return `Alarm ${chunks.join(" ")}`;
}

export function buildTodoAlarmEventsForContractTest(item, scopeId, rangeStartMs, rangeEndMs) {
  return buildAlarmEvents(item, scopeId, rangeStartMs, rangeEndMs);
}

export const todoWidget = {
  type: "todo",
  title: "TODO",
  defaultConfig: {
    items: []
  },
  defaultLayout: {
    x: 40,
    y: 240,
    w: 370,
    h: 290
  },
  settingsSchema: [],
  create({ container, getConfig, patchConfig }) {
    const form = document.createElement("form");
    const input = document.createElement("input");
    const addBtn = document.createElement("button");
    const list = document.createElement("ul");

    form.className = "search-form";
    list.className = "todo-list";
    list.dataset.noPageSwipe = "true";
    list.dataset.noPageDrag = "true";

    input.type = "text";
    input.placeholder = "Add a task";
    addBtn.type = "submit";
    addBtn.className = "btn";
    addBtn.textContent = "Add";

    form.append(input, addBtn);
    container.append(form, list);

    let alarmOverlay = null;
    let alarmItemId = null;
    let alarmRepeatInput = null;
    let alarmTimeInput = null;
    let alarmIntervalInput = null;
    let alarmReminderInput = null;
    let alarmSaveBtn = null;
    let lastFocusedElement = null;
    const alarmRuntime = getTodoAlarmRuntime();
    const alarmRuntimeOwnerId = uid();
    const alarmScopeId = resolveWidgetScopeId(container);
    let activeSwipe = null;
    let suppressClickUntilMs = 0;
    const completionTimers = new Map();

    function getItems() {
      const cfg = getConfig();
      const rawItems = Array.isArray(cfg.items) ? cfg.items : [];
      return rawItems.map(normalizeItem);
    }

    function saveItems(items) {
      patchConfig({ items: items.map(normalizeItem) });
      alarmRuntime.kick();
    }

    function isOverlayOpen(overlay) {
      return overlay instanceof HTMLElement && (overlay.classList.contains("open") || overlay.getAttribute("aria-hidden") === "false");
    }

    function hasOtherOpenModalOverlay() {
      const overlays = document.querySelectorAll(
        ".widget-modal-overlay, #widgetModalOverlay, #addWidgetModalOverlay, #dockSettingsModalOverlay, #shortcutIconEditorOverlay, #widgetTitleRenameOverlay"
      );
      for (const overlay of overlays) {
        if (!(overlay instanceof HTMLElement) || overlay === alarmOverlay) {
          continue;
        }
        if (isOverlayOpen(overlay)) {
          return true;
        }
      }
      return false;
    }

    function syncAlarmModalInteractionLock(isOpen) {
      const appRoot = document.querySelector("#app");
      if (isOpen) {
        document.body.classList.add("modal-open");
        if (appRoot instanceof HTMLElement) {
          appRoot.setAttribute("inert", "");
        }
        return;
      }
      if (hasOtherOpenModalOverlay()) {
        return;
      }
      document.body.classList.remove("modal-open");
      if (appRoot instanceof HTMLElement) {
        appRoot.removeAttribute("inert");
      }
    }

    function ensureAlarmModal() {
      if (alarmOverlay) {
        return;
      }

      alarmOverlay = document.createElement("div");
      alarmOverlay.className = "widget-modal-overlay todo-alarm-modal-overlay";
      alarmOverlay.setAttribute("aria-hidden", "true");
      alarmOverlay.innerHTML = `
        <section class="widget-modal todo-alarm-modal" role="dialog" aria-modal="true" aria-label="Task Alarm">
          <header class="widget-modal-head">
            <div class="widget-modal-head-top">
              <h3>Task Alarm</h3>
            </div>
          </header>
          <div class="widget-modal-body">
            <form class="todo-alarm-form" novalidate>
              <label class="form-row">
                <span>Repeat</span>
                <select name="repeat" required>
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label class="form-row">
                <span>Completion time</span>
                <input name="time" type="time" />
              </label>
              <label class="form-row">
                <span>Notify interval</span>
                <select name="interval" required>
                  <option value="off">Off</option>
                  <option value="10m">Every 10 min</option>
                  <option value="15m">Every 15 min</option>
                  <option value="30m">Every 30 min</option>
                  <option value="60m">Every 60 min</option>
                </select>
              </label>
              <label class="form-row">
                <span>Reminder before</span>
                <select name="reminderBefore" required>
                  <option value="none">None</option>
                  <option value="5m">5 min before</option>
                  <option value="10m">10 min before</option>
                  <option value="30m">30 min before</option>
                  <option value="60m">60 min before</option>
                </select>
              </label>
            </form>
          </div>
          <footer class="widget-modal-actions">
            <button class="btn" type="button" data-alarm-modal-action="cancel">Cancel</button>
            <button class="btn btn-primary" type="button" data-alarm-modal-action="save">Save</button>
          </footer>
        </section>
      `;

      document.body.append(alarmOverlay);

      alarmRepeatInput = alarmOverlay.querySelector("select[name='repeat']");
      alarmTimeInput = alarmOverlay.querySelector("input[name='time']");
      alarmIntervalInput = alarmOverlay.querySelector("select[name='interval']");
      alarmReminderInput = alarmOverlay.querySelector("select[name='reminderBefore']");
      alarmSaveBtn = alarmOverlay.querySelector("button[data-alarm-modal-action='save']");

      const clearAlarmTimeValidity = () => {
        if (alarmTimeInput) {
          alarmTimeInput.setCustomValidity("");
        }
      };

      if (alarmRepeatInput) {
        alarmRepeatInput.addEventListener("change", clearAlarmTimeValidity);
      }
      if (alarmIntervalInput) {
        alarmIntervalInput.addEventListener("change", clearAlarmTimeValidity);
      }
      if (alarmReminderInput) {
        alarmReminderInput.addEventListener("change", clearAlarmTimeValidity);
      }
      if (alarmTimeInput) {
        alarmTimeInput.addEventListener("input", clearAlarmTimeValidity);
      }

      alarmOverlay.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        if (target === alarmOverlay) {
          closeAlarmModal();
          return;
        }

        const actionButton = target.closest("button[data-alarm-modal-action]");
        if (!actionButton) {
          return;
        }

        const { alarmModalAction } = actionButton.dataset;
        if (alarmModalAction === "close" || alarmModalAction === "cancel") {
          closeAlarmModal();
          return;
        }
        if (alarmModalAction === "save") {
          saveAlarmModal();
        }
      });
    }

    function onAlarmModalKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAlarmModal();
        return;
      }

      if (event.key !== "Tab" || !alarmOverlay || !alarmOverlay.classList.contains("open")) {
        return;
      }

      const modal = alarmOverlay.querySelector(".todo-alarm-modal");
      if (!(modal instanceof HTMLElement)) {
        return;
      }

      const focusable = Array.from(
        modal.querySelectorAll(
          "button:not([disabled]), [href], input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )
      ).filter((element) => element instanceof HTMLElement);

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeInModal = active instanceof Element && modal.contains(active);

      if (event.shiftKey) {
        if (!activeInModal || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeInModal || active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function openAlarmModal(itemId) {
      const item = getItems().find((entry) => entry.id === itemId);
      if (!item) {
        return;
      }

      ensureAlarmModal();
      alarmItemId = itemId;
      const alarm = normalizeAlarm(item.alarm);

      if (alarmRepeatInput) {
        alarmRepeatInput.value = alarm.repeat;
      }
      if (alarmTimeInput) {
        alarmTimeInput.value = alarm.time;
      }
      if (alarmIntervalInput) {
        alarmIntervalInput.value = alarm.interval;
      }
      if (alarmReminderInput) {
        alarmReminderInput.value = alarm.reminderBefore;
      }

      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      alarmOverlay.classList.add("open");
      alarmOverlay.setAttribute("aria-hidden", "false");
      document.addEventListener("keydown", onAlarmModalKeydown, true);
      syncAlarmModalInteractionLock(true);
      if (alarmTimeInput) {
        alarmTimeInput.focus();
      }
    }

    function closeAlarmModal() {
      if (!alarmOverlay) {
        return;
      }

      alarmItemId = null;
      alarmOverlay.classList.remove("open");
      alarmOverlay.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onAlarmModalKeydown, true);
      syncAlarmModalInteractionLock(false);

      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
      lastFocusedElement = null;
    }

    function saveAlarmModal() {
      if (!alarmItemId || !alarmSaveBtn || !alarmRepeatInput || !alarmTimeInput || !alarmIntervalInput || !alarmReminderInput) {
        return;
      }

      const requiresTime =
        alarmRepeatInput.value !== "none" || alarmIntervalInput.value !== "off" || alarmReminderInput.value !== "none";
      if (requiresTime && !alarmTimeInput.value) {
        alarmTimeInput.setCustomValidity("Completion time is required when repeat, notify interval, or reminder before is enabled.");
        alarmTimeInput.reportValidity();
        return;
      }
      alarmTimeInput.setCustomValidity("");

      const draftAlarm = normalizeAlarm({
        repeat: alarmRepeatInput.value,
        time: alarmTimeInput.value,
        interval: alarmIntervalInput.value,
        reminderBefore: alarmReminderInput.value
      });
      const now = new Date();
      if (draftAlarm.repeat === "none") {
        draftAlarm.singleDate = formatDateKey(now);
      } else {
        draftAlarm.singleDate = "";
      }
      if (draftAlarm.repeat === "weekly") {
        draftAlarm.weeklyDay = now.getDay();
      } else {
        draftAlarm.weeklyDay = null;
      }

      if (canRunNotificationApi() && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }

      const items = getItems();
      const nextItems = items.map((entry) => {
        if (entry.id !== alarmItemId) {
          return entry;
        }
        return {
          ...entry,
          repeat: draftAlarm.repeat,
          alarm: draftAlarm
        };
      });

      saveItems(nextItems);
      closeAlarmModal();
      render();
    }

    function render() {
      const items = getItems();
      const now = new Date();
      list.replaceChildren();

      for (const item of items) {
        if (shouldHideItemInCurrentCycle(item, now)) {
          continue;
        }

        const li = document.createElement("li");
        li.className = "todo-item";
        li.dataset.noPageSwipe = "true";
        li.dataset.noPageDrag = "true";
        li.dataset.id = item.id;
        li.tabIndex = 0;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = false;
        checkbox.dataset.action = "toggle";
        checkbox.dataset.id = item.id;
        checkbox.setAttribute("aria-label", "Mark task done");

        const text = document.createElement("span");
        text.className = "todo-text";
        text.textContent = item.text;

        const title = document.createElement("label");
        title.className = "todo-item-title";
        title.append(checkbox, text);

        const alarmBtn = document.createElement("button");
        alarmBtn.className = "todo-alarm-btn";
        alarmBtn.type = "button";
        alarmBtn.dataset.action = "alarm";
        alarmBtn.dataset.id = item.id;
        alarmBtn.setAttribute("aria-label", "Open alarm settings");
        alarmBtn.title = "Alarm settings";
        alarmBtn.innerHTML = `
          <svg class="icon todo-alarm-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="13" r="7"></circle>
            <path d="M12 13V9"></path>
            <path d="M12 13 15 15"></path>
            <path d="M8 3h8"></path>
            <path d="M12 3v3"></path>
          </svg>
        `;

        const actions = document.createElement("div");
        actions.className = "todo-item-actions";
        actions.append(alarmBtn);

        const top = document.createElement("div");
        top.className = "todo-item-top";
        top.append(title, actions);

        const badges = document.createElement("div");
        badges.className = "todo-item-badges";

        const alarmBadgeText = formatAlarmBadge(item);
        if (alarmBadgeText) {
          const alarmBadge = document.createElement("span");
          alarmBadge.className = "todo-item-badge is-alarm";
          alarmBadge.textContent = alarmBadgeText;
          badges.append(alarmBadge);
        }

        const content = document.createElement("div");
        content.className = "todo-swipe-content";
        content.append(top, badges);

        li.append(content);
        list.append(li);
      }
    }

    function getSwipeDeleteThreshold(li) {
      return Math.max(1, li.clientWidth * TODO_SWIPE_DELETE_THRESHOLD_RATIO);
    }

    function deleteItem(itemId, options = {}) {
      const { skipRender = false } = options;
      const completionTimer = completionTimers.get(itemId);
      if (completionTimer) {
        clearTimeout(completionTimer.timerId);
        completionTimers.delete(itemId);
      }
      const items = getItems();
      const nextItems = items.filter((entry) => entry.id !== itemId);
      if (nextItems.length === items.length) {
        return;
      }
      saveItems(nextItems);
      if (!skipRender) {
        render();
      }
    }

    function runCompletionAnimation(itemId, onComplete) {
      const existingTimer = completionTimers.get(itemId);
      if (existingTimer) {
        return;
      }

      const li = list.querySelector(`.todo-item[data-id="${itemId}"]`);
      if (!(li instanceof HTMLElement)) {
        onComplete();
        return;
      }

      li.classList.add("is-completing");
      li.setAttribute("aria-busy", "true");
      const checkbox = li.querySelector('input[data-action="toggle"]');
      if (checkbox instanceof HTMLInputElement) {
        checkbox.disabled = true;
      }

      const completionEntry = {
        onComplete,
        timerId: setTimeout(() => {
          const pending = completionTimers.get(itemId);
          if (!pending) {
            return;
          }
          completionTimers.delete(itemId);
          pending.onComplete({ skipRender: false });
        }, TODO_COMPLETE_ANIM_MS)
      };

      completionTimers.set(itemId, completionEntry);
    }

    function flushPendingCompletions() {
      for (const [itemId, completionEntry] of completionTimers.entries()) {
        clearTimeout(completionEntry.timerId);
        completionTimers.delete(itemId);
        completionEntry.onComplete({ skipRender: true });
      }
    }

    function resetSwipeVisual(li, content) {
      li.style.setProperty("--todo-swipe-x", "0px");
      li.style.setProperty("--todo-swipe-progress", "0");
      li.style.setProperty("--todo-swipe-color-progress", "0");
      li.classList.remove("is-swiping", "is-swipe-deleting");
      li.classList.add("is-swipe-returning");
      content.style.transform = "";
      setTimeout(() => {
        li.classList.remove("is-swipe-returning");
      }, TODO_SWIPE_RESET_ANIM_MS);
    }

    function applySwipeVisual(li, content, x, threshold) {
      const width = Math.max(1, li.clientWidth);
      const clampedX = Math.max(0, Math.min(x, width * 1.05));
      const progress = threshold > 0 ? Math.min(1, clampedX / threshold) : 0;
      const colorStartX = width * TODO_SWIPE_COLOR_START_RATIO;
      const colorRampRange = threshold - colorStartX;
      let colorProgress = 0;
      if (clampedX > colorStartX) {
        colorProgress =
          colorRampRange <= 0 ? 1 : Math.min(1, Math.max(0, (clampedX - colorStartX) / colorRampRange));
      }
      li.style.setProperty("--todo-swipe-x", `${clampedX}px`);
      li.style.setProperty("--todo-swipe-progress", progress.toFixed(3));
      li.style.setProperty("--todo-swipe-color-progress", colorProgress.toFixed(3));
      li.classList.add("is-swiping");
      content.style.transform = `translateX(${clampedX}px)`;
    }

    function clearActiveSwipe() {
      activeSwipe = null;
    }

    function isPointerPressed(event) {
      if (!(event instanceof PointerEvent)) {
        return false;
      }
      if (event.pointerType === "mouse") {
        return (event.buttons & 1) === 1;
      }
      return event.buttons !== 0 || event.pressure > 0;
    }

    function endSwipe(event, isCancel) {
      if (!activeSwipe || event.pointerId !== activeSwipe.pointerId) {
        return;
      }

      const swipe = activeSwipe;
      const { li, content, itemId } = swipe;
      if (li.hasPointerCapture(event.pointerId)) {
        li.releasePointerCapture(event.pointerId);
      }

      if (isCancel || !swipe.dragging) {
        resetSwipeVisual(li, content);
        clearActiveSwipe();
        return;
      }

      if (swipe.currentX >= swipe.threshold) {
        suppressClickUntilMs = Date.now() + 240;
        li.classList.remove("is-swiping", "is-swipe-returning");
        li.classList.add("is-swipe-deleting");
        const deleteX = Math.max(li.clientWidth + 24, swipe.currentX);
        li.style.setProperty("--todo-swipe-x", `${deleteX}px`);
        content.style.transform = `translateX(${deleteX}px)`;
        setTimeout(() => {
          deleteItem(itemId);
        }, TODO_SWIPE_DELETE_ANIM_MS);
      } else {
        suppressClickUntilMs = Date.now() + TODO_SWIPE_RESET_CLICK_SUPPRESS_MS;
        resetSwipeVisual(li, content);
      }

      clearActiveSwipe();
    }

    list.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (target.closest("input, button, select, textarea")) {
        return;
      }

      const li = target.closest(".todo-item");
      if (!(li instanceof HTMLElement)) {
        return;
      }
      if (li.classList.contains("is-completing")) {
        return;
      }
      const content = li.querySelector(".todo-swipe-content");
      if (!(content instanceof HTMLElement)) {
        return;
      }

      const itemId = li.dataset.id;
      if (!itemId) {
        return;
      }

      li.classList.remove("is-swipe-returning", "is-swipe-deleting", "is-swiping");
      li.style.setProperty("--todo-swipe-x", "0px");
      li.style.setProperty("--todo-swipe-progress", "0");
      li.style.setProperty("--todo-swipe-color-progress", "0");
      content.style.transform = "";
      li.setPointerCapture(event.pointerId);
      activeSwipe = {
        pointerId: event.pointerId,
        itemId,
        li,
        content,
        startX: event.clientX,
        startY: event.clientY,
        currentX: 0,
        dragging: false,
        threshold: getSwipeDeleteThreshold(li)
      };
    });

    list.addEventListener("pointermove", (event) => {
      if (!activeSwipe || event.pointerId !== activeSwipe.pointerId) {
        return;
      }

      if (!isPointerPressed(event)) {
        if (activeSwipe.li.hasPointerCapture(activeSwipe.pointerId)) {
          activeSwipe.li.releasePointerCapture(activeSwipe.pointerId);
        }
        resetSwipeVisual(activeSwipe.li, activeSwipe.content);
        clearActiveSwipe();
        return;
      }

      const dx = event.clientX - activeSwipe.startX;
      const dy = event.clientY - activeSwipe.startY;

      if (!activeSwipe.dragging) {
        if (Math.abs(dx) < TODO_SWIPE_START_THRESHOLD_PX && Math.abs(dy) < TODO_SWIPE_START_THRESHOLD_PX) {
          return;
        }
        if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
          if (activeSwipe.li.hasPointerCapture(event.pointerId)) {
            activeSwipe.li.releasePointerCapture(event.pointerId);
          }
          resetSwipeVisual(activeSwipe.li, activeSwipe.content);
          clearActiveSwipe();
          return;
        }
        activeSwipe.dragging = true;
      }

      event.preventDefault();
      activeSwipe.currentX = Math.max(0, dx);
      applySwipeVisual(activeSwipe.li, activeSwipe.content, activeSwipe.currentX, activeSwipe.threshold);
    });

    list.addEventListener("pointerup", (event) => {
      endSwipe(event, false);
    });

    list.addEventListener("pointercancel", (event) => {
      endSwipe(event, true);
    });

    list.addEventListener(
      "click",
      (event) => {
        if (Date.now() >= suppressClickUntilMs) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    list.addEventListener("keydown", (event) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (
        target.isContentEditable ||
        target.closest(
          "input, textarea, select, button, [contenteditable='true'], [contenteditable='plaintext-only'], [contenteditable='']"
        )
      ) {
        return;
      }

      const li = target.closest(".todo-item");
      if (!(li instanceof HTMLElement)) {
        return;
      }

      const itemId = li.dataset.id;
      if (!itemId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      deleteItem(itemId);
    });

    list.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (target.dataset.action !== "toggle") {
        return;
      }

      const itemId = target.dataset.id;
      if (!itemId) {
        return;
      }

      if (!target.checked) {
        target.checked = false;
        return;
      }

      runCompletionAnimation(itemId, ({ skipRender = false } = {}) => {
        const items = getItems();
        const selected = items.find((entry) => entry.id === itemId);
        if (!selected) {
          return;
        }

        const repeat = resolveItemRepeat(selected);
        if (repeat === "none") {
          deleteItem(itemId, { skipRender });
          return;
        }

        const now = new Date();
        const cycleDateKey = getActiveCycleDateKey(repeat, now, resolveItemWeeklyDay(selected, now)) || formatDateKey(now);
        const nextItems = items.map((entry) => {
          if (entry.id !== itemId) {
            return entry;
          }
          return {
            ...entry,
            done: false,
            hidden: true,
            completedCycle: cycleDateKey,
            repeat
          };
        });

        saveItems(nextItems);
        if (!skipRender) {
          render();
        }
      });
    });

    list.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const button = target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const itemId = button.dataset.id;
      if (!itemId) {
        return;
      }

      if (button.dataset.action === "alarm") {
        openAlarmModal(itemId);
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        return;
      }
      const items = getItems();
      const alarm = normalizeAlarm();
      saveItems([...items, { id: uid(), text, done: false, repeat: alarm.repeat, hidden: false, completedCycle: "", alarm }]);
      input.value = "";
      input.focus();
    });

    render();
    alarmRuntime.register(alarmRuntimeOwnerId, {
      scopeId: alarmScopeId,
      getItems
    });

    return {
      refresh: render,
      destroy() {
        alarmRuntime.unregister(alarmRuntimeOwnerId);
        flushPendingCompletions();
        closeAlarmModal();
        if (alarmOverlay) {
          alarmOverlay.remove();
          alarmOverlay = null;
        }
      }
    };
  }
};
