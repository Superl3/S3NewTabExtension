import assert from "node:assert/strict";
import test from "node:test";
import { formatGitHubSyncedLabel } from "../widgets/shared/githubApi.js";

test("synced label distinguishes today from older caches", () => {
  const now = Date.now();
  const recent = formatGitHubSyncedLabel(now - 3 * 60 * 1000);
  const yesterday = formatGitHubSyncedLabel(now - 26 * 60 * 60 * 1000);

  assert.notEqual(recent, yesterday, "a day-old cache must not look like a fresh one");
  assert.ok(/\d/.test(recent));
});

test("synced label includes a date once the cache is not from today", () => {
  const old = new Date();
  old.setDate(old.getDate() - 3);
  const label = formatGitHubSyncedLabel(old.getTime());

  const timeOnly = new Date(old.getTime()).toLocaleTimeString();
  assert.notEqual(label, timeOnly, "older caches must carry a date, not just a time");
});

test("synced label stays time-only for same-day caches", () => {
  const ts = Date.now() - 60 * 1000;
  assert.equal(formatGitHubSyncedLabel(ts), new Date(ts).toLocaleTimeString());
});

test("synced label is empty for a missing timestamp", () => {
  assert.equal(formatGitHubSyncedLabel(0), "");
  assert.equal(formatGitHubSyncedLabel(null), "");
});
