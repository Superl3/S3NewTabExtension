import test from "node:test";
import assert from "node:assert/strict";

import {
  hasMondayBoardConfig,
  hasMondayConnectorConfig,
  normalizeBoardIds,
  normalizeColumnSelectorList,
  parseColumnSelectorList
} from "../widgets/shared/mondayConfig.js";
import {
  mondayFetchGraphql,
  parseUrlSafely,
  resolveMondaySiteUrl
} from "../widgets/shared/mondayClient.js";

test("monday config normalizes board ids and selector lists for widget reuse", () => {
  assert.deepEqual(normalizeBoardIds(" 101, 202, 101 "), [101, 202]);
  assert.equal(
    normalizeColumnSelectorList(" People , *, People ", {
      allowWildcard: true,
      unique: false
    }),
    "People, *, People"
  );
  assert.deepEqual(parseColumnSelectorList("미팅 노트, monday Doc"), ["미팅 노트", "monday Doc"]);
});

test("monday config predicates preserve connector and board readiness semantics", () => {
  assert.equal(hasMondayConnectorConfig({ connectorUrl: "", accessToken: "" }), false);
  assert.equal(hasMondayConnectorConfig({ connectorUrl: "http://localhost:8787/api/auth/start" }), true);
  assert.equal(hasMondayConnectorConfig({ accessToken: "token-123" }), true);

  assert.equal(hasMondayBoardConfig({ boardIds: [] }), false);
  assert.equal(hasMondayBoardConfig({ boardIds: [101] }), true);
  assert.equal(hasMondayBoardConfig({ boardId: 101 }), false);
});

test("monday client resolves site url from account label before fallback urls", () => {
  assert.equal(
    resolveMondaySiteUrl("owner@workspace.monday.com", ["https://fallback.example.com/board/1"]),
    "https://workspace.monday.com/"
  );
  assert.equal(
    resolveMondaySiteUrl("", ["https://team.monday.com/boards/123"]),
    "https://team.monday.com/"
  );
});

test("monday client safe URL parser ignores blank and invalid values", () => {
  assert.equal(parseUrlSafely(""), null);
  assert.equal(parseUrlSafely("not a url"), null);
  assert.equal(parseUrlSafely("https://workspace.monday.com/boards/123")?.hostname, "workspace.monday.com");
});

test("monday client marks HTTP auth failures without adding widget messaging", async () => {
  await assert.rejects(
    () =>
      mondayFetchGraphql("token-123", "query { me { id } }", {
        fetchImpl: async (url, options) => {
          assert.equal(url, "https://api.monday.com/v2");
          assert.equal(options.headers.Authorization, "token-123");
          return {
            ok: false,
            status: 401,
            json: async () => ({ error_message: "Unauthorized" })
          };
        }
      }),
    (error) => {
      assert.equal(error.message, "Unauthorized");
      assert.equal(error.code, "auth");
      return true;
    }
  );
});

test("monday client marks graphql auth failures from monday error payload", async () => {
  await assert.rejects(
    () =>
      mondayFetchGraphql("token-123", "query { boards { id } }", {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            errors: [{ message: "Invalid token" }]
          })
        })
      }),
    (error) => {
      assert.equal(error.message, "Invalid token");
      assert.equal(error.code, "auth");
      return true;
    }
  );
});
