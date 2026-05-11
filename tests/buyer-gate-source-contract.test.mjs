import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { FALLBACK_DEFAULT_WIDGET_TYPES } from "../core/default-widget-order.js";

test("fallback default widgets exclude setup-heavy and placeholder-only widgets", async () => {
  assert.deepEqual(FALLBACK_DEFAULT_WIDGET_TYPES, [
    "clock",
    "search",
    "weather",
    "bookmarks",
    "shortcut",
    "todo",
    "notes"
  ]);
  assert.equal(FALLBACK_DEFAULT_WIDGET_TYPES.includes("aiChat"), false);
  assert.equal(FALLBACK_DEFAULT_WIDGET_TYPES.includes("label"), false);
});

test("AI Chat degraded setup copy is actionable and chrome access is guarded", async () => {
  const source = await fs.readFile(new URL("../widgets/aiChat.js", import.meta.url), "utf8");

  assert.match(source, /connector URL or access token in settings to enable AI Chat/);
  assert.match(source, /connector URL or access token in settings before connecting/);
  assert.match(source, /Check the connector URL or add an access token in settings/);
  assert.match(source, /globalThis\.chrome\?\.storage\?\.local/);
  assert.match(source, /const identityApi = globalThis\.chrome\?\.identity/);
  assert.doesNotMatch(source, /getStorageArea:\s*\(\)\s*=>\s*chrome\?\.storage\?\.local/);
  assert.doesNotMatch(source, /chrome\.identity/);
});
