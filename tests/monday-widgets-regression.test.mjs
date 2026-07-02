import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { normalizeErrorMessage } from "../core/utils/error.js";
import { arrayOrEmpty } from "../core/utils/array.js";
import { parseJsonOrNull } from "../core/utils/json.js";
import { clamp } from "../core/utils/number.js";
import { normalizeText } from "../core/utils/text.js";
import {
  isAuthCancelledMessage,
  LOCAL_AUTH_CONNECTOR_URL,
  normalizeLocalAuthConnectorUrl as normalizeConnectorUrl,
  rewriteAuthorizationLoadError
} from "../widgets/shared/authConnector.js";
import { hasActiveAuthConnection } from "../widgets/shared/authSessionStorage.js";
import { formatLocalDateTimeLabel as formatDateLabel } from "../widgets/shared/dateLabels.js";
import { MONDAY_AUTH_STORAGE_KEY } from "../widgets/shared/mondayConfig.js";
import { parseUrlSafely } from "../widgets/shared/mondayClient.js";

const REPO_ROOT = process.cwd();

async function loadWidgetInternals(relativePath, exportedNames, injected = {}) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  const source = await fs.readFile(absolutePath, "utf8");
  const withoutImports = source
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/^export\s+/gm, "");
  const exportStatement = `\nmodule.exports = { ${exportedNames.join(", ")} };\n`;
  const scriptSource = `${withoutImports}${exportStatement}`;

  const context = {
    module: { exports: {} },
    exports: {},
    console,
    setTimeout,
    clearTimeout,
    chrome: {},
    clamp,
    getChromeIdentity: () => null,
    getChromeStorageChanges: () => null,
    getChromeStorageLocal: () => null,
    hasActiveAuthConnection,
    isAuthCancelledMessage,
    LOCAL_AUTH_CONNECTOR_URL,
    MONDAY_AUTH_STORAGE_KEY,
    formatDateLabel,
    normalizeErrorMessage,
    normalizeConnectorUrl,
    parseUrlSafely,
    parseJsonOrNull,
    rewriteAuthorizationLoadError,
    arrayOrEmpty,
    normalizeText,
    ...injected
  };

  vm.runInNewContext(scriptSource, context, { filename: relativePath });
  return context.module.exports;
}

