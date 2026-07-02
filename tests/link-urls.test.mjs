import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGoogleFaviconUrl,
  isUrlIcon,
  normalizeComparableUrl,
  normalizeHttpUrl
} from "../widgets/shared/linkUrls.js";

test("link URL helpers preserve safe URL and favicon semantics", () => {
  assert.equal(normalizeHttpUrl(" https://example.com/path?q=1#top "), "https://example.com/path?q=1#top");
  assert.equal(normalizeHttpUrl("ftp://example.com/file", "https://fallback.test/"), "https://fallback.test/");
  assert.equal(normalizeHttpUrl("", "https://fallback.test/"), "https://fallback.test/");
  assert.equal(normalizeHttpUrl("not a url"), "");
  assert.equal(normalizeComparableUrl(" https://example.com/feed#top "), "https://example.com/feed");
  assert.equal(normalizeComparableUrl("not a url"), "");

  assert.equal(isUrlIcon("https://example.com/icon.png"), true);
  assert.equal(isUrlIcon("http://example.com/icon.png"), true);
  assert.equal(isUrlIcon("data:image/png;base64,abc"), true);
  assert.equal(isUrlIcon("chrome-extension://abc/icon.png"), true);
  assert.equal(isUrlIcon("custom icon text"), false);

  assert.equal(
    buildGoogleFaviconUrl("https://example.com/a b"),
    "https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fexample.com%2Fa%20b"
  );
});
