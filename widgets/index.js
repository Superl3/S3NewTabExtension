import { widgetMetadata } from "./metadata.js";

const widgetLoaders = {
  clock: () => import("./clock.js").then((module) => module.clockWidget),
  search: () => import("./search.js").then((module) => module.searchWidget),
  aiChat: () => import("./aiChat.js").then((module) => module.aiChatWidget),
  bookmarks: () => import("./bookmarks.js").then((module) => module.bookmarksWidget),
  todo: () => import("./todo.js").then((module) => module.todoWidget),
  notes: () => import("./notes.js").then((module) => module.notesWidget),
  label: () => import("./label.js").then((module) => module.labelWidget),
  shortcut: () => import("./shortcut.js").then((module) => module.shortcutWidget),
  gmail: () => import("./gmail.js").then((module) => module.gmailWidget),
  rss: () => import("./rss.js").then((module) => module.rssWidget),
  calendar: () => import("./calendar.js").then((module) => module.calendarWidget),
  mondayAssigned: () => import("./mondayAssigned.js").then((module) => module.mondayAssignedWidget),
  mondayMeetingNote: () => import("./mondayMeetingNote.js").then((module) => module.mondayMeetingNoteWidget),
  githubPrList: () => import("./githubPrList.js").then((module) => module.githubPrListWidget),
  flexWorktime: () => import("./flexWorktime.js").then((module) => module.flexWorktimeWidget),
  flexWorktimeTimeline: () => import("./flexWorktimeTimeline.js").then((module) => module.flexWorktimeTimelineWidget),
  githubReviewInbox: () => import("./githubReviewInbox.js").then((module) => module.githubReviewInboxWidget),
  weather: () => import("./weather.js").then((module) => module.weatherWidget),
  container: () => import("./container.js").then((module) => module.containerWidget),
  codexUsage: () => import("./codexUsage.js").then((module) => module.codexUsageWidget)
};

function renderLazyWidgetStatus(container, message) {
  if (!container?.replaceChildren || !container?.ownerDocument?.createElement) {
    return;
  }
  const status = container.ownerDocument.createElement("div");
  status.className = "widget-lazy-status muted";
  status.textContent = message;
  container.replaceChildren(status);
}

function createLazyController(definition, context = {}) {
  let controller = null;
  let destroyed = false;
  let pendingRefresh = false;
  let pendingManualRefresh = false;
  const container = context.container;

  renderLazyWidgetStatus(container, "Loading widget...");

  definition.load()
    .then((loadedDefinition) => {
      if (destroyed) {
        return;
      }
      if (container?.replaceChildren) {
        container.replaceChildren();
      }
      controller = loadedDefinition.create?.(context) || {};
      if (destroyed) {
        controller?.destroy?.();
        controller = null;
        return;
      }
      if (pendingManualRefresh && typeof controller.manualRefresh === "function") {
        controller.manualRefresh();
      } else if ((pendingManualRefresh || pendingRefresh) && typeof controller.refresh === "function") {
        controller.refresh();
      }
      pendingRefresh = false;
      pendingManualRefresh = false;
    })
    .catch((error) => {
      console.warn(`Failed to load widget module: ${definition.type}`, error);
      if (!destroyed) {
        renderLazyWidgetStatus(container, "Widget failed to load.");
      }
    });

  return {
    refresh() {
      if (typeof controller?.refresh === "function") {
        controller.refresh();
        return;
      }
      pendingRefresh = true;
    },
    manualRefresh() {
      if (typeof controller?.manualRefresh === "function") {
        controller.manualRefresh();
        return;
      }
      pendingManualRefresh = true;
    },
    destroy() {
      destroyed = true;
      controller?.destroy?.();
      controller = null;
      pendingRefresh = false;
      pendingManualRefresh = false;
    }
  };
}

function createLazyWidgetDefinition(meta) {
  const loader = widgetLoaders[meta.type];
  let loadedDefinition = null;
  let loadPromise = null;

  return {
    ...meta,
    load() {
      if (loadedDefinition) {
        return Promise.resolve(loadedDefinition);
      }
      if (!loader) {
        return Promise.reject(new Error(`No widget loader registered for ${meta.type}`));
      }
      if (!loadPromise) {
        loadPromise = loader().then((definition) => {
          if (!definition || typeof definition.create !== "function") {
            throw new Error(`Widget module for ${meta.type} did not export a create function`);
          }
          loadedDefinition = definition;
          return loadedDefinition;
        });
      }
      return loadPromise;
    },
    create(context) {
      return createLazyController(this, context);
    }
  };
}

export const widgetRegistry = Object.fromEntries(
  widgetMetadata.map((meta) => [meta.type, createLazyWidgetDefinition(meta)])
);

export const widgetList = Object.values(widgetRegistry);

export const defaultWidgetType = widgetList[0]?.type || "clock";
