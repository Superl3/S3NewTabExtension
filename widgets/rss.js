import { arrayOrEmpty } from "../core/utils/array.js";
import { normalizeIntegerInRange } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import { formatLocalDateTimeLabel as formatDateLabel } from "./shared/dateLabels.js";
import {
  parseFeedXmlDocument,
  readAtomAlternateLink as atomLink,
  readFeedNodeText as nodeText
} from "./shared/feedXml.js";
import { normalizeComparableUrl, normalizeHttpUrl } from "./shared/linkUrls.js";

export const GEEK_NEWS_FEED_URL = "https://news.hada.io/rss/news";
const GEEK_NEWS_FETCH_URL = "https://feeds.feedburner.com/geeknews-feed";
const GEEK_NEWS_HTTP_FETCH_URL = "http://feeds.feedburner.com/geeknews-feed";
const BBC_WORLD_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";
const CUSTOM_FEED_PRESET = "custom";
const DEFAULT_FEED_PRESET = "geekNews";
const DEFAULT_FEED_URL = GEEK_NEWS_FEED_URL;

export const RSS_FEED_PRESETS = [
  {
    value: "geekNews",
    label: "GeekNews (news.hada.io)",
    feedUrl: GEEK_NEWS_FEED_URL,
    aliases: [GEEK_NEWS_FETCH_URL, GEEK_NEWS_HTTP_FETCH_URL],
    fallbackUrls: [GEEK_NEWS_FETCH_URL]
  },
  {
    value: "bbcWorld",
    label: "BBC World",
    feedUrl: BBC_WORLD_FEED_URL
  }
];

const RSS_FEED_PRESET_OPTIONS = [
  ...RSS_FEED_PRESETS.map(({ value, label }) => ({ value, label })),
  { value: CUSTOM_FEED_PRESET, label: "Custom URL" }
];

const RSS_SETTINGS_SCHEMA = [
  {
    key: "feedPreset",
    label: "Feed preset",
    type: "select",
    options: RSS_FEED_PRESET_OPTIONS
  },
  {
    key: "feedUrl",
    label: "Custom feed URL",
    type: "url",
    placeholder: "https://example.com/rss.xml",
    helpText: "Used when Feed preset is Custom URL."
  },
  {
    key: "maxItems",
    label: "Items to show",
    type: "number",
    min: 1,
    max: 30,
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
  { key: "showSummary", label: "Show summary", type: "checkbox" },
  { key: "openInNewTab", label: "Open in new tab", type: "checkbox" }
];

const PINNED_FEED_SETTINGS_SCHEMA = RSS_SETTINGS_SCHEMA.filter(
  (field) => field.key !== "feedPreset" && field.key !== "feedUrl"
);

function normalizeErrorMessage(error) {
  const fallback = "Feed is not available. Check the feed URL and try again.";
  if (!error) {
    return fallback;
  }
  const message = typeof error === "string" ? error : typeof error.message === "string" ? error.message : "";
  const text = normalizeText(message, fallback);
  const lower = text.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Feed is not reachable. Check the feed URL or browser network access.";
  }
  if (lower.includes("parse")) {
    return "Feed could not be read. Check that the URL points to an RSS or Atom feed.";
  }
  return text;
}

function feedPresetFromUrl(value) {
  const comparable = normalizeComparableUrl(value);
  if (!comparable) {
    return "";
  }
  return RSS_FEED_PRESETS.find((preset) => {
    const urls = [preset.feedUrl, ...arrayOrEmpty(preset.aliases)];
    return urls.some((url) => normalizeComparableUrl(url) === comparable);
  })?.value || "";
}

function feedUrlForPreset(value) {
  return RSS_FEED_PRESETS.find((preset) => preset.value === value)?.feedUrl || "";
}

function fallbackUrlsForPreset(value) {
  const fallbackUrls = RSS_FEED_PRESETS.find((preset) => preset.value === value)?.fallbackUrls;
  return arrayOrEmpty(fallbackUrls);
}

