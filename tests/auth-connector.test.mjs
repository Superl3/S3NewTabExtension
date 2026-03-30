import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthConnectorStartUrl,
  normalizeConnectorUrl,
  parseAuthFlowResult
} from "../widgets/shared/authConnector.js";

test("normalizes connector URL and removes hash", () => {
  assert.equal(
    normalizeConnectorUrl("https://auth.example.com/start#section"),
    "https://auth.example.com/start"
  );
  assert.equal(
    normalizeConnectorUrl("http://localhost:8787/api/auth/start"),
    "http://localhost:8787/api/auth/start"
  );
  assert.equal(normalizeConnectorUrl("http://example.com/start"), "");
});

test("builds auth connector start URL with provider", () => {
  const built = buildAuthConnectorStartUrl(
    "http://localhost:8787/api/auth/start",
    "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/callback",
    "state123",
    "monday"
  );
  const parsed = new URL(built);
  assert.equal(parsed.searchParams.get("state"), "state123");
  assert.equal(parsed.searchParams.get("provider"), "monday");
  assert.match(parsed.searchParams.get("redirect_uri") || "", /chromiumapp\.org/);
});

test("parses auth callback values from hash and query", () => {
  const resultFromHash = parseAuthFlowResult(
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/callback.html#state=abc&access_token=t123&account=me"
  );
  assert.equal(resultFromHash.state, "abc");
  assert.equal(resultFromHash.accessToken, "t123");
  assert.equal(resultFromHash.accountLabel, "me");

  const resultFromQuery = parseAuthFlowResult(
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/callback.html?state=xyz&token=t456&error=oops"
  );
  assert.equal(resultFromQuery.state, "xyz");
  assert.equal(resultFromQuery.accessToken, "t456");
  assert.equal(resultFromQuery.error, "oops");
});
