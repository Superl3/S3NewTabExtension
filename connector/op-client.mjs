// Read-only OpenProject client for the new-tab widgets. The API token stays here (connector side);
// the extension only receives the compact lists below.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_OP_BASE_URL = "https://work.clerobotics.com";
const CLOSED_LIKE_STATUSES = new Set(["Resolved", "Closed", "Rejected", "마감완료"]);
const CACHE_MS = 60_000;

export class OpError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "OpError";
    this.code = code;
    this.status = status;
  }
}

export function readOpToken(env = process.env) {
  const fromEnv = String(env.OPENPROJECT_TOKEN ?? "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    return fs.readFileSync(path.join(os.homedir(), ".config", "openproject", "token"), "utf8").trim();
  } catch {
    return "";
  }
}

export function parseProjectList(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^\d+$/.test(part))
    .map(Number);
}

function seoulParts(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function toAssignedItem(entry, baseUrl) {
  const links = entry?._links ?? {};
  return {
    id: entry.id,
    subject: String(entry.subject ?? ""),
    status: links.status?.title ?? "",
    project: links.project?.title ?? "",
    parent: links.parent?.title ?? "",
    due: entry.dueDate ?? "",
    url: `${baseUrl}/work_packages/${entry.id}`
  };
}

export function filterAssigned(items, { hideResolved = true, hideSamples = true } = {}) {
  return items.filter((item) => {
    if (hideResolved && CLOSED_LIKE_STATUSES.has(item.status)) {
      return false;
    }
    if (hideSamples && /샘플|sample/i.test(item.parent)) {
      return false;
    }
    return true;
  });
}

export function sortAssigned(items) {
  // Due date first (no due date last), then newest id first.
  return [...items].sort((a, b) => {
    if (a.due !== b.due) {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : 1;
    }
    return b.id - a.id;
  });
}

export function createOpClient({ baseUrl = DEFAULT_OP_BASE_URL, token = "", fetchImpl = globalThis.fetch, timeoutMs = 10_000, now = () => Date.now() } = {}) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const cache = new Map();
  const projectIdentifiers = new Map();

  async function get(apiPath) {
    if (!token) {
      throw new OpError("NO_TOKEN", "OpenProject 토큰이 없다. ~/.config/openproject/token 또는 OPENPROJECT_TOKEN을 설정해야 한다", 503);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${base}${apiPath}`, {
        headers: { Authorization: `Basic ${Buffer.from(`apikey:${token}`).toString("base64")}`, Accept: "application/hal+json" },
        redirect: "follow",
        signal: controller.signal
      });
    } catch (error) {
      throw new OpError(error?.name === "AbortError" ? "TIMEOUT" : "UNREACHABLE", "OpenProject에 연결하지 못했다", 504);
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
      throw new OpError("UNAUTHORIZED", "OpenProject 토큰이 거부됐다", 502);
    }
    if (!response.ok) {
      throw new OpError("OP_HTTP", `OpenProject 응답 ${response.status}`, 502);
    }
    return response.json();
  }

  async function cached(key, load) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) {
      return hit.value;
    }
    const value = await load();
    cache.set(key, { at: now(), value });
    return value;
  }

  async function projectIdentifier(projectHref) {
    const id = /\/projects\/(\d+)/.exec(projectHref ?? "")?.[1];
    if (!id) {
      return "";
    }
    if (!projectIdentifiers.has(id)) {
      try {
        projectIdentifiers.set(id, (await get(`/api/v3/projects/${id}`)).identifier ?? "");
      } catch {
        projectIdentifiers.set(id, "");
      }
    }
    return projectIdentifiers.get(id);
  }

  async function getAssigned({ hideResolved = true, hideSamples = true, max = 20 } = {}) {
    return cached(`assigned:${hideResolved}:${hideSamples}:${max}`, async () => {
      const filters = [{ assignee: { operator: "=", values: ["me"] } }, { status: { operator: "o", values: [] } }];
      const data = await get(`/api/v3/work_packages?pageSize=100&filters=${encodeURIComponent(JSON.stringify(filters))}`);
      const all = (data?._embedded?.elements ?? []).map((entry) => toAssignedItem(entry, base));
      const items = sortAssigned(filterAssigned(all, { hideResolved, hideSamples }));
      return { fetchedAt: new Date(now()).toISOString(), total: items.length, hidden: all.length - items.length, items: items.slice(0, max), openProjectUrl: base };
    });
  }

  async function getMeetings({ projects = [], daysBack = 7, daysAhead = 14 } = {}) {
    return cached(`meetings:${projects.join(",")}:${daysBack}:${daysAhead}`, async () => {
      const sortBy = encodeURIComponent(JSON.stringify([["startTime", "desc"]]));
      const data = await get(`/api/v3/meetings?pageSize=100&sortBy=${sortBy}`);
      const from = now() - daysBack * 86_400_000;
      const to = now() + daysAhead * 86_400_000;
      const rows = [];
      for (const entry of data?._embedded?.elements ?? []) {
        const start = Date.parse(entry.startTime ?? "");
        const projectHref = entry?._links?.project?.href ?? "";
        const projectId = Number(/\/projects\/(\d+)/.exec(projectHref)?.[1] ?? NaN);
        if (!Number.isFinite(start) || start < from || start > to) continue;
        if (projects.length && !projects.includes(projectId)) continue;
        const identifier = await projectIdentifier(projectHref);
        const { date, time } = seoulParts(entry.startTime);
        rows.push({
          id: entry.id,
          title: String(entry.title ?? ""),
          project: entry?._links?.project?.title ?? "",
          date,
          time,
          startsAt: entry.startTime,
          upcoming: start >= now(),
          url: identifier ? `${base}/projects/${identifier}/meetings/${entry.id}` : `${base}/meetings/${entry.id}`
        });
      }
      rows.sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
      return { fetchedAt: new Date(now()).toISOString(), meetings: rows, openProjectUrl: base };
    });
  }

  return { getAssigned, getMeetings };
}
