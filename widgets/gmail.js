import { normalizeErrorMessage } from "../core/utils/error.js";
import { normalizeIntegerInRange } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import { formatLocalDateTimeLabel as formatDateLabel } from "./shared/dateLabels.js";
import { readAtomAlternateLink as atomAlternateLink, readFeedNodeText as nodeText } from "./shared/feedXml.js";

const GMAIL_WEB_BASE_URL = "https://mail.google.com/mail";

function normalizeAccountIndex(value, fallback = 0) {
  return normalizeIntegerInRange(value, fallback, 0, 9);
}

function normalizeMaxResults(value, fallback = 6) {
  return normalizeIntegerInRange(value, fallback, 1, 20);
}

function normalizeRefreshMinutes(value, fallback = 5) {
  return normalizeIntegerInRange(value, fallback, 1, 120);
}

function buildInboxUrl(accountIndex) {
  return `${GMAIL_WEB_BASE_URL}/u/${normalizeAccountIndex(accountIndex)}/#inbox`;
}

function buildFeedUrl(accountIndex) {
  return `${GMAIL_WEB_BASE_URL}/u/${normalizeAccountIndex(accountIndex)}/feed/atom`;
}

function normalizeMailLink(value, fallback) {
  const text = normalizeText(value);
  if (!text) {
    return fallback;
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:" || parsed.hostname !== "mail.google.com") {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function isGmailLoginPage(responseUrl, bodyText) {
  const lowerUrl = String(responseUrl || "").toLowerCase();
  const lowerBody = String(bodyText || "").toLowerCase();
  return (
    lowerUrl.includes("accounts.google.com") ||
    lowerUrl.includes("servicelogin") ||
    lowerUrl.includes("accountchooser") ||
    lowerUrl.includes("/signin/") ||
    lowerUrl.includes("addsession") ||
    lowerUrl.includes("/challenge/") ||
    lowerBody.includes("servicelogin") ||
    lowerBody.includes("interactive login") ||
    lowerBody.includes("accountchooser") ||
    lowerBody.includes("gaia_loginform") ||
    lowerBody.includes("identifierid") ||
    lowerBody.includes("name=\"passw") ||
    lowerBody.includes("data-profileidentifier")
  );
}

function classifyFeedResponse(response, bodyText) {
  if (!response) {
    return "invalid";
  }

  if (response.status === 401 || response.status === 403) {
    return "auth";
  }

  if (isGmailLoginPage(response.url, bodyText)) {
    return "auth";
  }

  const lowerBody = String(bodyText || "").toLowerCase();
  if (lowerBody.includes("<feed") && lowerBody.includes("<entry")) {
    return "feed";
  }

  return "unknown";
}

function parseFeedXml(xmlText, accountIndex, responseUrl = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(xmlText || ""), "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    if (isGmailLoginPage(responseUrl, xmlText)) {
      throw new Error("Gmail web session not found. Sign in to Gmail in this browser first.");
    }
    throw new Error("Gmail feed parse failed.");
  }

  const feed = doc.getElementsByTagName("feed")[0];
  if (!feed) {
    if (isGmailLoginPage(responseUrl, xmlText)) {
      throw new Error("Gmail web session not found. Sign in to Gmail in this browser first.");
    }
    throw new Error("Unsupported Gmail feed format.");
  }

  const fallbackLink = buildInboxUrl(accountIndex);
  const entryNodes = Array.from(feed.getElementsByTagName("entry"));
  const items = entryNodes.map((entry, index) => {
    const authorNode = entry.getElementsByTagName("author")[0];
    const from =
      normalizeText(nodeText(authorNode, ["name"])) ||
      normalizeText(nodeText(authorNode, ["email"]), "(Unknown sender)");
    const rawDate = normalizeText(nodeText(entry, ["issued", "modified"]));

    return {
      id: normalizeText(nodeText(entry, ["id"]), `mail-${index}`),
      subject: normalizeText(nodeText(entry, ["title"]), "(No subject)"),
      from,
      snippet: normalizeText(nodeText(entry, ["summary"])),
      dateLabel: formatDateLabel(rawDate),
      link: normalizeMailLink(atomAlternateLink(entry), fallbackLink),
      unread: true
    };
  });

  const fullCountRaw = normalizeText(nodeText(feed, ["fullcount"]), "0");
  const unreadTotal = Number.parseInt(fullCountRaw, 10);

  return {
    feedTitle: normalizeText(nodeText(feed, ["title"]), "Gmail"),
    unreadTotal: Number.isFinite(unreadTotal) && unreadTotal >= 0 ? unreadTotal : items.length,
    items
  };
}

