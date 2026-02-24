const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const GMAIL_WEB_INBOX_URL = "https://mail.google.com/mail/u/0/#inbox";
const GMAIL_AUTH_STORAGE_KEY = "s3newtab-gmail-auth-session-v1";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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
    const stored = await chrome.storage.local.get(GMAIL_AUTH_STORAGE_KEY);
    return normalizeStoredAuthSession(stored?.[GMAIL_AUTH_STORAGE_KEY]);
  } catch {
    return null;
  }
}

async function saveStoredAuthSession(session) {
  await chrome.storage.local.set({
    [GMAIL_AUTH_STORAGE_KEY]: {
      connectorUrl: normalizeConnectorUrl(session?.connectorUrl),
      accessToken: normalizeText(session?.accessToken),
      accountLabel: normalizeText(session?.accountLabel)
    }
  });
}

async function clearStoredAuthSession() {
  try {
    await chrome.storage.local.remove(GMAIL_AUTH_STORAGE_KEY);
  } catch {
  }
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
    connectorUrl: normalizeConnectorUrl(config?.connectorUrl),
    maxResults: normalizeMaxResults(config?.maxResults, 6),
    query: normalizeQuery(config?.query)
  };
}

function fetchSignature(config) {
  return `${config.connectorUrl}|${config.maxResults}|${config.query}`;
}

function hasConnectorConfig(config) {
  return Boolean(normalizeConnectorUrl(config?.connectorUrl));
}

export const gmailWidget = {
  type: "gmail",
  title: "Gmail",
  defaultConfig: {
    connectorUrl: "",
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
    {
      key: "connectorUrl",
      label: "Auth connector URL",
      type: "url",
      placeholder: "https://your-backend.example.com/api/google/oauth/start",
      helpText: "Connector should redirect with access_token and optional account/email/user."
    },
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

    let loading = false;
    let connected = false;
    let accountLabel = "";
    let accessToken = "";
    let sessionConnectorUrl = "";
    let errorMessage = "";
    let messageItems = [];
    let lastFetchSig = "";
    let requestSerial = 0;
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
        const redirectUri = chrome.identity.getRedirectURL("gmail-auth");
        const startUrl = buildAuthConnectorStartUrl(cfg.connectorUrl, redirectUri, state, "google-gmail");
        const callbackUrl = await chrome.identity.launchWebAuthFlow({
          url: startUrl,
          interactive: true
        });

        const result = parseAuthFlowResult(callbackUrl);
        if (result.error || result.errorDescription) {
          throw new Error(result.errorDescription || result.error || "Gmail connection failed.");
        }
        if (result.state && result.state !== state) {
          throw new Error("Gmail connection failed (invalid state).");
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
          errorMessage = "Gmail connection was cancelled.";
        } else {
          errorMessage = message;
        }
      } finally {
        loading = false;
        render();
      }

      if (connected) {
        void loadMessages(false);
      }
    }

    async function disconnectAccount() {
      loading = true;
      render();
      await clearConnectionState({ clearStored: true });
      errorMessage = "";
      messageItems = [];
      loading = false;
      render();
    }

    function renderList() {
      list.replaceChildren();
      const cfg = normalizeFetchConfig(getConfig());
      const showSnippet = getConfig().showSnippet !== false;

      if (!messageItems.length) {
        const empty = document.createElement("li");
        empty.className = "gmail-mail-empty";
        if (loading) {
          empty.textContent = "Loading recent mail...";
        } else if (!hasConnectorConfig(cfg)) {
          empty.textContent = "Set auth connector URL in widget settings to enable Gmail connection.";
        } else if (!hasActiveConnection(cfg)) {
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
      const cfg = normalizeFetchConfig(getConfig());
      status.classList.toggle("is-error", Boolean(errorMessage));

      if (loading) {
        status.textContent = "Syncing Gmail...";
      } else if (errorMessage) {
        status.textContent = errorMessage;
      } else if (!hasConnectorConfig(cfg)) {
        status.textContent = "Set auth connector URL";
      } else if (connected) {
        status.textContent = accountLabel || "Connected";
      } else {
        status.textContent = "Gmail not connected";
      }

      connectBtn.disabled = loading || !hasConnectorConfig(cfg);
      refreshBtn.disabled = loading || !hasActiveConnection(cfg);
      disconnectBtn.disabled = loading || !connected;
    }

    function render() {
      renderStatus();
      renderList();
    }

    async function loadMessages(interactive) {
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
          throw new Error("Connect Gmail first.");
        }

        const token = normalizeText(accessToken);
        if (!token) {
          throw new Error("Missing connector access token.");
        }

        const recent = await fetchRecentMessages(cfg, token);

        if (requestId !== requestSerial) {
          return;
        }

        connected = true;
        messageItems = recent;
        lastFetchSig = fetchSignature(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }

        if (error?.code === "auth") {
          await clearConnectionState({ clearStored: true });
          messageItems = [];
          errorMessage = "Session expired. Connect Gmail again.";
          return;
        }

        const message = normalizeErrorMessage(error);
        if (interactive && isAuthCancelledMessage(message)) {
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
      void connectAccount();
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
    void syncStoredSessionForConfig(getConfig()).finally(() => {
      render();
      if (hasActiveConnection(getConfig())) {
        void loadMessages(false);
      }
    });

    return {
      refresh() {
        const cfg = getConfig();
        const nextSig = fetchSignature(normalizeFetchConfig(cfg));
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
          void loadMessages(false);
        }
      },
      destroy() {
        requestSerial += 1;
      }
    };
  }
};