function normalizeFeedPreset(value, feedUrl, fallback = DEFAULT_FEED_PRESET) {
  const text = normalizeText(value);
  const inferred = feedPresetFromUrl(feedUrl);
  if (inferred) {
    return inferred;
  }
  if (text === CUSTOM_FEED_PRESET || feedUrlForPreset(text)) {
    return text;
  }
  return feedUrlForPreset(fallback) ? fallback : CUSTOM_FEED_PRESET;
}

function asFetchUrl(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("Feed URL is invalid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Feed URL must start with http or https.");
  }

  return parsed.href;
}

function uniqueUrls(values) {
  const seen = new Set();
  const urls = [];
  for (const value of values) {
    const comparable = normalizeComparableUrl(value);
    if (!comparable || seen.has(comparable)) {
      continue;
    }
    seen.add(comparable);
    urls.push(value);
  }
  return urls;
}

function stripHtml(value) {
  const html = normalizeText(value);
  if (!html) {
    return "";
  }
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return normalizeText(holder.textContent || holder.innerText || "");
}

function parseRssItem(node, index) {
  const title = normalizeText(nodeText(node, ["title"]), "(No title)");
  const link = normalizeText(nodeText(node, ["link"]));
  const pubDate = normalizeText(nodeText(node, ["pubDate", "published", "updated", "dc:date"]));
  const summary = stripHtml(nodeText(node, ["description", "content:encoded", "summary", "content"]));
  const id = normalizeText(nodeText(node, ["guid", "id"]), `${title}-${index}`);

  return {
    id,
    title,
    link,
    summary,
    dateLabel: formatDateLabel(pubDate)
  };
}

function parseAtomEntry(node, index) {
  const title = normalizeText(nodeText(node, ["title"]), "(No title)");
  const link = normalizeText(atomLink(node));
  const pubDate = normalizeText(nodeText(node, ["updated", "published", "dc:date"]));
  const summary = stripHtml(nodeText(node, ["summary", "content", "description"]));
  const id = normalizeText(nodeText(node, ["id"]), `${title}-${index}`);

  return {
    id,
    title,
    link,
    summary,
    dateLabel: formatDateLabel(pubDate)
  };
}

function parseFeedXml(xmlText) {
  const doc = parseFeedXmlDocument(xmlText, "Feed XML parse failed.");

  const channel = doc.getElementsByTagName("channel")[0];
  if (channel) {
    const feedTitle = normalizeText(nodeText(channel, ["title"]), "RSS Feed");
    const itemNodes = Array.from(channel.getElementsByTagName("item"));
    const items = itemNodes.map((node, index) => parseRssItem(node, index));
    return { feedTitle, items };
  }

  const feed = doc.getElementsByTagName("feed")[0];
  if (feed) {
    const feedTitle = normalizeText(nodeText(feed, ["title"]), "RSS Feed");
    const entryNodes = Array.from(feed.getElementsByTagName("entry"));
    const items = entryNodes.map((node, index) => parseAtomEntry(node, index));
    return { feedTitle, items };
  }

  throw new Error("Unsupported feed format.");
}

function normalizedConfig(config, defaults = {}) {
  const feedPreset = normalizeFeedPreset(
    config?.feedPreset,
    config?.feedUrl ?? defaults.feedUrl,
    defaults.feedPreset || DEFAULT_FEED_PRESET
  );
  const presetFeedUrl = feedUrlForPreset(feedPreset);

  return {
    feedPreset,
    feedUrl: presetFeedUrl || normalizeText(config?.feedUrl, defaults.feedUrl || DEFAULT_FEED_URL),
    maxItems: normalizeIntegerInRange(config?.maxItems, defaults.maxItems || 8, 1, 30),
    showSummary: config?.showSummary ?? defaults.showSummary ?? true,
    refreshMinutes: normalizeIntegerInRange(config?.refreshMinutes, defaults.refreshMinutes || 15, 1, 240),
    openInNewTab: config?.openInNewTab ?? defaults.openInNewTab ?? true
  };
}

