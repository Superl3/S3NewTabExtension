import assert from "node:assert/strict";
import test from "node:test";

import { describeRequestError } from "../core/utils/error.js";

const SUBJECT = { subject: "Gmail", hint: "Check the account setting." };

test("network failures never leak Failed to fetch", () => {
  const message = describeRequestError(new TypeError("Failed to fetch"), SUBJECT);
  assert.doesNotMatch(message, /failed to fetch/i);
  assert.match(message, /cannot reach gmail/i);
});

test("NetworkError variants are treated as unreachable", () => {
  const message = describeRequestError(new Error("NetworkError when attempting to fetch resource."), SUBJECT);
  assert.match(message, /cannot reach gmail/i);
});

test("credential failures point at the token setting", () => {
  for (const raw of ["Bad credentials", "HTTP 401 Unauthorized"]) {
    const message = describeRequestError(new Error(raw), SUBJECT);
    assert.match(message, /credential|token/i);
    assert.doesNotMatch(message, /bad credentials/i);
  }
});

test("rate limit failures explain the retry instead of quoting GitHub", () => {
  const raw =
    "API rate limit exceeded for 203.0.113.5. (But here is the good news: Authenticated requests get a higher rate limit.)";
  const message = describeRequestError(new Error(raw), SUBJECT);
  assert.match(message, /rate limit reached/i);
  assert.doesNotMatch(message, /203\.0\.113\.5/);
  assert.ok(message.length < raw.length, "copy must be shorter than the upstream message");
});

test("not-found failures mention settings or access", () => {
  const message = describeRequestError(new Error("Not Found"), SUBJECT);
  assert.match(message, /not found/i);
  assert.match(message, /setting|access/i);
});

test("HTML error bodies are never rendered raw", () => {
  const message = describeRequestError(new Error("<html>502 Bad Gateway</html>"), SUBJECT);
  assert.doesNotMatch(message, /</);
  assert.match(message, /unexpected response/i);
});

test("parse failures use the caller hint", () => {
  const message = describeRequestError(new Error("Feed parse failed"), {
    subject: "Feed",
    hint: "Check that the URL points to an RSS or Atom feed."
  });
  assert.match(message, /rss or atom/i);
});

test("message-less errors fall back to subject copy", () => {
  const message = describeRequestError({}, SUBJECT);
  assert.match(message, /gmail/i);
  assert.doesNotMatch(message, /unknown error/i);
});

test("abort errors are reported as cancelled, not failed", () => {
  const abort = new Error("The operation was aborted.");
  abort.name = "AbortError";
  assert.equal(describeRequestError(abort, SUBJECT), "");
});

test("already-actionable messages pass through unchanged", () => {
  const raw = "Board ID 123 does not contain a People column.";
  assert.equal(describeRequestError(new Error(raw), SUBJECT), raw);
});

test("forbidden raw strings never survive translation", () => {
  const forbidden = [/failed to fetch/i, /unknown error/i, /<html/i, /bad credentials/i];
  const upstream = [
    new TypeError("Failed to fetch"),
    new Error("Bad credentials"),
    new Error("<html>502 Bad Gateway</html>"),
    {},
    null,
    undefined
  ];

  for (const error of upstream) {
    const message = describeRequestError(error, SUBJECT);
    for (const pattern of forbidden) {
      assert.doesNotMatch(message, pattern, `"${message}" must not contain ${pattern}`);
    }
  }
});
