import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { OpError, createOpClient, filterAssigned, parseProjectList, sortAssigned } from "../connector/op-client.mjs";
import { handleOpRoute, isOpPath } from "../connector/op-routes.mjs";
import { dueLabel, meetingDateLabel } from "../widgets/shared/opBridge.js";
import { widgetMetadata } from "../widgets/metadata.js";
import { groupWidgetDefinitionsByCategory } from "../core/widget-type-categories.js";
import { FakeDocument, FakeEl, findAll, textOf } from "./helpers/fake-dom.mjs";

const NOW = Date.parse("2026-11-16T05:00:00Z"); // 14:00 Seoul
const flush = () => new Promise((resolve) => setImmediate(resolve));

function wp(id, status, due, extra = {}) {
  return {
    id,
    subject: `작업 ${id}`,
    dueDate: due,
    _links: { status: { title: status }, project: { title: "프로젝트" }, parent: extra.parent ? { title: extra.parent } : {} }
  };
}

function fakeOp(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    const pathname = new URL(url).pathname;
    const body = routes[pathname];
    if (typeof body === "number") return { ok: false, status: body, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
  return { impl, calls };
}

test("assigned list hides Resolved and sample issues, sorts by due (none last), and links to the work package", async () => {
  const { impl, calls } = fakeOp({
    "/api/v3/work_packages": {
      _embedded: {
        elements: [
          wp(10, "Resolved", "2026-10-01"),
          wp(72, "In progress", null, { parent: "─── 📌 샘플 이슈 리스트 ───" }),
          wp(901, "In progress", "2026-11-09"),
          wp(950, "New", null),
          wp(940, "New", "2026-11-20")
        ]
      }
    }
  });
  const client = createOpClient({ baseUrl: "https://op.test/", token: "tok", fetchImpl: impl, now: () => NOW });
  const result = await client.getAssigned({});
  assert.deepEqual(result.items.map((x) => x.id), [901, 940, 950]);
  assert.equal(result.hidden, 2);
  assert.equal(result.items[0].url, "https://op.test/work_packages/901");
  assert.equal(calls[0].auth, `Basic ${Buffer.from("apikey:tok").toString("base64")}`);
  assert.match(decodeURIComponent(calls[0].url), /"assignee":\{"operator":"=","values":\["me"\]\}/);
  await client.getAssigned({});
  assert.equal(calls.length, 1, "second call within 60s is served from cache");
  const all = filterAssigned([{ status: "Resolved", parent: "" }, { status: "New", parent: "샘플" }], { hideResolved: false, hideSamples: false });
  assert.equal(all.length, 2);
  assert.deepEqual(sortAssigned([{ id: 1, due: "" }, { id: 2, due: "2026-01-01" }]).map((x) => x.id), [2, 1]);
});

test("meetings: window, project filter, Seoul time and project-scoped links", async () => {
  const meeting = (id, start, project) => ({ id, title: `회의 ${id}`, startTime: start, _links: { project: { href: `/api/v3/projects/${project}`, title: `P${project}` } } });
  const { impl } = fakeOp({
    "/api/v3/meetings": {
      _embedded: {
        elements: [
          meeting(1, "2026-11-20T04:00:00.000Z", 28),
          meeting(2, "2026-11-13T04:00:00.000Z", 28),
          meeting(3, "2026-11-17T04:00:00.000Z", 99),
          meeting(4, "2026-10-01T04:00:00.000Z", 28)
        ]
      }
    },
    "/api/v3/projects/28": { identifier: "team-1" }
  });
  const client = createOpClient({ baseUrl: "https://op.test", token: "t", fetchImpl: impl, now: () => NOW });
  const { meetings } = await client.getMeetings({ projects: [28] });
  assert.deepEqual(meetings.map((m) => [m.id, m.date, m.time, m.upcoming]), [[2, "2026-11-13", "13:00", false], [1, "2026-11-20", "13:00", true]]);
  assert.equal(meetings[1].url, "https://op.test/projects/team-1/meetings/1");
  assert.deepEqual(parseProjectList("28, x, 31,"), [28, 31]);
});

test("missing token and rejected token give clear errors", async () => {
  await assert.rejects(createOpClient({ token: "" }).getAssigned({}), (e) => e instanceof OpError && e.code === "NO_TOKEN");
  const { impl } = fakeOp({ "/api/v3/work_packages": 401 });
  await assert.rejects(createOpClient({ token: "bad", fetchImpl: impl }).getAssigned({}), (e) => e.code === "UNAUTHORIZED");
});

async function withServer(client, fn) {
  let port = 0;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://x").pathname;
    if (!isOpPath(pathname)) return res.writeHead(404).end();
    void handleOpRoute({ req, res, pathname, method: req.method, client, meetingProjects: [28], guardOptions: { allowedExtensionIds: new Set(["a".repeat(32)]), port } });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

function call(port, method, pathname, origin = `chrome-extension://${"a".repeat(32)}`) {
  return new Promise((resolve, reject) => {
    const body = method === "POST" ? "{}" : null;
    const headers = { Host: `127.0.0.1:${port}`, ...(origin ? { Origin: origin } : {}), ...(body ? { "Content-Type": "application/json", "Content-Length": 2 } : {}) };
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, json: d ? JSON.parse(d) : null }));
    });
    req.on("error", reject);
    req.end(body ?? undefined);
  });
}

