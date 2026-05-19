import test from "node:test";
import assert from "node:assert/strict";

import {
  PORTABLE_PROFILE_FORMAT,
  createPortableProfileExport,
  extractProfileSnapshotFromImportPayload,
  normalizeImportedProfileSnapshot
} from "../core/profile-transfer.js";

test("createPortableProfileExport wraps sanitized snapshot with portability metadata", () => {
  const payload = createPortableProfileExport(
    { ui: { theme: { primary: "#111111" } }, instances: [] },
    {
      now: () => new Date("2026-05-20T00:00:00.000Z"),
      sanitizeSnapshot: (snapshot) => ({ ...snapshot, sanitized: true }),
      userAgent: "Test Browser"
    }
  );

  assert.equal(payload.format, PORTABLE_PROFILE_FORMAT);
  assert.equal(payload.version, 1);
  assert.equal(payload.exportedAt, "2026-05-20T00:00:00.000Z");
  assert.equal(payload.browser.userAgent, "Test Browser");
  assert.equal(payload.portability.credentials, "excluded");
  assert.equal(payload.snapshot.sanitized, true);
});

test("extractProfileSnapshotFromImportPayload accepts portable exports and legacy raw snapshots", () => {
  const snapshot = { ui: { home: {} }, instances: [] };

  assert.equal(extractProfileSnapshotFromImportPayload({ format: PORTABLE_PROFILE_FORMAT, snapshot }), snapshot);
  assert.deepEqual(extractProfileSnapshotFromImportPayload(snapshot), snapshot);
  assert.throws(() => extractProfileSnapshotFromImportPayload({ hello: "world" }), /not an S3 New Tab profile/);
});

test("normalizeImportedProfileSnapshot removes non-portable browser data and credentials", () => {
  const normalized = normalizeImportedProfileSnapshot(
    {
      ui: {
        monday: {
          accessToken: "[REDACTED]",
          connectorUrl: "http://localhost:8787/api/auth/start?token=abc&keep=1"
        },
        background: {
          localMediaDataUrl: "data:image/png;base64,abc",
          lastRuntimeUrl: "blob:https://example.test/1"
        }
      },
      instances: [
        {
          id: "shortcut-1",
          type: "shortcut",
          config: {
            icon: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/icons/icon.png",
            label: "Docs",
            cacheAt: 123
          }
        }
      ],
      cacheTokenFingerprint: "abc"
    },
    {
      isSensitiveKey: (key) => /token/i.test(key),
      isVolatileProfileKey: (key) => /^cache/i.test(key) || /runtime/i.test(key),
      sanitizeString: (value) => value.replace("token=abc", "token=%5BREDACTED%5D")
    }
  );

  assert.equal(Object.hasOwn(normalized.ui.monday, "accessToken"), false);
  assert.equal(normalized.ui.monday.connectorUrl, "http://localhost:8787/api/auth/start?token=%5BREDACTED%5D&keep=1");
  assert.equal(normalized.ui.background.localMediaDataUrl, "data:image/png;base64,abc");
  assert.equal(Object.hasOwn(normalized.ui.background, "lastRuntimeUrl"), false);
  assert.equal(normalized.instances[0].config.icon, "");
  assert.equal(Object.hasOwn(normalized.instances[0].config, "cacheAt"), false);
  assert.equal(Object.hasOwn(normalized, "cacheTokenFingerprint"), false);
});
