import { dueLabel, fetchOpList, todayInSeoul } from "./shared/opBridge.js";

const REFRESH_MS = 10 * 60_000;

function clock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export const opAssignedWidget = {
  type: "opAssigned",
  title: "OpenProject 내 작업",
  defaultConfig: {
    hideResolved: true,
    hideSamples: true,
    maxItems: 20,
    openInNewTab: true
  },
  defaultLayout: {
    x: 1080,
    y: 520,
    w: 520,
    h: 360
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [
    { key: "hideResolved", label: "Resolved 숨기기", type: "checkbox" },
    { key: "hideSamples", label: "샘플 이슈 숨기기", type: "checkbox" },
    { key: "maxItems", label: "최대 개수", type: "number", min: 1, max: 50, step: 1 },
    { key: "openInNewTab", label: "새 탭에서 열기", type: "checkbox" }
  ],
  create({ container, getConfig, fetchList = fetchOpList, now = () => new Date() }) {
    container.classList.add("op-widget");
    const shell = document.createElement("div");
    shell.className = "op-shell";
    const header = document.createElement("div");
    header.className = "op-header";
    const title = document.createElement("strong");
    title.className = "op-title";
    title.textContent = "";
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "btn op-refresh";
    refreshBtn.textContent = "Refresh";
    header.append(title, refreshBtn);
    const body = document.createElement("div");
    body.className = "op-body";
    const footer = document.createElement("div");
    footer.className = "op-footer muted";
    shell.append(header, body, footer);
    container.replaceChildren(shell);

    let result = null;
    let lastSync = null;
    let destroyed = false;

    function message(text) {
      const p = document.createElement("p");
      p.className = "op-empty muted";
      p.textContent = text;
      body.append(p);
    }

    function render() {
      body.replaceChildren();
      const cfg = getConfig?.() ?? {};
      if (!result) {
        footer.textContent = "불러오는 중";
        return;
      }
      if (!result.ok) {
        title.textContent = "";
        message(result.message);
        footer.textContent = lastSync ? `마지막 갱신 ${clock(lastSync)}` : "";
        return;
      }
      const { items, total, hidden, openProjectUrl } = result.data;
      title.textContent = `열린 작업 ${total}건`;
      if (!items.length) {
        message("열린 작업이 없다.");
      }
      const list = document.createElement("ul");
      list.className = "op-list";
      const today = todayInSeoul(now());
      for (const item of items) {
        const li = document.createElement("li");
        li.className = "op-row";
        const link = document.createElement("a");
        link.className = "op-row-link";
        link.href = item.url;
        if (cfg.openInNewTab !== false) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        const top = document.createElement("div");
        top.className = "op-row-top";
        const id = document.createElement("span");
        id.className = "op-id";
        id.textContent = `#${item.id}`;
        const subject = document.createElement("span");
        subject.className = "op-subject";
        subject.textContent = item.subject;
        top.append(id, subject);
        const meta = document.createElement("div");
        meta.className = "op-row-meta";
        const status = document.createElement("span");
        status.className = "op-status";
        status.textContent = item.status;
        const due = dueLabel(item.due, today);
        const dueEl = document.createElement("span");
        dueEl.className = `op-due is-${due.tone}`;
        dueEl.textContent = due.text;
        const project = document.createElement("span");
        project.className = "op-project muted";
        project.textContent = item.project;
        meta.append(status, dueEl, project);
        link.append(top, meta);
        li.append(link);
        list.append(li);
      }
      body.append(list);
      const notes = [];
      if (lastSync) notes.push(`갱신 ${clock(lastSync)}`);
      if (hidden) notes.push(`숨김 ${hidden}건 (Resolved·샘플)`);
      const summary = document.createElement("span");
      summary.textContent = notes.length ? `${notes.join(" · ")} · ` : "";
      footer.replaceChildren(summary);
      if (openProjectUrl) {
        const all = document.createElement("a");
        all.className = "op-footer-link";
        all.href = `${openProjectUrl}/my/page`;
        all.target = "_blank";
        all.rel = "noopener noreferrer";
        all.textContent = "OpenProject 열기";
        footer.append(all);
      }
    }

    async function load() {
      const cfg = getConfig?.() ?? {};
      const next = await fetchList("/api/op/assigned", {
        hideResolved: cfg.hideResolved !== false,
        hideSamples: cfg.hideSamples !== false,
        max: Number(cfg.maxItems) || 20
      });
      if (destroyed) return;
      result = next;
      if (next.ok) lastSync = new Date();
      render();
    }

    refreshBtn.addEventListener("click", (event) => {
      event.preventDefault();
      void load();
    });
    const timer = setInterval(() => void load(), REFRESH_MS);
    render();
    void load();

    return {
      refresh() {
        void load();
      },
      destroy() {
        destroyed = true;
        clearInterval(timer);
      }
    };
  }
};
