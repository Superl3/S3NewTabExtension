import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthConnectorStartUrl,
  connectWithAuthConnector,
  fetchConnectorToken,
  isAuthCancelledMessage,
  LOCAL_AUTH_CONNECTOR_URL,
  normalizeLocalAuthConnectorUrl,
  normalizeConnectorUrl,
  parseAuthFlowResult,
  rewriteAuthorizationLoadError
} from "../widgets/shared/authConnector.js";
import {
  hasAuthSessionStorageChange,
  resolveActiveAuthSession
} from "../widgets/shared/authSessionStorage.js";
import {
  normalizeAiChatTemperature,
  resolveAiChatActiveSession
} from "../widgets/aiChat.js";

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

test("normalizes local auth connector defaults and shared auth messages", () => {
  assert.equal(normalizeLocalAuthConnectorUrl(""), LOCAL_AUTH_CONNECTOR_URL);
  assert.equal(
    rewriteAuthorizationLoadError("Authorization page was not loaded"),
    "Authorization page could not be loaded. Check that connector server is running at http://localhost:8787 and then try Connect again."
  );
  assert.equal(rewriteAuthorizationLoadError("different failure"), "different failure");
  assert.equal(isAuthCancelledMessage("User cancelled interaction"), true);
  assert.equal(isAuthCancelledMessage("network failed"), false);
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

test("fetchConnectorToken preserves fallback errors for invalid JSON responses", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    text: async () => "not-json"
  });

  try {
    await assert.rejects(
      fetchConnectorToken("http://localhost:8787/api/auth/start", "monday"),
      /Token relay failed \(HTTP 502\)/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("fetchConnectorToken parses connector token payloads through shared JSON handling", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => '{"access_token":"token-123","email":"me@example.com"}'
  });

  try {
    assert.deepEqual(
      await fetchConnectorToken("http://localhost:8787/api/auth/start", "monday"),
      {
        accessToken: "token-123",
        accountLabel: "me@example.com"
      }
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("connectWithAuthConnector prefers configured access token", async () => {
  assert.deepEqual(
    await connectWithAuthConnector({
      connectorUrl: "http://localhost:8787/api/auth/start",
      configuredAccessToken: " configured-token ",
      provider: "monday",
      providerLabel: "Monday",
      getIdentityApi: () => {
        throw new Error("identity should not be used");
      }
    }),
    {
      accessToken: "configured-token",
      accountLabel: "Configured token"
    }
  );
});

test("connectWithAuthConnector completes chrome identity auth flow", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("token relay unavailable");
  };

  try {
    const result = await connectWithAuthConnector({
      connectorUrl: "http://localhost:8787/api/auth/start",
      provider: "monday",
      providerLabel: "Monday",
      unableTokenMessage: "Unable to obtain Monday connector token.",
      getIdentityApi: () => ({
        getRedirectURL: (path) => `https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/${path}`,
        launchWebAuthFlow: async ({ url, interactive }) => {
          assert.equal(interactive, true);
          const parsed = new URL(url);
          const state = parsed.searchParams.get("state");
          assert.equal(parsed.searchParams.get("provider"), "monday");
          return `https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/monday-auth#state=${state}&access_token=token-123&account=me@example.com`;
        }
      })
    });

    assert.deepEqual(result, {
      accessToken: "token-123",
      accountLabel: "me@example.com"
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("connectWithAuthConnector preserves custom auth flow failure copy", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("token relay unavailable");
  };

  try {
    await assert.rejects(
      connectWithAuthConnector({
        connectorUrl: "http://localhost:8787/api/auth/start",
        provider: "openai",
        providerLabel: "Authentication",
        authFlowFailureMessage: "Authentication failed.",
        getIdentityApi: () => ({
          getRedirectURL: (path) => `https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/${path}`,
          launchWebAuthFlow: async () =>
            "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/ai-chat-auth#state=wrong&access_token=token-123"
        })
      }),
      /Authentication failed \(invalid state\)\./
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("aiChat prefers configured access token over stored session", () => {
  const result = resolveAiChatActiveSession({
    connectorUrl: "http://localhost:8787/api/auth/start",
    configuredAccessToken: "configured-token",
    storedSession: {
      connectorUrl: "http://localhost:8787/api/auth/start",
      accessToken: "stored-token",
      accountLabel: "saved@example.com"
    }
  });

  assert.deepEqual(result, {
    connectorUrl: "http://localhost:8787/api/auth/start",
    accessToken: "configured-token",
    accountLabel: "Configured token"
  });
});

test("aiChat temperature normalization preserves request payload semantics", () => {
  assert.equal(normalizeAiChatTemperature("1.2"), 1.2);
  assert.equal(normalizeAiChatTemperature(""), 0);
  assert.equal(normalizeAiChatTemperature(null), 0.7);
  assert.equal(normalizeAiChatTemperature(undefined), 0.7);
  assert.equal(normalizeAiChatTemperature("bad"), 0.7);
});

test("aiChat only reuses stored session for matching connector URL", () => {
  const storedSession = {
    connectorUrl: "https://auth.example.com/start",
    accessToken: "stored-token",
    accountLabel: "saved@example.com"
  };

  assert.deepEqual(
    resolveAiChatActiveSession({
      connectorUrl: "https://auth.example.com/start",
      configuredAccessToken: "",
      storedSession
    }),
    storedSession
  );

  assert.equal(
    resolveAiChatActiveSession({
      connectorUrl: "https://other.example.com/start",
      configuredAccessToken: "",
      storedSession
    }),
    null
  );
});

test("shared auth session prefers configured token over stored session", () => {
  const result = resolveActiveAuthSession({
    connectorUrl: "http://localhost:8787/api/auth/start",
    configuredAccessToken: "configured-token",
    storedSession: {
      connectorUrl: "http://localhost:8787/api/auth/start",
      accessToken: "stored-token",
      accountLabel: "saved@example.com"
    }
  });

  assert.deepEqual(result, {
    connectorUrl: "http://localhost:8787/api/auth/start",
    accessToken: "configured-token",
    accountLabel: "Configured token"
  });
});

test("shared auth session only reuses stored session for matching connector", () => {
  const storedSession = {
    connectorUrl: "https://auth.example.com/start",
    accessToken: "stored-token",
    accountLabel: "saved@example.com"
  };

  assert.deepEqual(
    resolveActiveAuthSession({
      connectorUrl: "https://auth.example.com/start",
      configuredAccessToken: "",
      storedSession
    }),
    storedSession
  );

  assert.equal(
    resolveActiveAuthSession({
      connectorUrl: "https://other.example.com/start",
      configuredAccessToken: "",
      storedSession
    }),
    null
  );
});

test("shared auth session change detector matches the configured storage key", () => {
  assert.equal(
    hasAuthSessionStorageChange(
      {
        mondayKey: {
          oldValue: null,
          newValue: { accessToken: "next-token" }
        }
      },
      "mondayKey"
    ),
    true
  );

  assert.equal(hasAuthSessionStorageChange({ otherKey: {} }, "mondayKey"), false);
  assert.equal(hasAuthSessionStorageChange(null, "mondayKey"), false);
});