test("routes: extension origin only, POST only, meetings use the configured projects, no client means 503", async () => {
  const seen = [];
  const client = {
    getAssigned: async (opts) => (seen.push(["a", opts]), { items: [], total: 0, hidden: 0 }),
    getMeetings: async (opts) => (seen.push(["m", opts]), { meetings: [] })
  };
  await withServer(client, async (port) => {
    assert.equal((await call(port, "POST", "/api/op/assigned", "https://evil.example")).status, 403);
    assert.equal((await call(port, "POST", "/api/op/assigned", "")).status, 403);
    assert.equal((await call(port, "GET", "/api/op/assigned")).status, 405);
    assert.equal((await call(port, "POST", "/api/op/assigned")).status, 200);
    assert.equal((await call(port, "POST", "/api/op/meetings")).status, 200);
  });
  assert.deepEqual(seen, [["a", { hideResolved: true, hideSamples: true, max: 20 }], ["m", { projects: [28] }]]);
  await withServer(null, async (port) => {
    assert.equal((await call(port, "POST", "/api/op/meetings")).json.error.code, "NOT_CONFIGURED");
  });
});

test("labels: due tone and meeting weekday", () => {
  assert.deepEqual(dueLabel("2026-11-09", "2026-11-16"), { text: "7일 지남 (11-09)", tone: "overdue" });
  assert.deepEqual(dueLabel("2026-11-18", "2026-11-16"), { text: "D-2 (11-18)", tone: "soon" });
  assert.deepEqual(dueLabel("", "2026-11-16"), { text: "기한 없음", tone: "muted" });
  assert.equal(meetingDateLabel("2026-11-20", "13:00"), "11-20 (금) 13:00");
});

async function mountWidget(modulePath, exportName, fetchList, config = {}) {
  const previous = globalThis.document;
  globalThis.document = new FakeDocument();
  try {
    const mod = await import(modulePath);
    const container = new FakeEl("div", globalThis.document);
    const controller = mod[exportName].create({ container, getConfig: () => config, fetchList, now: () => new Date(NOW) });
    await flush();
    return { container, controller };
  } finally {
    globalThis.document = previous;
  }
}

test("opAssigned renders rows with status and due, and explains when the connector is down", async () => {
  const data = { items: [{ id: 901, subject: "현장 수정분 보존", status: "In progress", project: "로보월드", due: "2026-11-09", url: "https://op.test/work_packages/901" }], total: 1, hidden: 12, openProjectUrl: "https://op.test" };
  const { container, controller } = await mountWidget("../widgets/opAssigned.js", "opAssignedWidget", async () => ({ ok: true, data }));
  const text = textOf(container);
  assert.match(text, /열린 작업 1건/);
  assert.match(text, /#901/);
  assert.match(text, /7일 지남 \(11-09\)/);
  assert.match(text, /숨김 12건/);
  assert.equal(findAll(container, (n) => n.tagName === "A")[0].href, "https://op.test/work_packages/901");
  controller.destroy();
  const offline = await mountWidget("../widgets/opAssigned.js", "opAssignedWidget", async () => ({ ok: false, offline: true, message: "커넥터에 연결되지 않았다" }));
  assert.match(textOf(offline.container), /커넥터에 연결되지 않았다/);
  offline.controller.destroy();
});

test("opMeetings splits upcoming and past", async () => {
  const meetings = [
    { id: 114, title: "주간 미팅", project: "선행연구1팀", date: "2026-11-13", time: "13:00", upcoming: false, url: "u1" },
    { id: 138, title: "주간 미팅", project: "선행연구1팀", date: "2026-11-20", time: "13:00", upcoming: true, url: "u2" }
  ];
  const { container, controller } = await mountWidget("../widgets/opMeetings.js", "opMeetingsWidget", async () => ({ ok: true, data: { meetings } }));
  const text = textOf(container);
  assert.ok(text.indexOf("다가오는 회의") < text.indexOf("11-20 (금) 13:00"));
  assert.ok(text.indexOf("지난 회의") < text.indexOf("11-13 (금) 13:00"));
  controller.destroy();
});

test("Monday widgets are hidden from Add Widget and the OpenProject ones are offered under Work", () => {
  const byType = Object.fromEntries(widgetMetadata.map((m) => [m.type, m]));
  assert.equal(byType.mondayAssigned.hiddenFromAddWidget, true);
  assert.equal(byType.mondayMeetingNote.hiddenFromAddWidget, true);
  const work = groupWidgetDefinitionsByCategory(widgetMetadata).find((g) => g.label === "Work").widgets.map((w) => w.type);
  assert.ok(work.includes("opAssigned") && work.includes("opMeetings"));
  assert.ok(!work.includes("mondayAssigned") && !work.includes("mondayMeetingNote"));
});
