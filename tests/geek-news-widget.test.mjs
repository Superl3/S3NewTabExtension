import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { widgetRegistry } from "../widgets/index.js";
import { GEEK_NEWS_FEED_URL, RSS_FEED_PRESETS, geekNewsWidget } from "../widgets/rss.js";

test("RSS Feed widget defaults to the GeekNews predefined feed", () => {
  const definition = widgetRegistry.rss;
  assert.ok(definition);
  assert.equal(definition.defaultConfig.feedPreset, "geekNews");
  assert.equal(definition.defaultConfig.feedUrl, GEEK_NEWS_FEED_URL);

  const presetField = definition.settingsSchema.find((field) => field.key === "feedPreset");
  assert.equal(presetField?.type, "select");
  assert.deepEqual(
    presetField.options.map((option) => [option.value, option.label]),
    [
      ["geekNews", "GeekNews (news.hada.io)"],
      ["bbcWorld", "BBC World"],
      ["custom", "Custom URL"]
    ]
  );
  assert.ok(RSS_FEED_PRESETS.some((preset) => preset.value === "geekNews" && preset.feedUrl === GEEK_NEWS_FEED_URL));
});

test("GeekNews widget is registered as a pinned news.hada.io feed", async () => {
  const lazyDefinition = widgetRegistry.geekNews;
  assert.ok(lazyDefinition);
  assert.equal(lazyDefinition.title, "GeekNews");
  assert.equal(lazyDefinition.hiddenFromAddWidget, true);
  assert.equal(lazyDefinition.defaultConfig.feedPreset, "geekNews");
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
