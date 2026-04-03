import test from "node:test";
import assert from "node:assert/strict";

import { createAuthSessionStorage } from "../widgets/shared/authSessionStorage.js";

function createStorage(overrides = {}) {
  return {
    async get() {
      return {};
    },
    async set() {},
    async remove() {},
    ...overrides
  };
}

function createHelper(storageArea) {
  return createAuthSessionStorage({
    storageKey: "auth-session-key",
    getStorageArea: () => storageArea,
    normalizeConnectorUrl(value, fallback = "") {
      const text = String(value || "").trim();
      if (!text) {
        return fallback;
      }
      try {
        const parsed = new URL(text);
        parsed.hash = "";
        return parsed.protocol === "https:" || parsed.hostname === "localhost" ? parsed.toString() : "";
      } catch {
        return "";
      }
    }
  });
}

test("normalize returns a sanitized auth session", () => {
  const helper = createHelper(createStorage());

  const result = helper.normalize({
    connectorUrl: " https://auth.example.com/start#fragment ",
    accessToken: " token-123 ",
    accountLabel: " user@example.com "
  });

  assert.deepEqual(result, {
    connectorUrl: "https://auth.example.com/start",
    accessToken: "token-123",
    accountLabel: "user@example.com"
  });
});

test("normalize returns null for invalid session payload", () => {
  const helper = createHelper(createStorage());

  assert.equal(helper.normalize(null), null);
  assert.equal(
    helper.normalize({ connectorUrl: "https://auth.example.com/start", accessToken: "" }),
    null
  );
  assert.equal(
    helper.normalize({ connectorUrl: "http://example.com/start", accessToken: "token-123" }),
    null
  );
});

test("load returns normalized session from storage", async () => {
  const helper = createHelper(
    createStorage({
      async get(key) {
        assert.equal(key, "auth-session-key");
        return {
          [key]: {
            connectorUrl: "https://auth.example.com/start#state",
            accessToken: " token-123 ",
            accountLabel: " demo "
          }
        };
      }
    })
  );

  const result = await helper.load();

  assert.deepEqual(result, {
    connectorUrl: "https://auth.example.com/start",
    accessToken: "token-123",
    accountLabel: "demo"
  });
});

test("load returns null when storage read fails", async () => {
  const helper = createHelper(
    createStorage({
      async get() {
        throw new Error("storage unavailable");
      }
    })
  );

  const result = await helper.load();

  assert.equal(result, null);
});

test("save persists sanitized session fields", async () => {
  const calls = [];
  const helper = createHelper(
    createStorage({
      async set(payload) {
        calls.push(payload);
      }
    })
  );

  const result = await helper.save({
    connectorUrl: " https://auth.example.com/start#fragment ",
    accessToken: " token-123 ",
    accountLabel: " demo "
  });

  assert.deepEqual(calls, [
    {
      "auth-session-key": {
        connectorUrl: "https://auth.example.com/start",
        accessToken: "token-123",
        accountLabel: "demo"
      }
    }
  ]);
  assert.deepEqual(result, {
    connectorUrl: "https://auth.example.com/start",
    accessToken: "token-123",
    accountLabel: "demo"
  });
});

test("clear removes stored session and ignores storage errors", async () => {
  const removedKeys = [];
  const helper = createHelper(
    createStorage({
      async remove(key) {
        removedKeys.push(key);
        throw new Error("remove failed");
      }
    })
  );

  await helper.clear();

  assert.deepEqual(removedKeys, ["auth-session-key"]);
});
