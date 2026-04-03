import test from "node:test";
import assert from "node:assert/strict";

import { createStateExportSanitizer } from "../core/state-export-sanitize.js";

function createSanitizer() {
  return createStateExportSanitizer({
    sensitiveKeywordParts: ["token", "secret", "apikey"],
    volatileBackgroundKeywordParts: ["cache", "cached", "signature", "timestamp"],
    redactedValue: "[REDACTED]"
  });
}

test("sanitizeCredentialQueryParamsInString redacts sensitive query values", () => {
  const sanitizer = createSanitizer();
  const value = "https://example.com/callback?access_token=abc&apikey=xyz&keep=1#frag";

  const sanitized = sanitizer.sanitizeCredentialQueryParamsInString(value);

  assert.equal(
    sanitized,
    "https://example.com/callback?access_token=%5BREDACTED%5D&apikey=%5BREDACTED%5D&keep=1#frag"
  );
});

test("sanitizeStateExportValue redacts sensitive paths and drops volatile background keys", () => {
  const sanitizer = createSanitizer();
  const snapshot = {
    ui: {
      monday: {
        accessToken: "monday-secret"
      },
      background: {
        mode: "wallpaper",
        wallpaperCachedUrl: "https://picsum.photos/foo",
        wallpaperCachedAt: 123,
        wallpaperCachedSignature: "abc"
      }
    },
    apiToken: "root-secret",
    nested: {
      keep: true
    }
  };

  const sanitized = sanitizer.sanitizeStateExportValue(snapshot);

  assert.equal(sanitized.ui.monday.accessToken, "[REDACTED]");
  assert.equal(sanitized.apiToken, "[REDACTED]");
  assert.equal(sanitized.ui.background.mode, "wallpaper");
  assert.equal(Object.hasOwn(sanitized.ui.background, "wallpaperCachedUrl"), false);
  assert.equal(Object.hasOwn(sanitized.ui.background, "wallpaperCachedAt"), false);
  assert.equal(Object.hasOwn(sanitized.ui.background, "wallpaperCachedSignature"), false);
  assert.equal(sanitized.nested.keep, true);
});

test("normalizeSensitiveKeyPart strips punctuation and lowercases", () => {
  const sanitizer = createSanitizer();

  assert.equal(sanitizer.normalizeSensitiveKeyPart(" Client-Secret! "), "clientsecret");
  assert.equal(sanitizer.isSensitiveExportKey("client_secret"), true);
  assert.equal(sanitizer.isVolatileBackgroundExportKey("cached_signature"), true);
});