function configSignature(config) {
  return `${config.feedPreset}|${config.feedUrl}|${config.maxItems}|${config.showSummary ? 1 : 0}|${config.refreshMinutes}|${config.openInNewTab ? 1 : 0}`;
}

export function resolveFeedFetchUrls(config, defaults = {}) {
  const cfg = normalizedConfig(config, defaults);
  return uniqueUrls([cfg.feedUrl, ...fallbackUrlsForPreset(cfg.feedPreset)]);
}

async function fetchFeedText(config) {
  const urls = resolveFeedFetchUrls(config);
  let lastError = null;

  for (const url of urls) {
    try {
      const fetchUrl = asFetchUrl(url);
      if (!fetchUrl) {
        throw new Error("Add a feed URL in widget settings before refreshing.");
      }

      const response = await fetch(fetchUrl, {
        cache: "no-store",
        headers: {
          Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5"
        },
        redirect: "follow"
      });
      if (!response.ok) {
        throw new Error(`Feed request failed: HTTP ${response.status}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Feed request failed.");
}

function createRssWidgetDefinition({
  type,
  title,
  feedPreset = feedPresetFromUrl(DEFAULT_FEED_URL) || DEFAULT_FEED_PRESET,
  feedUrl = DEFAULT_FEED_URL,
  maxItems = 8,
  showSummary = true,
  refreshMinutes = 15,
  openInNewTab = true,
  defaultLayout = {
    x: 40,
    y: 40,
    w: 430,
    h: 340
  },
  defaultGridSize = {
    w: 2,
    h: 2
  },
  settingsSchema = RSS_SETTINGS_SCHEMA,
  statusFallback = "RSS feed",
  openFeedLabel = "Open feed",
  variantClass = "",
  hiddenFromAddWidget = false
}) {
  const defaultConfig = {
    feedPreset,
    feedUrl,
    maxItems,
    showSummary,
    refreshMinutes,
    openInNewTab
  };

  return {
    type,
    title,
    defaultConfig,
    defaultLayout,
    defaultGridSize,
    settingsSchema,
    hiddenFromAddWidget,
    create({ container, getConfig, isEditMode, openSettings }) {
      container.classList.add("rss-widget");
      if (variantClass) {
        container.classList.add(variantClass);
      }

      const shell = document.createElement("div");
      shell.className = "rss-widget-shell";

      const toolbar = document.createElement("div");
      toolbar.className = "rss-widget-toolbar";

      const status = document.createElement("p");
      status.className = "rss-widget-status";

      const actions = document.createElement("div");
      actions.className = "rss-widget-actions";

      const refreshBtn = document.createElement("button");
      refreshBtn.type = "button";
      refreshBtn.className = "btn";
      refreshBtn.textContent = "Refresh";

      const openFeedBtn = document.createElement("a");
      openFeedBtn.className = "btn";
      openFeedBtn.textContent = openFeedLabel;
      openFeedBtn.rel = "noreferrer";

      actions.append(refreshBtn, openFeedBtn);
      toolbar.append(actions);

      const list = document.createElement("ul");
      list.className = "rss-feed-list";

      const footer = document.createElement("div");
      footer.className = "rss-widget-footer";
      footer.append(status);

      shell.append(toolbar, list, footer);
      container.append(shell);

      let feedTitle = title;
      let loading = false;
      let errorMessage = "";
      let items = [];
      let lastSignature = "";
      let timer = null;
      let requestSerial = 0;

      function clearRefreshTimer() {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }

      function scheduleRefresh() {
        clearRefreshTimer();
        const cfg = normalizedConfig(getConfig(), defaultConfig);
        const delayMs = normalizeIntegerInRange(cfg.refreshMinutes, 15, 1, 240) * 60000;
        timer = setTimeout(() => {
          void loadFeed();
        }, delayMs);
      }

      function applyOpenFeedButton() {
        const cfg = normalizedConfig(getConfig(), defaultConfig);
        const feedUrl = normalizeHttpUrl(cfg.feedUrl, defaultConfig.feedUrl);
        openFeedBtn.href = feedUrl;
        openFeedBtn.target = cfg.openInNewTab ? "_blank" : "_self";
      }

      function renderList() {
        list.replaceChildren();

        const cfg = normalizedConfig(getConfig(), defaultConfig);
        list.classList.toggle("is-empty", !items.length);
        if (!items.length) {
          const empty = document.createElement("li");
          empty.className = "rss-feed-empty";
          if (loading) {
            empty.textContent = "Loading feed...";
          } else if (errorMessage) {
            empty.textContent = "Feed is not available.";
          } else {
            empty.textContent = "No feed items found.";
          }
          list.append(empty);
          return;
        }

        for (const item of items) {
          const row = document.createElement("li");
          row.className = "rss-feed-item";

          const link = document.createElement("a");
          link.className = "rss-feed-link";
          const feedUrl = normalizeHttpUrl(cfg.feedUrl, defaultConfig.feedUrl);
          link.href = normalizeHttpUrl(item.link, feedUrl);
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
          top.className = "rss-feed-top";

          const title = document.createElement("span");
          title.className = "rss-feed-title";
          title.textContent = item.title;

          const date = document.createElement("span");
          date.className = "rss-feed-date";
          date.textContent = item.dateLabel;

          top.append(title, date);
          link.append(top);

          if (cfg.showSummary && item.summary) {
            const summary = document.createElement("p");
            summary.className = "rss-feed-summary";
            summary.textContent = item.summary;
            link.append(summary);
          }

          row.append(link);
          list.append(row);
        }
      }

      function renderStatus() {
        status.classList.toggle("is-error", Boolean(errorMessage));
        if (loading) {
          status.textContent = "Refreshing feed...";
        } else if (errorMessage) {
          status.textContent = errorMessage;
        } else if (items.length) {
          status.textContent = `${feedTitle} (${items.length})`;
        } else {
          status.textContent = statusFallback;
        }
        refreshBtn.disabled = loading;
      }

      function render() {
        applyOpenFeedButton();
        renderStatus();
        renderList();
      }

      async function loadFeed() {
        const requestId = ++requestSerial;
        loading = true;
        errorMessage = "";
        render();

        try {
          const cfg = normalizedConfig(getConfig(), defaultConfig);
          const xmlText = await fetchFeedText(cfg);
          const parsed = parseFeedXml(xmlText);

          if (requestId !== requestSerial) {
            return;
          }

          feedTitle = parsed.feedTitle;
          items = parsed.items.slice(0, cfg.maxItems);
          lastSignature = configSignature(cfg);
        } catch (error) {
          if (requestId !== requestSerial) {
            return;
          }
          items = [];
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
        void loadFeed();
      });

      openFeedBtn.addEventListener("click", (event) => {
        if (!isEditMode?.()) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        openSettings?.();
      });

      render();
      void loadFeed();

      return {
        refresh() {
          render();
          const signature = configSignature(normalizedConfig(getConfig(), defaultConfig));
          if (!loading && signature !== lastSignature) {
            void loadFeed();
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
}

export const rssWidget = createRssWidgetDefinition({
  type: "rss",
  title: "RSS Feed",
  feedPreset: DEFAULT_FEED_PRESET,
  feedUrl: DEFAULT_FEED_URL
});

export const geekNewsWidget = createRssWidgetDefinition({
  type: "geekNews",
  title: "GeekNews",
  feedPreset: DEFAULT_FEED_PRESET,
  feedUrl: GEEK_NEWS_FEED_URL,
  maxItems: 10,
  showSummary: true,
  refreshMinutes: 15,
  openInNewTab: true,
  defaultLayout: {
    x: 40,
    y: 40,
    w: 460,
    h: 360
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: PINNED_FEED_SETTINGS_SCHEMA,
  statusFallback: "GeekNews",
  openFeedLabel: "Open GeekNews",
  variantClass: "rss-widget--geek-news",
  hiddenFromAddWidget: true
});
