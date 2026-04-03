import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

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

test("mondayAssigned normalizes status column ids without undefined helper", async () => {
  const { normalizeStatusColumnIds } = await loadWidgetInternals(
    "widgets/mondayAssigned.js",
    ["normalizeStatusColumnIds"],
    {
      normalizeColumnSelector: (value) => String(value || "").trim(),
      createAuthSessionStorage: () => ({
        load: async () => null,
        save: async () => {},
        clear: async () => {}
      })
    }
  );

  const normalized = normalizeStatusColumnIds([" status ", "", "done "]);
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
