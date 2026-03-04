function toMessage(role, content) {
  return { role, content, ts: Date.now() };
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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

function rewriteAuthorizationLoadError(message) {
  const text = normalizeText(message).toLowerCase();
  if (text.includes("authorization page") && (text.includes("load") || text.includes("not loaded"))) {
    return "Authorization page could not be loaded. Check that connector server is running at http://localhost:8787 and then try Connect again.";
  }
  return message;
}

function resolveEndpoint(cfg) {
  const manual = normalizeText(cfg.endpoint);
  if (manual) {
    return manual;
  }
  return cfg.providerMode === "browser"
    ? "https://api.openai.com/v1/responses"
    : "https://api.openai.com/v1/chat/completions";
}

function resolveModel(cfg) {
  const model = normalizeText(cfg.model);
  if (cfg.providerMode === "browser") {
    if (!model || model === "gpt-4o-mini") {
      return "gpt-4.1-mini";
    }
    return model;
  }
  if (!model || model === "gpt-4.1-mini") {
    return "gpt-4o-mini";
  }
  return model;
}

function extractTextParts(value) {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const out = [];
  for (const part of value) {
    if (!part || typeof part !== "object") {
      continue;
    }

    let raw = "";
    if (typeof part.text === "string") {
      raw = part.text;
    } else if (typeof part.output_text === "string") {
      raw = part.output_text;
    } else if (typeof part.content === "string") {
      raw = part.content;
    }

    const candidate = normalizeText(raw);
    if (candidate) {
      out.push(candidate);
    }
  }
  return out;
}

function extractAssistantText(data) {
  const direct = extractTextParts(data?.choices?.[0]?.message?.content);
  if (direct.length) {
    return direct.join("\n");
  }

  const outputText = normalizeText(data?.output_text);
  if (outputText) {
    return outputText;
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const itemParts = extractTextParts(item.content);
    if (itemParts.length) {
      return itemParts.join("\n");
    }
  }

  return "";
}

const AI_CHAT_AUTH_STORAGE_KEY = "s3newtab-ai-chat-auth-session-v1";
const LOCAL_AUTH_CONNECTOR_URL = "http://localhost:8787/api/auth/start";

function normalizeConnectorUrl(value, fallback = LOCAL_AUTH_CONNECTOR_URL) {
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

function tryParseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

async function fetchConnectorToken(connectorUrl, provider) {
  const url = new URL(connectorUrl);
  url.searchParams.set("mode", "token");
  url.searchParams.set("provider", provider);
  const response = await fetch(url.toString());
  const text = normalizeText(await response.text());
  const payload = tryParseJson(text);
  if (!response.ok) {
    const message =
      normalizeText(payload?.message) ||
      normalizeText(payload?.error) ||
      normalizeText(payload?.error_description) ||
      `Token relay failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  const token =
    normalizeText(payload?.access_token) ||
    normalizeText(payload?.accessToken) ||
    normalizeText(payload?.token) ||
    normalizeText(payload?.id_token);
  if (!token) {
    throw new Error("Token relay response missing access_token.");
  }
  const accountLabel =
    normalizeText(payload?.account) ||
    normalizeText(payload?.email) ||
    normalizeText(payload?.user) ||
    normalizeText(payload?.name);
  return { accessToken: token, accountLabel };
}

function normalizeStoredAuthSession(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const rawConnector = normalizeText(raw.connectorUrl);
  if (!rawConnector) {
    return null;
  }
  const connectorUrl = normalizeConnectorUrl(rawConnector, "");
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
    const stored = await chrome.storage.local.get(AI_CHAT_AUTH_STORAGE_KEY);
    return normalizeStoredAuthSession(stored?.[AI_CHAT_AUTH_STORAGE_KEY]);
  } catch {
    return null;
  }
}

async function saveStoredAuthSession(session) {
  await chrome.storage.local.set({
    [AI_CHAT_AUTH_STORAGE_KEY]: {
      connectorUrl: normalizeConnectorUrl(session?.connectorUrl, ""),
      accessToken: normalizeText(session?.accessToken),
      accountLabel: normalizeText(session?.accountLabel)
    }
  });
}

async function clearStoredAuthSession() {
  try {
    await chrome.storage.local.remove(AI_CHAT_AUTH_STORAGE_KEY);
  } catch {
  }
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

async function throwHttpError(response) {
  const body = normalizeText(await response.text());
  throw new Error(body ? `HTTP ${response.status}: ${body}` : `HTTP ${response.status}`);
}

async function callOpenAIStyleApi(cfg, history, text, accessToken) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const messages = [];
  if (cfg.systemPrompt) {
    messages.push({ role: "system", content: cfg.systemPrompt });
  }
  for (const item of history) {
    messages.push({ role: item.role, content: item.content });
  }
  messages.push({ role: "user", content: text });

  const payload = {
    model: resolveModel(cfg),
    temperature: Number(cfg.temperature ?? 0.7),
    messages
  };

  const response = await fetch(resolveEndpoint(cfg), {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await throwHttpError(response);
  }

  const data = await response.json();
  const content = extractAssistantText(data);
  if (!content) {
    throw new Error("No assistant content in response");
  }
  return String(content);
}

async function callOpenAIBrowserMode(cfg, history, text, accessToken) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const input = [];
  if (cfg.systemPrompt) {
    input.push({ role: "system", content: [{ type: "input_text", text: cfg.systemPrompt }] });
  }
  for (const item of history) {
    input.push({ role: item.role, content: [{ type: "input_text", text: item.content }] });
  }
  input.push({ role: "user", content: [{ type: "input_text", text }] });

  const payload = {
    model: resolveModel(cfg),
    input,
    tools: [{ type: "web_search_preview" }],
    temperature: Number(cfg.temperature ?? 0.7)
  };

  const response = await fetch(resolveEndpoint(cfg), {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await throwHttpError(response);
  }

  const data = await response.json();
  const textOutput = extractAssistantText(data);
  if (!textOutput) {
    throw new Error("No browser mode output in response");
  }
  return String(textOutput);
}

export const aiChatWidget = {
  type: "aiChat",
  title: "AI Chat",
  defaultConfig: {
    providerMode: "chatgpt",
    endpoint: "",
    connectorUrl: LOCAL_AUTH_CONNECTOR_URL,
    accessToken: "",
    model: "gpt-4o-mini",
    systemPrompt: "You are a concise assistant in a browser new tab widget.",
    temperature: 0.7,
    history: []
  },
  defaultLayout: {
    x: 40,
    y: 560,
    w: 520,
    h: 300
  },
  settingsSchema: [
    {
      key: "providerMode",
      label: "Mode",
      type: "select",
      options: [
        { value: "chatgpt", label: "ChatGPT" },
        { value: "browser", label: "Browser mode" }
      ]
    },
    { key: "endpoint", label: "Endpoint (optional override)", type: "text", placeholder: "https://..." },
    {
      key: "connectorUrl",
      label: "Auth connector URL",
      type: "url",
      placeholder: "http://localhost:8787/api/auth/start",
      helpText: "Connector should redirect to this extension with access_token (optionally account/email/user)."
    },
    {
      key: "accessToken",
      label: "Access token (optional)",
      type: "password",
      placeholder: "OpenAI access token",
      helpText: "If set, Connect uses this token directly and skips connector popup/relay."
    },
    { key: "model", label: "Model", type: "text", placeholder: "gpt-4o-mini" },
    { key: "temperature", label: "Temperature", type: "number", min: 0, max: 2, step: 0.1 },
    { key: "systemPrompt", label: "System prompt", type: "textarea" }
  ],
  create({ container, getConfig, patchConfig }) {
    const log = document.createElement("div");
    const list = document.createElement("ul");
    const form = document.createElement("form");
    const toolbar = document.createElement("div");
    const status = document.createElement("div");
    const actions = document.createElement("div");
    const connectBtn = document.createElement("button");
    const disconnectBtn = document.createElement("button");
    const input = document.createElement("input");
    const send = document.createElement("button");

    container.classList.add("ai-chat-widget");
    log.className = "chat-log";
    list.className = "chat-list";
    form.className = "chat-form";
    toolbar.className = "ai-chat-toolbar";
    status.className = "ai-chat-status";
    actions.className = "ai-chat-actions";

    input.type = "text";
    input.placeholder = "Ask something";
    send.type = "submit";
    send.className = "btn btn-primary";
    send.textContent = "Send";

    connectBtn.type = "button";
    connectBtn.className = "btn btn-primary";
    connectBtn.textContent = "Connect";

    disconnectBtn.type = "button";
    disconnectBtn.className = "btn";
    disconnectBtn.textContent = "Disconnect";

    actions.append(connectBtn, disconnectBtn);
    toolbar.append(status, actions);
    form.append(input, send);
    log.append(list);
    container.append(toolbar, log, form);

    let storedSession = null;
    let activeSession = null;
    let isConnecting = false;
    let connectionError = "";

    function getHistory() {
      const cfg = getConfig();
      return Array.isArray(cfg.history) ? cfg.history : [];
    }

    function getConnectorUrl() {
      const cfg = getConfig();
      return normalizeConnectorUrl(cfg.connectorUrl);
    }

    function getConfiguredAccessToken() {
      const cfg = getConfig();
      return normalizeText(cfg.accessToken);
    }

    function updateActiveSessionFromStorage() {
      const connectorUrl = getConnectorUrl();
      const configuredToken = getConfiguredAccessToken();
      if (configuredToken) {
        activeSession = {
          connectorUrl,
          accessToken: configuredToken,
          accountLabel: "Configured token"
        };
        return;
      }
      activeSession = connectorUrl && storedSession?.connectorUrl === connectorUrl ? storedSession : null;
    }

    function renderToolbar() {
      const connectorUrl = getConnectorUrl();
      const configuredToken = getConfiguredAccessToken();
      let text = "";
      if (isConnecting) {
        text = "Connecting...";
      } else if (connectionError) {
        text = connectionError;
      } else if (!connectorUrl && !configuredToken) {
        text = "Auth connector URL is required.";
      } else if (!activeSession) {
        text = "Connect to authenticate.";
      } else {
        text = activeSession.accountLabel ? `Connected as ${activeSession.accountLabel}` : "Connected";
      }

      status.textContent = text;
      status.classList.toggle("is-error", Boolean(connectionError));
      connectBtn.disabled = isConnecting || (!connectorUrl && !configuredToken);
      disconnectBtn.disabled = isConnecting || !activeSession;
    }

    async function connectConnector() {
      const connectorUrl = getConnectorUrl();
      const configuredToken = getConfiguredAccessToken();
      if (!connectorUrl && !configuredToken) {
        connectionError = "Set auth connector URL in widget settings first.";
        render();
        return;
      }

      isConnecting = true;
      connectionError = "";
      render();

      try {
        let token = configuredToken;
        let tokenAccount = token ? "Configured token" : "";
        let tokenRelayFailureMessage = "";
        if (!token && connectorUrl) {
          try {
            const fallback = await fetchConnectorToken(connectorUrl, "openai");
            token = fallback.accessToken;
            tokenAccount = fallback.accountLabel;
          } catch (relayError) {
            tokenRelayFailureMessage = normalizeErrorMessage(relayError);
          }
        }

        if (!token && connectorUrl && chrome.identity?.launchWebAuthFlow && chrome.identity?.getRedirectURL) {
          const state = createAuthState();
          const redirectUri = chrome.identity.getRedirectURL("ai-chat-auth");
          const startUrl = buildAuthConnectorStartUrl(connectorUrl, redirectUri, state, "openai");
          const callbackUrl = await chrome.identity.launchWebAuthFlow({
            url: startUrl,
            interactive: true
          });

          const result = parseAuthFlowResult(callbackUrl);
          if (result.error || result.errorDescription) {
            throw new Error(result.errorDescription || result.error || "Authentication failed.");
          }
          if (!result.state || result.state !== state) {
            throw new Error("Authentication failed (invalid state).");
          }

          token = normalizeText(result.accessToken);
          if (!token) {
            throw new Error("Auth connector did not return access_token.");
          }

          tokenAccount = normalizeText(result.accountLabel);
        }

        if (!token) {
          throw new Error(
            tokenRelayFailureMessage || "Unable to obtain connector token. Try Connect again."
          );
        }

        if (!configuredToken) {
          storedSession = {
            connectorUrl,
            accessToken: token,
            accountLabel: tokenAccount
          };
          await saveStoredAuthSession(storedSession);
        }

        updateActiveSessionFromStorage();
        connectionError = "";
      } catch (error) {
        let message = normalizeErrorMessage(error);
        message = rewriteAuthorizationLoadError(message);
        if (isAuthCancelledMessage(message)) {
          connectionError = "Connector authentication was cancelled.";
        } else {
          connectionError = message || "Connector authentication failed.";
        }
      } finally {
        isConnecting = false;
        render();
      }
    }

    async function disconnectConnector() {
      if (isConnecting) {
        return;
      }
      if (getConfiguredAccessToken()) {
        connectionError = "Remove Access token in settings to disconnect.";
        render();
        return;
      }
      storedSession = null;
      activeSession = null;
      connectionError = "";
      await clearStoredAuthSession();
      render();
    }

    function render() {
      updateActiveSessionFromStorage();
      renderToolbar();
      list.replaceChildren();

      for (const msg of getHistory()) {
        const li = document.createElement("li");
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${msg.role === "user" ? "user" : "assistant"}`;
        bubble.textContent = msg.content;
        li.append(bubble);
        list.append(li);
      }

      log.scrollTop = log.scrollHeight;
    }

    function appendHistoryMessage(message) {
      const nextHistory = [...getHistory(), message].slice(-40);
      patchConfig({ history: nextHistory });
      return message;
    }

    function appendUserMessage(text) {
      return appendHistoryMessage(toMessage("user", text));
    }

    function appendAssistantMessage(text) {
      return appendHistoryMessage(toMessage("assistant", text));
    }

    async function sendMessage(text) {
      const cfg = getConfig();
      const endpoint = resolveEndpoint(cfg);
      const history = getHistory();
      appendUserMessage(text);

      if (!endpoint) {
        appendAssistantMessage("Endpoint is required.");
        return;
      }

      const connectorUrl = getConnectorUrl();
      if (!connectorUrl && !activeSession?.accessToken) {
        appendAssistantMessage("Auth connector URL is required in settings.");
        return;
      }

      const token = activeSession?.accessToken;
      if (!token) {
        appendAssistantMessage("Tap Connect above to authenticate before sending messages.");
        return;
      }

      try {
        const reply =
          cfg.providerMode === "browser"
            ? await callOpenAIBrowserMode(cfg, history, text, token)
            : await callOpenAIStyleApi(cfg, history, text, token);

        appendAssistantMessage(reply);
      } catch (error) {
        appendAssistantMessage(`Request failed: ${error.message}`);
      }
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        return;
      }
      input.value = "";
      void sendMessage(text);
    });

    connectBtn.addEventListener("click", () => {
      void connectConnector();
    });

    disconnectBtn.addEventListener("click", () => {
      void disconnectConnector();
    });

    void (async () => {
      storedSession = await loadStoredAuthSession();
      render();
    })();

    render();

    return {
      refresh: render
    };
  }
};
