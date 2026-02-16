function localResponse(input) {
  if (input.includes("bookmark") || input.includes("북마크")) {
    return "북마크 위젯은 Folder path 또는 Folder ID를 바꾸면 바로 갱신됩니다.";
  }
  if (input.includes("todo") || input.includes("할 일")) {
    return "TODO 위젯은 체크박스로 완료를 토글하고, 설정에서 제목을 변경할 수 있어요.";
  }
  return "AI endpoint를 연결하면 실제 모델 응답을 받을 수 있습니다. 지금은 local reply 모드입니다.";
}

function toMessage(role, content) {
  return { role, content, ts: Date.now() };
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
    model: cfg.model || "gpt-4o-mini",
    temperature: Number(cfg.temperature ?? 0.7),
    messages
  };

  const response = await fetch(cfg.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No assistant content in response");
  }
  return String(content);
}

export const aiChatWidget = {
  type: "aiChat",
  title: "AI Chat",
  defaultConfig: {
    endpoint: "",
    apiKey: "",
    model: "gpt-4o-mini",
    systemPrompt: "You are a concise assistant in a browser new tab widget.",
    temperature: 0.7,
    localOnly: true,
    history: []
  },
  defaultLayout: {
    x: 40,
    y: 560,
    w: 520,
    h: 300
  },
  settingsSchema: [
    { key: "localOnly", label: "Local reply only", type: "checkbox" },
    { key: "endpoint", label: "Endpoint", type: "text", placeholder: "https://.../chat/completions" },
    { key: "apiKey", label: "API key", type: "password", placeholder: "sk-..." },
    { key: "model", label: "Model", type: "text", placeholder: "gpt-4o-mini" },
    { key: "temperature", label: "Temperature", type: "number", min: 0, max: 2, step: 0.1 },
    { key: "systemPrompt", label: "System prompt", type: "textarea" }
  ],
  create({ container, getConfig, patchConfig }) {
    const status = document.createElement("div");
    const list = document.createElement("ul");
    const form = document.createElement("form");
    const input = document.createElement("input");
    const send = document.createElement("button");

    status.className = "chip";
    list.className = "chat-list";
    form.className = "chat-form";

    input.type = "text";
    input.placeholder = "Ask something";
    send.type = "submit";
    send.className = "btn btn-primary";
    send.textContent = "Send";

    form.append(input, send);
    container.append(status, list, form);

    function getHistory() {
      const cfg = getConfig();
      return Array.isArray(cfg.history) ? cfg.history : [];
    }

    function render() {
      const cfg = getConfig();
      status.textContent = cfg.localOnly || !cfg.endpoint ? "Local mode" : "Endpoint mode";
      list.replaceChildren();

      for (const msg of getHistory()) {
        const li = document.createElement("li");
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${msg.role === "user" ? "user" : "assistant"}`;
        bubble.textContent = msg.content;
        li.append(bubble);
        list.append(li);
      }

      list.scrollTop = list.scrollHeight;
    }

    async function sendMessage(text) {
      const cfg = getConfig();
      const history = getHistory();
      const next = [...history, toMessage("user", text)];
      patchConfig({ history: next.slice(-40) });

      try {
        let reply = "";
        if (cfg.localOnly || !cfg.endpoint) {
          reply = localResponse(text);
        } else {
          reply = await callOpenAIStyleApi(cfg, next, text);
        }
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
