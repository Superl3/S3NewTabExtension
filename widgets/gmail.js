const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_WEB_INBOX_URL = "https://mail.google.com/mail/u/0/#inbox";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeMaxResults(value, fallback = 6) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, 20);
  }
  return clamp(Math.round(num), 1, 20);
}

function normalizeQuery(value) {
  return normalizeText(value).slice(0, 180);
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

function isTokenMissingError(message) {
  const text = normalizeText(message).toLowerCase();
  return (
    text.includes("oauth2 not granted") ||
    text.includes("user is not signed in") ||
    text.includes("interaction required") ||
    text.includes("not granted") ||
    text.includes("canceled") ||
    text.includes("cancelled")
  );
}

function hasConfiguredOauthClient() {
  const manifest = chrome.runtime?.getManifest?.() || {};
  const clientId = normalizeText(manifest?.oauth2?.client_id);
  if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) {
    return false;
  }
  const lower = clientId.toLowerCase();
  return !lower.includes("your_extension_oauth_client_id") && !lower.includes("replace_with");
}

function readHeader(headers, headerName) {
  if (!Array.isArray(headers)) {
    return "";
  }
  const target = String(headerName || "").toLowerCase();
  for (const header of headers) {
    const name = String(header?.name || "").toLowerCase();
    if (name !== target) {
      continue;
    }
    return normalizeText(header?.value);
  }
  return "";
}

function compactAddress(rawValue) {
  const value = normalizeText(rawValue);
  if (!value) {
    return "(No sender)";
  }
  const angle = value.match(/^(.*)<([^>]+)>$/);
  if (!angle) {
    return value;
  }
  const name = normalizeText(angle[1].replaceAll('"', ""));
  if (name) {
    return name;
  }
  return normalizeText(angle[2], value);
}

function formatMailDate(rawDate, internalDate) {
  const internalNum = Number(internalDate);
  if (Number.isFinite(internalNum) && internalNum > 0) {
    return new Date(internalNum).toLocaleString();
  }
  const parsed = Date.parse(rawDate);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toLocaleString();
  }
  return "";
}

function buildMessageLink(messageId, threadId) {
  const id = normalizeText(messageId);
  if (id) {
    return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(id)}`;
  }
  const thread = normalizeText(threadId);
  if (thread) {
    return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(thread)}`;
  }
  return GMAIL_WEB_INBOX_URL;
}

function getTokenString(tokenResult) {
  if (typeof tokenResult === "string") {
    return normalizeText(tokenResult);
  }
  return normalizeText(tokenResult?.token);
}

async function getAuthToken(interactive = false) {
  const result = await chrome.identity.getAuthToken({
    interactive,
    scopes: [GMAIL_SCOPE],
    enableGranularPermissions: true
  });
  return getTokenString(result);
}

async function removeCachedToken(token) {
  const normalized = normalizeText(token);
  if (!normalized) {
    return;
  }
  try {
    await chrome.identity.removeCachedAuthToken({ token: normalized });
  } catch {
  }
}

async function clearCachedTokens() {
  try {
    await chrome.identity.clearAllCachedAuthTokens();
  } catch {
  }
}

async function getProfileEmail() {
  try {
    const info = await chrome.identity.getProfileUserInfo();
    return normalizeText(info?.email);
  } catch {
    return "";
  }
}

function buildListUrl(config) {
  const params = new URLSearchParams();
  params.set("maxResults", String(normalizeMaxResults(config.maxResults, 6)));
  const query = normalizeQuery(config.query);
  if (query) {
    params.set("q", query);
  }
  return `${GMAIL_API_BASE}?${params.toString()}`;
}

function buildMessageDetailUrl(messageId) {
  const params = new URLSearchParams();
  params.set("format", "metadata");
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "Subject");
  params.append("metadataHeaders", "Date");
  return `${GMAIL_API_BASE}/${encodeURIComponent(String(messageId || ""))}?${params.toString()}`;
}

