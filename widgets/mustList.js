import { createMustBridge } from "../core/must-gate/must-bridge.js";
import { buildMustItem } from "../core/must-gate/must-gate-view.js";

const REFRESH_MS = 60_000;

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export const mustListWidget = {
  type: "mustList",
  title: "Must",
  defaultConfig: {
    showRecent: false
  },
  defaultLayout: {
    x: 40,
    y: 40,
    w: 420,
    h: 360
  },
  defaultGridSize: {
    w: 3,
    h: 3
  },
  settingsSchema: [
    {
      key: "showRecent",
      label: "Show recently closed",
      type: "checkbox"
    }
  ],
  create({ container, getConfig, bridge = createMustBridge() }) {
    container.classList.add("must-list-widget");

    const shell = document.createElement("div");
    shell.className = "must-list-shell";
    const header = document.createElement("div");
    header.className = "must-list-header";
    const title = document.createElement("strong");
    title.className = "must-list-title";
    title.textContent = "";
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "btn must-list-refresh";
    refreshBtn.textContent = "Refresh";
    header.append(title, refreshBtn);

    const capture = document.createElement("form");
    capture.className = "must-list-capture";
    const captureInput = document.createElement("input");
    captureInput.type = "text";
    captureInput.className = "must-gate-input";
    captureInput.placeholder = "할 일 한 줄 (기한은 7일 뒤로 잡힌다)";
    const captureBtn = document.createElement("button");
    captureBtn.type = "submit";
    captureBtn.className = "btn btn-primary";
    captureBtn.textContent = "Add";
    capture.append(captureInput, captureBtn);

    const body = document.createElement("div");
    body.className = "must-list-body";
    const footer = document.createElement("div");
    footer.className = "must-list-footer muted";
    shell.append(header, capture, body, footer);
    container.replaceChildren(shell);

    let state = null;
    let offline = false;
    let ui = { openId: "", openAction: "", busy: false, error: "" };
    let lastSync = null;
    let timer = null;
    let destroyed = false;

    const handlers = {
      onToggle(id, action) {
        ui =
          ui.openId === id && ui.openAction === action
            ? { ...ui, openId: "", openAction: "", error: "" }
            : { ...ui, openId: id, openAction: action, error: "" };
        render();
      },
      onSubmit(id, action, payload) {
        return run(() => bridge[action](id, payload));
      },
      onPromote(id) {
        return run(() => bridge.promote(id));
      },
      onExpand(id) {
        ui = ui.openId === id ? { ...ui, openId: "", openAction: "", error: "" } : { ...ui, openId: id, openAction: "", error: "" };
        render();
      }
    };

    async function run(call) {
      if (ui.busy) {
        return;
      }
      ui = { ...ui, busy: true, error: "" };
      render();
      const result = await call();
      if (destroyed) {
        return;
      }
      ui = { ...ui, busy: false };
      if (result.ok) {
        state = result.state;
        offline = false;
        lastSync = new Date();
        ui = { openId: "", openAction: "", busy: false, error: "" };
      } else if (result.offline) {
        offline = true;
      } else {
        ui = { ...ui, error: result.error?.message || "처리하지 못했다." };
      }
      render();
    }

    function section(label, items, { promote }) {
      if (!items.length) {
        return;
      }
      const heading = document.createElement("div");
      heading.className = "must-list-section";
      heading.textContent = `${label} ${items.length}`;
      const list = document.createElement("ul");
      list.className = "must-list-items";
      for (const item of items) {
        list.append(buildMustItem({ documentObj: document, item, state, ui, handlers, allowPromote: promote, compact: true }));
      }
      body.append(heading, list);
    }

    function render() {
      body.replaceChildren();
      if (offline) {
        const note = document.createElement("p");
        note.className = "must-list-empty muted";
        note.textContent = "커넥터에 연결되지 않았다. node connector/server.mjs 를 실행하고 MUST_FILE·ALLOWED_EXTENSION_IDS를 설정해야 한다.";
        body.append(note);
        title.textContent = "";
        footer.textContent = lastSync ? `마지막 갱신 ${formatClock(lastSync)}` : "오프라인";
        return;
      }
      if (!state) {
        footer.textContent = "불러오는 중";
        return;
      }
      title.textContent = `지금 할 것 ${state.must.length}/${state.cap} · 대기 ${state.waiting.length} · 목록 ${state.list.length}`;
      section("Must", state.must, { promote: false });
      section("대기", state.waiting, { promote: false });
      section("목록", state.list, { promote: true });
      if (getConfig?.()?.showRecent && state.recent.length) {
        const heading = document.createElement("div");
        heading.className = "must-list-section";
        heading.textContent = "최근 닫힘";
        const list = document.createElement("ul");
        list.className = "must-list-recent";
        for (const entry of state.recent) {
          const li = document.createElement("li");
          li.textContent = `${entry.closed.slice(5)} ${entry.state === "done" ? "끝" : "버림"} · ${entry.title}`;
          list.append(li);
        }
        body.append(heading, list);
      }
      if (!state.must.length && !state.waiting.length && !state.list.length) {
        const empty = document.createElement("p");
        empty.className = "must-list-empty muted";
        empty.textContent = "열린 항목이 없다.";
        body.append(empty);
      }
      if (ui.error) {
        const error = document.createElement("p");
        error.className = "must-gate-error";
        error.setAttribute("role", "alert");
        error.textContent = ui.error;
        body.append(error);
      }
      footer.textContent = lastSync ? `마지막 갱신 ${formatClock(lastSync)}` : "";
    }

    async function load() {
      const result = await bridge.load();
      if (destroyed) {
        return;
      }
      if (result.ok) {
        state = result.state;
        offline = false;
        lastSync = new Date();
      } else if (result.offline) {
        offline = true;
      }
      render();
    }

    refreshBtn.addEventListener("click", (event) => {
      event.preventDefault();
      void load();
    });
    capture.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = captureInput.value.trim();
      if (!text) {
        return;
      }
      captureInput.value = "";
      void run(() => bridge.capture({ title: text }));
    });

    timer = setInterval(() => void load(), REFRESH_MS);
    render();
    void load();

    return {
      refresh() {
        render();
      },
      destroy() {
        destroyed = true;
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }
    };
  }
};
