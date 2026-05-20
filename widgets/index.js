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
  geekNews: () => import("./rss.js").then((module) => module.geekNewsWidget),
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

function resolveLazyWidgetTarget(container) {
  return container?.closest?.(".widget-card") || container || null;
}

function isElementNearViewport(target, windowObj, margin = 240) {
  if (!target || target.nodeType !== 1 || typeof target.getBoundingClientRect !== "function") {
    return false;
  }

  const rect = target.getBoundingClientRect();
  if (!rect) {
    return false;
  }

  const width = Number(windowObj?.innerWidth) || Number(target.ownerDocument?.documentElement?.clientWidth) || 0;
  const height = Number(windowObj?.innerHeight) || Number(target.ownerDocument?.documentElement?.clientHeight) || 0;
  if (width <= 0 || height <= 0) {
    return true;
  }

  return (
    rect.right >= -margin &&
    rect.bottom >= -margin &&
    rect.left <= width + margin &&
    rect.top <= height + margin
  );
}

function runAfterCurrentRender(windowObj, callback) {
  let didRun = false;
  const runOnce = () => {
    if (didRun) {
      return;
    }
    didRun = true;
    callback();
  };

  if (typeof windowObj?.requestAnimationFrame === "function") {
    windowObj.requestAnimationFrame(runOnce);
    const timeout = typeof windowObj?.setTimeout === "function" ? windowObj.setTimeout.bind(windowObj) : setTimeout;
    timeout(runOnce, 120);
    return;
  }
  if (typeof queueMicrotask === "function") {
    queueMicrotask(runOnce);
    return;
  }
  setTimeout(runOnce, 0);
}

function createLazyController(definition, context = {}) {
  let controller = null;
  let destroyed = false;
  let loadStarted = false;
  let pendingRefresh = false;
  let pendingManualRefresh = false;
  let visibilityObserver = null;
  const container = context.container;

  renderLazyWidgetStatus(container, "Loading widget...");

  const cleanupVisibilityGate = () => {
    visibilityObserver?.disconnect?.();
    visibilityObserver = null;
  };

  const startLoad = () => {
    if (loadStarted || destroyed) {
      return;
    }
    loadStarted = true;
    cleanupVisibilityGate();

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
  };

  const waitUntilVisibleThenLoad = () => {
    const documentObj = container?.ownerDocument || null;
    const windowObj = documentObj?.defaultView || globalThis;
    const target = resolveLazyWidgetTarget(container);

    if (!target || target.nodeType !== 1 || typeof windowObj?.IntersectionObserver !== "function") {
      startLoad();
      return;
    }

    visibilityObserver = new windowObj.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
        startLoad();
      }
    }, {
      root: null,
      rootMargin: "240px"
    });

    runAfterCurrentRender(windowObj, () => {
      if (!destroyed && isElementNearViewport(target, windowObj)) {
        startLoad();
        return;
      }
      if (!destroyed && visibilityObserver) {
        visibilityObserver.observe(target);
      }
    });
  };

  waitUntilVisibleThenLoad();

  return {
    refresh() {
      if (typeof controller?.refresh === "function") {
        controller.refresh();
        return;
      }
      pendingRefresh = true;
      startLoad();
    },
    manualRefresh() {
      if (typeof controller?.manualRefresh === "function") {
        controller.manualRefresh();
        return;
      }
      pendingManualRefresh = true;
      startLoad();
    },
    refreshPosition() {
      controller?.refreshPosition?.();
    },
    destroy() {
      destroyed = true;
      cleanupVisibilityGate();
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