function normalizedConfig(config) {
  return {
    accountIndex: normalizeAccountIndex(config?.accountIndex, 0),
    maxResults: normalizeMaxResults(config?.maxResults, 6),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, 5),
    showSnippet: config?.showSnippet !== false,
    openInNewTab: config?.openInNewTab !== false
  };
}

function configSignature(config) {
  return `${config.accountIndex}|${config.maxResults}|${config.refreshMinutes}|${config.showSnippet ? 1 : 0}|${config.openInNewTab ? 1 : 0}`;
}

export const gmailWidget = {
  type: "gmail",
  title: "Gmail",
  defaultConfig: {
    accountIndex: 0,
    maxResults: 6,
    refreshMinutes: 5,
    showSnippet: true,
    openInNewTab: true
  },
  defaultLayout: {
    x: 560,
    y: 560,
    w: 540,
    h: 320
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
      helpText: "Use 0 for the primary signed-in Gmail account."
    },
    {
      key: "maxResults",
      label: "Unread mail count",
      type: "number",
      min: 1,
      max: 20,
      step: 1
    },
    {
      key: "refreshMinutes",
      label: "Refresh every (minutes)",
      type: "number",
      min: 1,
      max: 120,
      step: 1
    },
    { key: "showSnippet", label: "Show snippet", type: "checkbox" },
    { key: "openInNewTab", label: "Open mail in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, patchConfig, isEditMode, openSettings }) {
    container.classList.add("gmail-widget");

    const shell = document.createElement("div");
    shell.className = "gmail-widget-shell";

    const list = document.createElement("ul");
    list.className = "gmail-mail-list";

    const status = document.createElement("p");
    status.className = "gmail-widget-status";

    shell.append(list, status);
    container.append(shell);

    let feedTitle = "Gmail";
    let unreadTotal = 0;
    let loading = false;
    let errorMessage = "";
    let messageItems = [];
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
      timer = setTimeout(() => {
        void loadMessages();
      }, cfg.refreshMinutes * 60000);
    }

    function openGmailPage() {
      const cfg = normalizedConfig(getConfig());
      const href = buildInboxUrl(cfg.accountIndex);
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
      const cfg = normalizedConfig(getConfig());
      const nextAccountIndex = (cfg.accountIndex + 1) % 10;
      if (typeof patchConfig === "function") {
        patchConfig({ accountIndex: nextAccountIndex });
      }
      void loadMessages();
      return nextAccountIndex;
    }

    function renderList() {
      list.replaceChildren();
      const cfg = normalizedConfig(getConfig());

      if (!messageItems.length) {
        const empty = document.createElement("li");
        empty.className = "gmail-mail-empty";
        if (loading) {
          empty.textContent = "Loading unread mail...";
        } else if (errorMessage) {
          empty.textContent = "Could not load Gmail feed.";
        } else {
          empty.textContent = "No unread mail.";
        }
        list.append(empty);
        return;
      }

      for (const mail of messageItems) {
        const row = document.createElement("li");
        row.className = `gmail-mail-item${mail.unread ? " is-unread" : ""}`;

        const link = document.createElement("a");
        link.className = "gmail-mail-link";
        link.href = normalizeMailLink(mail.link, buildInboxUrl(cfg.accountIndex));
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
        top.className = "gmail-mail-top";

        const subject = document.createElement("span");
        subject.className = "gmail-mail-subject";
        subject.textContent = mail.subject;

        const date = document.createElement("span");
        date.className = "gmail-mail-date";
        date.textContent = mail.dateLabel;

        top.append(subject, date);

        const from = document.createElement("p");
        from.className = "gmail-mail-from";
        from.textContent = mail.from;

        link.append(top, from);

        if (cfg.showSnippet && mail.snippet) {
          const snippet = document.createElement("p");
          snippet.className = "gmail-mail-snippet";
          snippet.textContent = mail.snippet;
          link.append(snippet);
        }

        row.append(link);
        list.append(row);
      }
    }

    function renderStatus() {
      status.classList.toggle("is-error", Boolean(errorMessage));

      if (loading) {
        status.textContent = "Syncing Gmail unread feed...";
      } else if (errorMessage) {
        status.textContent = errorMessage;
      } else {
        status.textContent = `${feedTitle} · Unread ${unreadTotal}`;
      }
    }

    function render() {
      renderStatus();
      renderList();
    }

    async function loadMessages() {
      async function fetchFeed(accountIndex) {
        const response = await fetch(buildFeedUrl(accountIndex), {
          cache: "no-store",
          credentials: "include",
          redirect: "follow"
        });
        const xmlText = await response.text();
        const classification = classifyFeedResponse(response, xmlText);

        if (classification === "auth") {
          return {
            state: "auth"
          };
        }

        if (!response.ok) {
          return {
            state: "error",
            error: new Error(`Gmail feed request failed: HTTP ${response.status}`)
          };
        }

        try {
          return {
            state: "ok",
            parsed: parseFeedXml(xmlText, accountIndex, response.url)
          };
        } catch (error) {
          return {
            state: "error",
            error
          };
        }
      }

      async function resolveFeedWithFallback(cfg) {
        const primary = await fetchFeed(cfg.accountIndex);
        if (primary.state === "ok") {
          return {
            parsed: primary.parsed,
            accountIndex: cfg.accountIndex
          };
        }
        if (primary.state === "error") {
          throw primary.error;
        }

        let lastError = null;
        for (let candidate = 0; candidate <= 9; candidate += 1) {
          if (candidate === cfg.accountIndex) {
            continue;
          }

          const fallback = await fetchFeed(candidate);
          if (fallback.state === "ok") {
            return {
              parsed: fallback.parsed,
              accountIndex: candidate
            };
          }
          if (fallback.state === "error") {
            lastError = fallback.error;
          }
        }

        if (lastError) {
          throw lastError;
        }

        throw new Error("Gmail web session not found. Sign in to Gmail and check account index.");
      }

      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        const cfg = normalizedConfig(getConfig());
        const resolved = await resolveFeedWithFallback(cfg);
        const parsed = resolved.parsed;

        if (requestId !== requestSerial) {
          return;
        }

        if (resolved.accountIndex !== cfg.accountIndex && typeof patchConfig === "function") {
          patchConfig({ accountIndex: resolved.accountIndex });
        }

        const activeConfig =
          resolved.accountIndex === cfg.accountIndex ? cfg : { ...cfg, accountIndex: resolved.accountIndex };

        feedTitle = parsed.feedTitle;
        unreadTotal = parsed.unreadTotal;
        messageItems = parsed.items.slice(0, cfg.maxResults);
        lastSignature = configSignature(activeConfig);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }

        messageItems = [];
        unreadTotal = 0;
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

    render();
    void loadMessages();

    return {
      refresh() {
        render();
        const signature = configSignature(normalizedConfig(getConfig()));
        if (!loading && signature !== lastSignature) {
          void loadMessages();
          return;
        }
        scheduleRefresh();
      },
      manualRefresh() {
        return loadMessages();
      },
      openGmail() {
        openGmailPage();
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
