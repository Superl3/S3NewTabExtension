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

async function throwHttpError(response) {
  const body = normalizeText(await response.text());
  throw new Error(body ? `HTTP ${response.status}: ${body}` : `HTTP ${response.status}`);
}

async function callOpenAIStyleApi(cfg, history, text) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
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

async function callOpenAIBrowserMode(cfg, history, text) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
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
    apiKey: "",
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
    { key: "apiKey", label: "API key", type: "password", placeholder: "sk-..." },
    { key: "model", label: "Model", type: "text", placeholder: "gpt-4o-mini" },
    { key: "temperature", label: "Temperature", type: "number", min: 0, max: 2, step: 0.1 },
    { key: "systemPrompt", label: "System prompt", type: "textarea" }
  ],
  create({ container, getConfig, patchConfig }) {
    const log = document.createElement("div");
    const list = document.createElement("ul");
    const form = document.createElement("form");
    const input = document.createElement("input");
    const send = document.createElement("button");

    container.classList.add("ai-chat-widget");
    log.className = "chat-log";
    list.className = "chat-list";
    form.className = "chat-form";

    input.type = "text";
    input.placeholder = "Ask something";
    send.type = "submit";
    send.className = "btn btn-primary";
    send.textContent = "Send";

    form.append(input, send);
    log.append(list);
    container.append(log, form);

    function getHistory() {
      const cfg = getConfig();
      return Array.isArray(cfg.history) ? cfg.history : [];
    }

    function render() {
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

      if (!normalizeText(cfg.apiKey)) {
        patchConfig({
          history: [...next, toMessage("assistant", "API key is required.")].slice(-40)
        });
        return;
      }

      try {
        const reply =
          cfg.providerMode === "browser"
            ? await callOpenAIBrowserMode(cfg, history, text)
            : await callOpenAIStyleApi(cfg, history, text);

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

    render();

    return {
      refresh: render
    };
  }
};
