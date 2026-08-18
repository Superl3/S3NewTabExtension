import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStaleDataNotice,
  buildWidgetRecoveryActions
} from "../widgets/shared/widgetRecoveryActions.js";

function createStubDocument() {
  return {
    createElement(tagName) {
      return {
        tagName,
        className: "",
        textContent: "",
        type: "",
        childNodes: [],
        listeners: new Map(),
        append(...nodes) {
          this.childNodes.push(...nodes);
        },
        addEventListener(name, handler) {
          this.listeners.set(name, handler);
        }
      };
    }
  };
}

function clickAll(actions) {
  for (const child of actions.childNodes) {
    child.listeners.get("click")?.({ preventDefault() {}, stopPropagation() {} });
  }
}

test("recovery actions expose retry and settings when both are available", () => {
  let retried = 0;
  let opened = 0;

  const actions = buildWidgetRecoveryActions(createStubDocument(), {
    onRetry: () => {
      retried += 1;
    },
    onOpenSettings: () => {
      opened += 1;
    }
  });

  assert.equal(actions.childNodes.length, 2);
  assert.deepEqual(actions.childNodes.map((node) => node.textContent), ["Retry", "Open settings"]);

  clickAll(actions);
  assert.equal(retried, 1);
  assert.equal(opened, 1);
});

test("recovery actions omit retry when no retry handler is given", () => {
  const actions = buildWidgetRecoveryActions(createStubDocument(), {
    onOpenSettings: () => {}
  });

  assert.equal(actions.childNodes.length, 1);
  assert.equal(actions.childNodes[0].textContent, "Open settings");
});

test("recovery actions return null when nothing is actionable", () => {
  assert.equal(buildWidgetRecoveryActions(createStubDocument(), {}), null);
});

test("recovery actions tolerate a missing document", () => {
  assert.equal(buildWidgetRecoveryActions(null, { onRetry: () => {} }), null);
});

test("stale notice names the cache time when known", () => {
  const notice = buildStaleDataNotice(createStubDocument(), "3/12/2026 2:00:00 PM");
  assert.match(notice.textContent, /cached data from 3\/12\/2026/);
});

test("stale notice still warns without a timestamp", () => {
  const notice = buildStaleDataNotice(createStubDocument(), "");
  assert.match(notice.textContent, /cached data/i);
});

test("github widgets render inline recovery actions in failure states", async () => {
  const fs = await import("node:fs/promises");

  for (const widget of ["githubPrList", "githubReviewInbox"]) {
    const source = await fs.readFile(new URL(`../widgets/${widget}.js`, import.meta.url), "utf8");
    assert.ok(
      source.includes("buildWidgetRecoveryActions"),
      `${widget} must offer an inline action in its failure state`
    );
    assert.ok(
      source.includes("buildStaleDataNotice"),
      `${widget} must mark cached rows when the latest sync failed`
    );
  }
});
