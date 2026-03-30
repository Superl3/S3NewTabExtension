import test from "node:test";
import assert from "node:assert/strict";

import { isAllowedRedirectUri, parseAllowedExtensionIds } from "../connector/redirect-policy.mjs";

const EXTENSION_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("allows localhost and 127.0.0.1 redirects", () => {
  const allowedIds = parseAllowedExtensionIds(EXTENSION_ID);
  assert.equal(
    isAllowedRedirectUri("http://localhost:3000/callback", {
      allowedExtensionIds: allowedIds,
      allowChromeExtensionRedirect: false
    }),
    true
  );
  assert.equal(
    isAllowedRedirectUri("http://127.0.0.1:8787/callback", {
      allowedExtensionIds: allowedIds,
      allowChromeExtensionRedirect: false
    }),
    true
  );
});

test("allows chromiumapp redirect only for allowlisted extension id", () => {
  const allowedIds = parseAllowedExtensionIds(EXTENSION_ID);
  assert.equal(
    isAllowedRedirectUri(`https://${EXTENSION_ID}.chromiumapp.org/provider_cb`, {
      allowedExtensionIds: allowedIds,
      allowChromeExtensionRedirect: false
    }),
    true
  );
  assert.equal(
    isAllowedRedirectUri("https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/provider_cb", {
      allowedExtensionIds: allowedIds,
      allowChromeExtensionRedirect: false
    }),
    false
  );
});

test("requires both flag and allowlist for chrome-extension redirect", () => {
  const allowedIds = parseAllowedExtensionIds(EXTENSION_ID);
  const uri = `chrome-extension://${EXTENSION_ID}/callback.html`;

  assert.equal(
    isAllowedRedirectUri(uri, {
      allowedExtensionIds: allowedIds,
      allowChromeExtensionRedirect: false
    }),
    false
  );
  assert.equal(
    isAllowedRedirectUri(uri, {
      allowedExtensionIds: new Set(),
      allowChromeExtensionRedirect: true
    }),
    false
  );
  assert.equal(
    isAllowedRedirectUri(uri, {
      allowedExtensionIds: allowedIds,
      allowChromeExtensionRedirect: true
    }),
    true
  );
});

test("rejects non-chromiumapp arbitrary https redirects", () => {
  const allowedIds = parseAllowedExtensionIds(EXTENSION_ID);
  assert.equal(
    isAllowedRedirectUri("https://example.com/callback", {
      allowedExtensionIds: allowedIds,
      allowChromeExtensionRedirect: true
    }),
    false
  );
});
