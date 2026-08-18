import assert from "node:assert/strict";
import test from "node:test";

import { describeRequestError } from "../core/utils/error.js";

/**
 * Rendered-copy gate.
 *
 * `tests/buyer-gate-source-contract.test.mjs` only greps source text, which is
 * why `Failed to fetch` shipped despite being explicitly forbidden. This suite
 * drives the real translation used by every account-backed widget with the
 * failures those widgets actually hit, and asserts on the resulting string.
 */

const FORBIDDEN_USER_COPY = [
  /failed to fetch/i,
  /\bunknown error\b/i,
  /<html/i,
  /bad credentials/i,
  /\bnetworkerror\b/i,
  /\bECONNREFUSED\b/,
  /\[object Object\]/
];

const WIDGET_CONTEXTS = [
  { widget: "gmail", subject: "Gmail", hint: "Check the account index in widget settings." },
  { widget: "calendar", subject: "Calendar", hint: "Check the calendar URL in widget settings." },
  { widget: "weather", subject: "Weather", hint: "Check the location settings." },
  { widget: "githubPrList", subject: "GitHub pull requests", hint: "Check the repository setting." },
  {
    widget: "githubReviewInbox",
    subject: "GitHub review inbox",
    hint: "Check the repository and login settings."
  },
  {
    widget: "mondayAssigned",
    subject: "Monday assigned issues",
    hint: "Check the board ID in widget settings."
  },
  {
    widget: "mondayMeetingNote",
    subject: "Monday meeting notes",
    hint: "Check the board ID in widget settings."
  }
];

function realWorldFailures() {
  const htmlBody = new Error("<html><head><title>502 Bad Gateway</title></head></html>");
  const emptyRejection = {};
  const nullRejection = null;
  const networkError = new TypeError("Failed to fetch");
  const dnsError = new Error("NetworkError when attempting to fetch resource.");
  const credentials = new Error("Bad credentials");
  const rateLimit = new Error(
    "API rate limit exceeded for 203.0.113.5. (But here is the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)"
  );
  const notFound = new Error("Not Found");
  const parseFailure = new Error("GitHub response parse failed.");

  return [
    ["offline", networkError],
    ["dns failure", dnsError],
    ["expired token", credentials],
    ["rate limited", rateLimit],
    ["missing resource", notFound],
    ["upstream html", htmlBody],
    ["parse failure", parseFailure],
    ["message-less rejection", emptyRejection],
    ["null rejection", nullRejection]
  ];
}

for (const context of WIDGET_CONTEXTS) {
  test(`${context.widget} never renders forbidden raw failure text`, () => {
    for (const [label, error] of realWorldFailures()) {
      const rendered = describeRequestError(error, context);

      assert.ok(
        rendered.length > 0,
        `${context.widget} produced empty copy for ${label}`
      );

      for (const pattern of FORBIDDEN_USER_COPY) {
        assert.doesNotMatch(
          rendered,
          pattern,
          `${context.widget} leaked ${pattern} for ${label}: "${rendered}"`
        );
      }
    }
  });

  test(`${context.widget} names itself in unavailable copy`, () => {
    const rendered = describeRequestError({}, context);
    assert.match(
      rendered,
      new RegExp(context.subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${context.widget} should tell the user which service failed`
    );
  });
}

test("aborted requests render nothing rather than a failure", () => {
  const abort = new Error("The user aborted a request.");
  abort.name = "AbortError";

  for (const context of WIDGET_CONTEXTS) {
    assert.equal(
      describeRequestError(abort, context),
      "",
      `${context.widget} must treat cancellation as a non-error`
    );
  }
});

test("actionable upstream messages are preserved verbatim", () => {
  const actionable = "Board 123456 has no People column.";
  const rendered = describeRequestError(new Error(actionable), WIDGET_CONTEXTS[5]);
  assert.equal(rendered, actionable);
});

test("user-facing render paths route through describeRequestError", async () => {
  const fs = await import("node:fs/promises");

  const guarded = [
    ["gmail", "GMAIL_ERROR_CONTEXT"],
    ["calendar", "CALENDAR_ERROR_CONTEXT"],
    ["weather", "WEATHER_ERROR_CONTEXT"],
    ["githubPrList", "GITHUB_PR_ERROR_CONTEXT"],
    ["githubReviewInbox", "REVIEW_INBOX_ERROR_CONTEXT"],
    ["mondayAssigned", "MONDAY_ASSIGNED_ERROR_CONTEXT"],
    ["mondayMeetingNote", "MONDAY_MEETING_ERROR_CONTEXT"]
  ];

  for (const [widget, contextName] of guarded) {
    const source = await fs.readFile(new URL(`../widgets/${widget}.js`, import.meta.url), "utf8");

    assert.ok(
      source.includes(`errorMessage = describeRequestError(error, ${contextName})`),
      `${widget} must translate its render-path error`
    );
    assert.ok(
      !source.includes("errorMessage = normalizeErrorMessage("),
      `${widget} must not assign raw upstream text to errorMessage`
    );
  }
});
