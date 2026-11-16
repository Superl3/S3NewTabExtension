import { fetchOpList, meetingDateLabel } from "./shared/opBridge.js";

const REFRESH_MS = 30 * 60_000;

function clock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export const opMeetingsWidget = {
  type: "opMeetings",
  title: "OpenProject 회의",
  defaultConfig: {
    openInNewTab: true
  },
  defaultLayout: {
    x: 1080,
    y: 120,
    w: 420,
    h: 300
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [{ key: "openInNewTab", label: "새 탭에서 열기", type: "checkbox" }],
  create({ container, getConfig, fetchList = fetchOpList }) {
    container.classList.add("op-widget");
    const shell = document.createElement("div");
    shell.className = "op-shell";
    const header = document.createElement("div");
    header.className = "op-header";
    const title = document.createElement("strong");
    title.className = "op-title";
    title.textContent = "OpenProject 회의";
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

    function section(label, meetings) {
      if (!meetings.length) return;
      const cfg = getConfig?.() ?? {};
      const heading = document.createElement("div");
      heading.className = "op-section";
      heading.textContent = label;
      const list = document.createElement("ul");
      list.className = "op-list";
      for (const meeting of meetings) {
        const li = document.createElement("li");
        li.className = `op-row${meeting.upcoming ? "" : " is-past"}`;
        const link = document.createElement("a");
        link.className = "op-row-link";
        link.href = meeting.url;
        if (cfg.openInNewTab !== false) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        const top = document.createElement("div");
        top.className = "op-row-top";
        const when = document.createElement("span");
        when.className = "op-when";
        when.textContent = meetingDateLabel(meeting.date, meeting.time);
        const name = document.createElement("span");
        name.className = "op-subject";
        name.textContent = meeting.title;
        top.append(when, name);
        const meta = document.createElement("div");
        meta.className = "op-row-meta";
        const project = document.createElement("span");
        project.className = "op-project muted";
        project.textContent = meeting.project;
        meta.append(project);
        link.append(top, meta);
        li.append(link);
        list.append(li);
      }
      body.append(heading, list);
    }

    function render() {
      body.replaceChildren();
      if (!result) {
        footer.textContent = "불러오는 중";
        return;
      }
      if (!result.ok) {
        const p = document.createElement("p");
        p.className = "op-empty muted";
        p.textContent = result.message;
        body.append(p);
        footer.textContent = lastSync ? `마지막 갱신 ${clock(lastSync)}` : "";
        return;
      }
      const meetings = result.data.meetings ?? [];
      const upcoming = meetings.filter((m) => m.upcoming);
      const past = meetings.filter((m) => !m.upcoming).reverse();
      section("다가오는 회의", upcoming);
      section("지난 회의 (최근 7일)", past);
      if (!meetings.length) {
        const p = document.createElement("p");
        p.className = "op-empty muted";
        p.textContent = "앞뒤 2주 안에 회의가 없다.";
        body.append(p);
      }
      footer.textContent = lastSync ? `갱신 ${clock(lastSync)}` : "";
    }

    async function load() {
      const next = await fetchList("/api/op/meetings", {});
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
