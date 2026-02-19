const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeMaxItems(value, fallback = 8) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 30);
  }
  return clamp(Math.round(num), 1, 30);
}

function normalizeRefreshMinutes(value, fallback = 15) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 240);
  }
  return clamp(Math.round(num), 1, 240);
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

function nodeText(parent, tagNames = []) {
  if (!parent) {
    return "";
  }

  for (const tagName of tagNames) {
    const nodes = parent.getElementsByTagName(tagName);
    if (!nodes.length) {
      continue;
    }
    const text = normalizeText(nodes[0]?.textContent);
    if (text) {
      return text;
    }
  }
  return "";
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

function atomLink(entry) {
  const links = Array.from(entry?.getElementsByTagName("link") || []);
  let fallback = "";

  for (const linkNode of links) {
    const href = normalizeText(linkNode.getAttribute("href"));
    if (!href) {
      continue;
    }
    if (!fallback) {
      fallback = href;
    }
    const rel = normalizeText(linkNode.getAttribute("rel")).toLowerCase();
    if (!rel || rel === "alternate") {
      return href;
    }
  }

  return fallback;
}

function formatDateLabel(rawDate) {
  const parsed = Date.parse(rawDate);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toLocaleString();
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
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Feed XML parse failed.");
  }

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

function normalizedConfig(config) {
  return {
    feedUrl: normalizeText(config?.feedUrl, DEFAULT_FEED_URL),
    maxItems: normalizeMaxItems(config?.maxItems, 8),
    showSummary: config?.showSummary !== false,
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, 15),
    openInNewTab: config?.openInNewTab !== false
  };
}

function configSignature(config) {
  return `${config.feedUrl}|${config.maxItems}|${config.showSummary ? 1 : 0}|${config.refreshMinutes}|${config.openInNewTab ? 1 : 0}`;
}

export const rssWidget = {
  type: "rss",
  title: "RSS Feed",
  defaultConfig: {
    feedUrl: DEFAULT_FEED_URL,
    maxItems: 8,
    showSummary: true,
    refreshMinutes: 15,
    openInNewTab: true
  },
  defaultLayout: {
    x: 40,
    y: 40,
    w: 430,
    h: 340
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [
    {
      key: "feedUrl",
      label: "Feed URL",
      type: "url",
      placeholder: "https://example.com/rss.xml"
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
  ],
  create({ container, getConfig, isEditMode, openSettings }) {
    container.classList.add("rss-widget");

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
    openFeedBtn.textContent = "Open feed";
    openFeedBtn.rel = "noreferrer";

    actions.append(refreshBtn, openFeedBtn);
    toolbar.append(status, actions);

    const list = document.createElement("ul");
    list.className = "rss-feed-list";

    shell.append(toolbar, list);
    container.append(shell);

    let feedTitle = "RSS Feed";
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
      const cfg = normalizedConfig(getConfig());
      const delayMs = normalizeRefreshMinutes(cfg.refreshMinutes, 15) * 60000;
      timer = setTimeout(() => {
        void loadFeed();
      }, delayMs);
    }

    function applyOpenFeedButton() {
      const cfg = normalizedConfig(getConfig());
      const href = normalizeText(cfg.feedUrl);
      openFeedBtn.href = href || DEFAULT_FEED_URL;
      openFeedBtn.target = cfg.openInNewTab ? "_blank" : "_self";
    }

    function renderList() {
      list.replaceChildren();

      const cfg = normalizedConfig(getConfig());
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
        link.href = item.link || cfg.feedUrl;
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
        status.textContent = "RSS feed";
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
        const cfg = normalizedConfig(getConfig());
        const fetchUrl = asFetchUrl(cfg.feedUrl);
        if (!fetchUrl) {
          throw new Error("Feed URL is required.");
        }

        const response = await fetch(fetchUrl, {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error(`Feed request failed: HTTP ${response.status}`);
        }
        const xmlText = await response.text();
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
        const signature = configSignature(normalizedConfig(getConfig()));
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
