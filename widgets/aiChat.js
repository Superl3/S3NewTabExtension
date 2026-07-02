import { arrayOrEmpty } from "../core/utils/array.js";
import { normalizeErrorMessage } from "../core/utils/error.js";
import { toFiniteNumber } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import {
  connectWithAuthConnector,
  isAuthCancelledMessage,
  LOCAL_AUTH_CONNECTOR_URL,
  normalizeLocalAuthConnectorUrl as normalizeConnectorUrl,
  rewriteAuthorizationLoadError
} from "./shared/authConnector.js";
import {
  createAuthSessionStorage,
  resolveActiveAuthSession
} from "./shared/authSessionStorage.js";
import { getChromeIdentity, getChromeStorageLocal } from "./shared/chromeApi.js";

function toMessage(role, content) {
  return { role, content, ts: Date.now() };
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

  const out = [];
  for (const part of arrayOrEmpty(value)) {
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

  for (const item of arrayOrEmpty(data?.output)) {
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
const authSessionStorage = createAuthSessionStorage({
  storageKey: AI_CHAT_AUTH_STORAGE_KEY,
  getStorageArea: getChromeStorageLocal,
  normalizeConnectorUrl
});

export function normalizeAiChatTemperature(value, fallback = 0.7) {
  return toFiniteNumber(value ?? fallback, fallback);
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
    temperature: normalizeAiChatTemperature(cfg.temperature),
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
    temperature: normalizeAiChatTemperature(cfg.temperature)
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
      return arrayOrEmpty(cfg.history);
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
      activeSession = resolveActiveAuthSession({
        connectorUrl,
        configuredAccessToken: getConfiguredAccessToken(),
        storedSession
      });
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
        text = "Add a connector URL or access token in settings to enable AI Chat.";
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
        connectionError = "Add a connector URL or access token in settings before connecting.";
        render();
        return;
      }

      isConnecting = true;
      connectionError = "";
      render();

      try {
        const result = await connectWithAuthConnector({
          connectorUrl,
          configuredAccessToken: configuredToken,
          provider: "openai",
          providerLabel: "Authentication",
          authFlowFailureMessage: "Authentication failed.",
          unableTokenMessage:
            "Unable to obtain connector token. Check the connector URL or add an access token in settings.",
          getIdentityApi: getChromeIdentity
        });

        if (!configuredToken) {
          storedSession = {
            connectorUrl,
            accessToken: result.accessToken,
            accountLabel: result.accountLabel
          };
          await authSessionStorage.save(storedSession);
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
      await authSessionStorage.clear();
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
        appendAssistantMessage("Add an endpoint in settings before sending messages.");
        return;
      }

      const connectorUrl = getConnectorUrl();
      if (!connectorUrl && !activeSession?.accessToken) {
        appendAssistantMessage("Add a connector URL or access token in settings before sending messages.");
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
        appendAssistantMessage("Request failed. Check the endpoint, model, and access token in settings, then try again.");
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
      storedSession = await authSessionStorage.load();
      render();
    })();

    render();

    return {
      refresh: render
    };
  }
};