async function gmailFetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401 || response.status === 403) {
    const body = normalizeText(await response.text());
    const error = new Error(body || `HTTP ${response.status}`);
    error.code = "auth";
    throw error;
  }

  if (!response.ok) {
    const body = normalizeText(await response.text());
    throw new Error(body || `HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchRecentMessages(config, token) {
  const listData = await gmailFetchJson(buildListUrl(config), token);
  const list = Array.isArray(listData?.messages) ? listData.messages : [];
  if (!list.length) {
    return [];
  }

  const detailList = await Promise.all(
    list.map((entry) => gmailFetchJson(buildMessageDetailUrl(entry?.id), token))
  );

  const mapped = detailList.map((detail) => {
    const headers = detail?.payload?.headers;
    const subject = normalizeText(readHeader(headers, "Subject"), "(No subject)");
    const fromRaw = readHeader(headers, "From");
    const dateRaw = readHeader(headers, "Date");
    const timestamp = Number(detail?.internalDate);
    return {
      id: normalizeText(detail?.id),
      threadId: normalizeText(detail?.threadId),
      subject,
      from: compactAddress(fromRaw),
      snippet: normalizeText(detail?.snippet),
      dateLabel: formatMailDate(dateRaw, detail?.internalDate),
      timestamp: Number.isFinite(timestamp) ? timestamp : 0,
      unread: Array.isArray(detail?.labelIds) && detail.labelIds.includes("UNREAD")
    };
  });

  mapped.sort((a, b) => b.timestamp - a.timestamp);
  return mapped;
}

function normalizeFetchConfig(config) {
  return {
    maxResults: normalizeMaxResults(config?.maxResults, 6),
    query: normalizeQuery(config?.query)
  };
}

function fetchSignature(config) {
  return `${config.maxResults}|${config.query}`;
}

export const gmailWidget = {
  type: "gmail",
  title: "Gmail",
  defaultConfig: {
    maxResults: 6,
    query: "in:inbox",
    showSnippet: true
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
    { key: "maxResults", label: "Recent mail count", type: "number", min: 1, max: 20, step: 1 },
    {
      key: "query",
      label: "Gmail query",
      type: "text",
      placeholder: "in:inbox OR is:unread"
    },
    { key: "showSnippet", label: "Show snippet", type: "checkbox" }
  ],
  create({ container, getConfig, isEditMode, openSettings }) {
    container.classList.add("gmail-widget");

    const shell = document.createElement("div");
    shell.className = "gmail-widget-shell";

    const toolbar = document.createElement("div");
    toolbar.className = "gmail-widget-toolbar";

    const status = document.createElement("p");
    status.className = "gmail-widget-status";

    const actions = document.createElement("div");
    actions.className = "gmail-widget-actions";

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

    const openInbox = document.createElement("a");
    openInbox.className = "btn";
    openInbox.textContent = "Open Gmail";
    openInbox.href = GMAIL_WEB_INBOX_URL;
    openInbox.target = "_blank";
    openInbox.rel = "noreferrer";

    actions.append(connectBtn, refreshBtn, disconnectBtn, openInbox);
    toolbar.append(status, actions);

    const list = document.createElement("ul");
    list.className = "gmail-mail-list";

    shell.append(toolbar, list);
    container.append(shell);

    let accountEmail = "";
    let loading = false;
    let connected = false;
    let errorMessage = "";
    let messageItems = [];
    let lastFetchSig = "";
    let requestSerial = 0;

    function renderList() {
      list.replaceChildren();
      const cfg = getConfig();
      const showSnippet = cfg.showSnippet !== false;

      if (!messageItems.length) {
        const empty = document.createElement("li");
        empty.className = "gmail-mail-empty";
        if (loading) {
          empty.textContent = "Loading recent mail...";
        } else if (!connected) {
          empty.textContent = "Connect Gmail to show your latest mail list.";
        } else {
          empty.textContent = "No messages found for this query.";
        }
        list.append(empty);
        return;
      }

      for (const mail of messageItems) {
        const row = document.createElement("li");
        row.className = `gmail-mail-item${mail.unread ? " is-unread" : ""}`;

        const link = document.createElement("a");
        link.className = "gmail-mail-link";
        link.href = buildMessageLink(mail.id, mail.threadId);
        link.target = "_blank";
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

        if (showSnippet && mail.snippet) {
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
        status.textContent = "Syncing Gmail...";
      } else if (errorMessage) {
        status.textContent = errorMessage;
      } else if (connected) {
        status.textContent = accountEmail ? `${accountEmail}` : "Connected";
      } else {
        status.textContent = "Gmail not connected";
      }

      connectBtn.disabled = loading;
      refreshBtn.disabled = loading || !connected;
      disconnectBtn.disabled = loading || !connected;
    }

    function render() {
      renderStatus();
      renderList();
    }

    async function disconnectAccount() {
      loading = true;
      render();
      await clearCachedTokens();
      connected = false;
      accountEmail = "";
      errorMessage = "";
      messageItems = [];
      loading = false;
      render();
    }

    async function loadMessages(interactive) {
      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        if (!hasConfiguredOauthClient()) {
          throw new Error("Set oauth2.client_id in manifest.json to enable Gmail connection.");
        }

        const token = await getAuthToken(interactive);
        if (!token) {
          throw new Error("Failed to obtain an OAuth token.");
        }

        const fetchConfig = normalizeFetchConfig(getConfig());
        let recent = [];
        try {
          recent = await fetchRecentMessages(fetchConfig, token);
        } catch (error) {
          if (error?.code === "auth") {
            await removeCachedToken(token);
          }
          throw error;
        }

        if (requestId !== requestSerial) {
          return;
        }

        connected = true;
        accountEmail = await getProfileEmail();
        messageItems = recent;
        lastFetchSig = fetchSignature(fetchConfig);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }

        if (error?.code === "auth") {
          connected = false;
          accountEmail = "";
          messageItems = [];
          errorMessage = "Session expired. Connect Gmail again.";
          return;
        }

        const message = normalizeErrorMessage(error);
        if (!interactive && isTokenMissingError(message)) {
          connected = false;
          accountEmail = "";
          messageItems = [];
          errorMessage = "";
        } else if (interactive && isTokenMissingError(message)) {
          connected = false;
          errorMessage = "Gmail connection was cancelled.";
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

    connectBtn.addEventListener("click", () => {
      void loadMessages(true);
    });

    refreshBtn.addEventListener("click", () => {
      void loadMessages(false);
    });

    disconnectBtn.addEventListener("click", () => {
      void disconnectAccount();
    });

    const initialFetchConfig = normalizeFetchConfig(getConfig());
    lastFetchSig = fetchSignature(initialFetchConfig);
    render();
    void loadMessages(false);

    return {
      refresh() {
        const nextSig = fetchSignature(normalizeFetchConfig(getConfig()));
        render();
        if (connected && !loading && nextSig !== lastFetchSig) {
          void loadMessages(false);
        }
      },
      destroy() {
        requestSerial += 1;
      }
    };
  }
};
