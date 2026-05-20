import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { widgetRegistry } from "../widgets/index.js";
import { GEEK_NEWS_FEED_URL, geekNewsWidget } from "../widgets/rss.js";

test("GeekNews widget is registered as a pinned news.hada.io feed", async () => {
  const lazyDefinition = widgetRegistry.geekNews;
  assert.ok(lazyDefinition);
  assert.equal(lazyDefinition.title, "GeekNews");
  assert.equal(lazyDefinition.defaultConfig.feedUrl, GEEK_NEWS_FEED_URL);
  assert.equal(lazyDefinition.defaultConfig.maxItems, 10);
  assert.equal(lazyDefinition.settingsSchema.some((field) => field.key === "feedUrl"), false);

  const loadedDefinition = await lazyDefinition.load();
  assert.equal(loadedDefinition, geekNewsWidget);
  assert.equal(loadedDefinition.defaultConfig.feedUrl, "https://news.hada.io/rss/news");
});

test("manifest grants the GeekNews feed redirect chain", async () => {
  const manifest = JSON.parse(await fs.readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.ok(manifest.host_permissions.includes("https://news.hada.io/*"));
  assert.ok(manifest.host_permissions.includes("https://feeds.feedburner.com/*"));
  assert.ok(manifest.host_permissions.includes("http://feeds.feedburner.com/*"));
});
