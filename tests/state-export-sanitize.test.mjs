import test from "node:test";
import assert from "node:assert/strict";

import { createStateExportSanitizer } from "../core/state-export-sanitize.js";
import { createPortableProfileExport, normalizeImportedProfileSnapshot } from "../core/profile-transfer.js";

function createSanitizer() {
  return createStateExportSanitizer({
    sensitiveKeywordParts: ["token", "secret", "apikey"],
    volatileBackgroundKeywordParts: ["cache", "cached", "signature", "timestamp"],
    volatileProfileKeywordParts: ["cache", "cached", "fingerprint"],
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
    cacheTokenFingerprint: "abc123",
    nested: {
      keep: true
    }
  };

  const sanitized = sanitizer.sanitizeStateExportValue(snapshot);

  assert.equal(sanitized.ui.monday.accessToken, "[REDACTED]");
  assert.equal(sanitized.apiToken, "[REDACTED]");
  assert.equal(Object.hasOwn(sanitized, "cacheTokenFingerprint"), false);
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
  assert.equal(sanitizer.isVolatileProfileExportKey("cacheTokenFingerprint"), true);
});

test("portable profiles exclude calendar access URLs in widgets and presets without mutating live state", () => {
  const sanitizer = createSanitizer();
  const url = "https://calendar.google.com/calendar/ical/demo/private-FAKE_SECRET/basic.ics";
  const snapshot = {
    instances: [{ type: "calendar", config: { icsUrl: url, viewMode: "week" } }],
    presets: [{ snapshot: { instances: [{ type: "calendar", config: { icsUrl: url } }] } }]
  };
  const payload = createPortableProfileExport(snapshot, { sanitizeSnapshot: sanitizer.sanitizeStateExportValue });
  assert.equal(JSON.stringify(payload).includes("FAKE_SECRET"), false);
  assert.equal(snapshot.instances[0].config.icsUrl, url);
  const imported = normalizeImportedProfileSnapshot(payload.snapshot, { isSensitiveKey: sanitizer.isSensitiveExportKey });
  assert.deepEqual(imported.instances[0].config, { viewMode: "week" });
});

test("credential URL sanitization covers private calendar paths, encoded paths and embedded links", () => {
  const sanitizer = createSanitizer();
  for (const url of [
    "https://calendar.google.com/calendar/ical/demo/private-FAKE/basic.ics",
    "webcal://calendar.google.com/calendar/ical/demo/private/FAKE/basic.ics",
    "https://calendar.google.com/calendar/ical/demo/%70rivate-FAKE/basic.ics",
    "https://calendar.google.com/calendar/ical/demo/private-FAKE%zz/basic.ics",
    "https://user:FAKE@example.com/feed.ics"
  ]) {
    assert.equal(sanitizer.sanitizeCredentialQueryParamsInString(url), "[REDACTED]");
    assert.equal(sanitizer.sanitizeCredentialQueryParamsInString(`Feed: ${url}`), "Feed: [REDACTED]");
  }
  const publicUrl = "https://calendar.google.com/calendar/ical/demo/public/basic.ics";
  assert.equal(sanitizer.sanitizeCredentialQueryParamsInString(publicUrl), publicUrl);
});

test("legacy import discards credential links after string sanitization", () => {
  const sanitizer = createSanitizer();
  const imported = normalizeImportedProfileSnapshot({ instances: [{ config: {
    icsUrl: "https://example.com/secret-feed.ics",
    url: "https://calendar.google.com/calendar/ical/demo/private-FAKE/basic.ics",
    label: "Calendar"
  } }] }, { isSensitiveKey: sanitizer.isSensitiveExportKey, sanitizeString: sanitizer.sanitizeCredentialQueryParamsInString });
  assert.deepEqual(imported.instances[0].config, { label: "Calendar" });
});