test("mondayAssigned resolves people column selector without missing normalizer", async () => {
  const { resolvePeopleColumnIds } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["resolvePeopleColumnIds"],
    {
      normalizeColumnSelector: (value) => String(value || "").trim(),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  const peopleColumns = [
    { id: "people_main", title: "People" },
    { id: "people_owner", title: "Owner" }
  ];

  const resolved = resolvePeopleColumnIds(peopleColumns, " owner ");
  assert.deepEqual(Array.from(resolved), ["people_owner"]);
});

test("mondayAssigned normalizes column ids without undefined helper", async () => {
  const { normalizeColumnIds } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["normalizeColumnIds"],
    {
      normalizeColumnSelector: (value) => String(value || "").trim(),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  const normalized = normalizeColumnIds([" status ", "", "done "]);
  assert.deepEqual(Array.from(normalized), ["status", "done"]);
});

test("mondayAssigned keeps per-board people selectors isolated", async () => {
  const { resolveBoardPeopleColumnSelector } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["resolveBoardPeopleColumnSelector"],
    {
      normalizeColumnSelector: (value) => String(value || "").trim(),
      parseColumnSelectorList: (value) =>
        String(value || "")
          .split(",")
          .map((entry) => String(entry || "").trim())
          .filter(Boolean),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  const cfg = { peopleColumnId: "owner, reporter, *" };
  assert.equal(resolveBoardPeopleColumnSelector(cfg, 0), "owner");
  assert.equal(resolveBoardPeopleColumnSelector(cfg, 1), "reporter");
  assert.equal(resolveBoardPeopleColumnSelector(cfg, 2), "*");
  assert.equal(resolveBoardPeopleColumnSelector(cfg, 3), "");

  const singleSelectorCfg = { peopleColumnId: "owner" };
  assert.equal(resolveBoardPeopleColumnSelector(singleSelectorCfg, 0), "owner");
  assert.equal(resolveBoardPeopleColumnSelector(singleSelectorCfg, 5), "owner");
});

test("mondayAssigned fallback snapshot preserves known board metadata for empty boards", async () => {
  const { createFallbackBoardSnapshot } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["createFallbackBoardSnapshot"],
    {
      normalizeBoardId: (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
      },
      normalizeSharedConnectorUrl: (value) => String(value || "").trim(),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  const snapshot = createFallbackBoardSnapshot(
    321,
    "assigned",
    {
      boardName: "Platform Board",
      boardUrl: "https://workspace.monday.com/boards/321",
      boardGroups: [{ id: "topics", title: "Topics" }],
      meName: "OpenCode"
    },
    {
      boardName: "Old Name",
      boardUrl: "https://workspace.monday.com/boards/old",
      boardGroups: [{ id: "old", title: "Old" }],
      assigneeName: "Someone"
    }
  );

  assert.equal(snapshot.boardId, 321);
  assert.equal(snapshot.boardName, "Platform Board");
  assert.equal(snapshot.boardUrl, "https://workspace.monday.com/boards/321");
  assert.equal(Array.isArray(snapshot.boardGroups), true);
  assert.equal(snapshot.boardGroups.length, 1);
  assert.equal(snapshot.boardGroups[0]?.id, "topics");
  assert.equal(snapshot.boardGroups[0]?.title, "Topics");
  assert.equal(snapshot.assigneeName, "OpenCode");
  assert.equal(snapshot.scopeMode, "assigned");
  assert.equal(Array.isArray(snapshot.issues), true);
  assert.equal(snapshot.issues.length, 0);
});

test("mondayAssigned fallback snapshot reuses previous board metadata when refresh fails early", async () => {
  const { createFallbackBoardSnapshot } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["createFallbackBoardSnapshot"],
    {
      normalizeBoardId: (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
      },
      normalizeSharedConnectorUrl: (value) => String(value || "").trim(),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  const snapshot = createFallbackBoardSnapshot(
    654,
    "all",
    null,
    {
      boardName: "Roadmap Board",
      boardUrl: "https://workspace.monday.com/boards/654",
      boardGroups: [{ id: "done", title: "Done" }],
      assigneeName: "me"
    }
  );

  assert.equal(snapshot.boardName, "Roadmap Board");
  assert.equal(snapshot.boardUrl, "https://workspace.monday.com/boards/654");
  assert.equal(snapshot.scopeMode, "all");
  assert.equal(snapshot.assigneeName, "all tasks");
  assert.equal(snapshot.boardGroups.length, 1);
});

test("mondayAssigned header text uses board names for empty boards", async () => {
  const { buildBoardHeaderText } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["buildBoardHeaderText"],
    {
      normalizeBoardId: (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
      },
      normalizeSharedConnectorUrl: (value) => String(value || "").trim(),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  assert.equal(
    buildBoardHeaderText({ boardId: 88, boardName: "Design Board" }, 0, false),
    "Design Board (Empty)"
  );
  assert.equal(
    buildBoardHeaderText({ boardId: 88, boardName: "Design Board" }, 4, false),
    "Design Board (4 assigned)"
  );
});

test("mondayAssigned detects incomplete cached board metadata from legacy fallback names", async () => {
  const { hasIncompleteBoardMetadata } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["hasIncompleteBoardMetadata"],
    {
      normalizeBoardId: (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
      },
      normalizeSharedConnectorUrl: (value) => String(value || "").trim(),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  assert.equal(
    hasIncompleteBoardMetadata([
      { boardId: 42, boardName: "Board 42", boardUrl: "https://workspace.monday.com/boards/42" }
    ]),
    true
  );
  assert.equal(
    hasIncompleteBoardMetadata([
      { boardId: 42, boardName: "Platform Board", boardUrl: "https://workspace.monday.com/boards/42" }
    ]),
    false
  );
});

test("mondayAssigned openHref follows widget tab setting for board navigation", async () => {
  const { openHref } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["openHref"],
    {
      normalizeSharedConnectorUrl: (value) => String(value || "").trim(),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      }),
      window: {
        location: { href: "https://initial.example.com/" },
        open: () => {}
      }
    }
  );

  const locationRef = { href: "https://initial.example.com/" };
  const opened = [];
  const openImpl = (...args) => opened.push(args);

  openHref("https://workspace.monday.com/boards/11", true, locationRef, openImpl);
  assert.deepEqual(opened, [["https://workspace.monday.com/boards/11", "_blank", "noopener,noreferrer"]]);
  assert.equal(locationRef.href, "https://initial.example.com/");

  openHref("https://workspace.monday.com/boards/12", false, locationRef, openImpl);
  assert.equal(locationRef.href, "https://workspace.monday.com/boards/12");
});

test("mondayMeetingNote fallback scan can include newer items in later groups", async () => {
  const { buildFallbackLatestQuery, pickLatestItem } = await loadWidgetInternals(
    "widgets/mondayMeetingNote.js",
    ["buildFallbackLatestQuery", "pickLatestItem"],
    {
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  const query = buildFallbackLatestQuery(12345, []);
  const limitMatch = query.match(/items_page\(limit:\s*(\d+)\)/);
  assert.ok(limitMatch, "fallback query must include items_page limit");

  const limit = Number(limitMatch[1]);
  const latestIndex = 75;

  const rows = Array.from({ length: 120 }, (_, index) => ({
    id: `item-${index + 1}`,
    updated_at: `2026-01-${String((index % 25) + 1).padStart(2, "0")}T09:00:00.000Z`
  }));
  rows[latestIndex] = {
    id: "latest-in-separate-group",
    updated_at: "2026-12-31T23:59:59.000Z"
  };

  const fallbackItems = rows.slice(0, limit);
  const latest = pickLatestItem(fallbackItems);

  assert.ok(limit > latestIndex, "fallback scan limit must reach later-group items");
  assert.equal(latest?.id, "latest-in-separate-group");
});

test("mondayMeetingNote extracts doc id from JSON column values", async () => {
  const { extractMeetingNote } = await loadWidgetInternals(
    "widgets/mondayMeetingNote.js",
    ["extractMeetingNote"],
    {
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  const extracted = extractMeetingNote(
    {
      url: "https://workspace.monday.com/boards/123/pulses/456",
      column_values: [
        {
          id: "monday_doc",
          text: "",
          value: JSON.stringify({
            linkedPulseId: 456,
            doc_id: 987654321
          })
        }
      ]
    },
    ["monday_doc"],
    "monday Doc"
  );

  assert.equal(
    extracted.docUrl,
    "https://workspace.monday.com/boards/123/pulses/456?doc_id=987654321"
  );
});
