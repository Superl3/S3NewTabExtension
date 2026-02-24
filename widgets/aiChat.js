function toMessage(role, content) {
  return { role, content, ts: Date.now() };
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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

function createAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildAuthConnectorStartUrl(connectorUrl, redirectUri, state) {
  const url = new URL(connectorUrl);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
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
    accessToken: read("access_token") || read("token"),
    accountLabel: read("account") || read("email") || read("user"),
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
    const stored = await chrome.storage.local.get(AI_CHAT_AUTH_STORAGE_KEY);
    return normalizeStoredAuthSession(stored?.[AI_CHAT_AUTH_STORAGE_KEY]);
  } catch {
    return null;
  }
}

async function saveStoredAuthSession(session) {
  await chrome.storage.local.set({
    [AI_CHAT_AUTH_STORAGE_KEY]: {
      connectorUrl: normalizeConnectorUrl(session?.connectorUrl),
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
    connectorUrl: "",
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
      placeholder: "https://example.com/connector/auth",
      helpText: "Connector should redirect to this extension with access_token (optionally account/email/user)."
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

    function updateActiveSessionFromStorage() {
      const connectorUrl = getConnectorUrl();
      activeSession = connectorUrl && storedSession?.connectorUrl === connectorUrl ? storedSession : null;
    }

    function renderToolbar() {
      const connectorUrl = getConnectorUrl();
      let text = "";
      if (isConnecting) {
        text = "Connecting...";
      } else if (connectionError) {
        text = connectionError;
      } else if (!connectorUrl) {
        text = "Auth connector URL is required.";
      } else if (!activeSession) {
        text = "Connect to authenticate.";
      } else {
        text = activeSession.accountLabel ? `Connected as ${activeSession.accountLabel}` : "Connected";
      }

      status.textContent = text;
      status.classList.toggle("is-error", Boolean(connectionError));
      connectBtn.disabled = isConnecting || !connectorUrl;
      disconnectBtn.disabled = isConnecting || !activeSession;
    }

    async function connectConnector() {
      const connectorUrl = getConnectorUrl();
      if (!connectorUrl) {
        connectionError = "Set auth connector URL in widget settings first.";
        render();
        return;
      }

      if (!chrome.identity?.launchWebAuthFlow || !chrome.identity?.getRedirectURL) {
        connectionError = "chrome.identity.launchWebAuthFlow is not available.";
        render();
        return;
      }

      isConnecting = true;
      connectionError = "";
      render();

      try {
        const state = createAuthState();
        const redirectUri = chrome.identity.getRedirectURL("ai-chat-auth");
        const startUrl = buildAuthConnectorStartUrl(connectorUrl, redirectUri, state);
        const callbackUrl = await chrome.identity.launchWebAuthFlow({
          url: startUrl,
          interactive: true
        });

        const result = parseAuthFlowResult(callbackUrl);
        if (result.error || result.errorDescription) {
          throw new Error(result.errorDescription || result.error || "Authentication failed.");
        }
        if (result.state && result.state !== state) {
          throw new Error("Authentication failed (invalid state).");
        }

        const token = normalizeText(result.accessToken);
        if (!token) {
          throw new Error("Auth connector did not return access_token.");
        }

        storedSession = {
          connectorUrl,
          accessToken: token,
          accountLabel: normalizeText(result.accountLabel)
        };
        await saveStoredAuthSession(storedSession);
        updateActiveSessionFromStorage();
        connectionError = "";
      } catch (error) {
        const message = normalizeText(error?.message);
        if (message && isAuthCancelledMessage(message)) {
          connectionError = "Connector authentication was cancelled.";
        } else if (message) {
          connectionError = message;
        } else {
          connectionError = "Connector authentication failed.";
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

    async function sendMessage(text) {
      const cfg = getConfig();
      const endpoint = resolveEndpoint(cfg);
      const history = getHistory();
      const next = [...history, toMessage("user", text)];
      patchConfig({ history: next.slice(-40) });

      if (!endpoint) {
        patchConfig({
          history: [...next, toMessage("assistant", "Endpoint is required.")].slice(-40)
        });
        return;
      }

      const connectorUrl = getConnectorUrl();
      if (!connectorUrl) {
        patchConfig({
          history: [...next, toMessage("assistant", "Auth connector URL is required in settings.")].slice(-40)
        });
        return;
      }

      const token = activeSession?.accessToken;
      if (!token) {
        patchConfig({
          history: [...next, toMessage("assistant", "Tap Connect above to authenticate before sending messages.")].slice(-40)
        });
        return;
      }

      try {
        const reply =
          cfg.providerMode === "browser"
            ? await callOpenAIBrowserMode(cfg, history, text, token)
            : await callOpenAIStyleApi(cfg, history, text, token);

        patchConfig({ history: [...next, toMessage("assistant", reply)].slice(-40) });
      } catch (error) {
        patchConfig({
          history: [...next, toMessage("assistant", `Request failed: ${error.message}`)].slice(-40)
        });
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
