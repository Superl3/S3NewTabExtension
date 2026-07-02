import test from "node:test";
import assert from "node:assert/strict";

import {
  areMondayCachedBoardsEqual,
  formatMondayGraphqlString,
  formatMondayGraphqlStringList,
  hasMondayBoardConfig,
  hasMondayConnectorConfig,
  normalizeCachedMondayBoardBase,
  normalizeBoardId,
  normalizeBoardIds,
  normalizeColumnSelectorList,
  normalizeMondayCachedBoards,
  normalizeMondayCacheNumber,
  normalizeMondayCacheTimestamp,
  parseColumnSelectorList
} from "../widgets/shared/mondayConfig.js";
import {
  connectWithMondayAuthConnector,
  formatMondayAuthConnectorErrorMessage,
  MONDAY_CONNECT_CANCELLED_MESSAGE,
  MONDAY_CONNECT_UNABLE_TOKEN_MESSAGE
} from "../widgets/shared/mondayAuth.js";
import {
  mondayFetchGraphql,
  parseUrlSafely,
  resolveMondaySiteUrl
} from "../widgets/shared/mondayClient.js";

test("monday config normalizes board ids and selector lists for widget reuse", () => {
  assert.deepEqual(normalizeBoardIds(" 101, 202, 101 "), [101, 202]);
  assert.equal(normalizeBoardId("42.8"), 42);
  assert.equal(normalizeBoardId("-4", 7), 0);
  assert.equal(normalizeBoardId("bad", "9.8"), 9);
  assert.equal(normalizeMondayCacheNumber("12.5"), 12.5);
  assert.equal(normalizeMondayCacheNumber("bad", 7), 7);
  assert.equal(normalizeMondayCacheTimestamp("12.5"), 12.5);
  assert.equal(normalizeMondayCacheTimestamp("-1"), 0);
  assert.equal(formatMondayGraphqlString("quote\"id"), "\"quote\\\"id\"");
  assert.equal(formatMondayGraphqlStringList(["status", "text column"]), "\"status\", \"text column\"");
  assert.equal(formatMondayGraphqlStringList(["quote\"id"]), "\"quote\\\"id\"");
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

test("monday config normalizes cached board base fields for widget reuse", () => {
  assert.deepEqual(normalizeCachedMondayBoardBase({ boardId: "42" }), {
    boardId: 42,
    boardName: "Board 42",
    boardUrl: ""
  });
  assert.deepEqual(
    normalizeCachedMondayBoardBase({
      boardId: 7,
      boardName: "  Roadmap  ",
      boardUrl: " https://workspace.monday.com/boards/7 "
    }),
    {
      boardId: 7,
      boardName: "Roadmap",
      boardUrl: "https://workspace.monday.com/boards/7"
    }
  );
  assert.equal(normalizeCachedMondayBoardBase({ boardId: 0 }), null);
  assert.deepEqual(
    normalizeMondayCachedBoards(
      [{ boardId: "7", boardName: " Roadmap " }, { boardName: "missing id" }],
      normalizeCachedMondayBoardBase
    ),
    [
      {
        boardId: 7,
        boardName: "Roadmap",
        boardUrl: ""
      }
    ]
  );
  assert.deepEqual(normalizeMondayCachedBoards([{ boardId: 7 }], null), []);
  assert.equal(
    areMondayCachedBoardsEqual(
      [{ boardId: "7", boardName: " Roadmap " }],
      [{ boardId: 7, boardName: "Roadmap" }],
      normalizeCachedMondayBoardBase
    ),
    true
  );
  assert.equal(
    areMondayCachedBoardsEqual(
      [{ boardId: "7", boardName: " Roadmap " }],
      [{ boardId: 8, boardName: "Roadmap" }],
      normalizeCachedMondayBoardBase
    ),
    false
  );
});

test("monday auth wrapper preserves provider defaults and shared error copy", async () => {
  assert.deepEqual(
    await connectWithMondayAuthConnector({
      connectorUrl: "http://localhost:8787/api/auth/start",
      accessToken: "configured-token",
      getIdentityApi: () => {
        throw new Error("identity should not be used for configured token");
      }
    }),
    {
      accessToken: "configured-token",
      accountLabel: "Configured token"
    }
  );

  assert.equal(
    formatMondayAuthConnectorErrorMessage(new Error("User cancelled interaction")),
    MONDAY_CONNECT_CANCELLED_MESSAGE
  );
  assert.equal(
    formatMondayAuthConnectorErrorMessage(new Error("Authorization page was not loaded")),
    "Authorization page could not be loaded. Check that connector server is running at http://localhost:8787 and then try Connect again."
  );
  assert.match(MONDAY_CONNECT_UNABLE_TOKEN_MESSAGE, /Monday connector token/);
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
