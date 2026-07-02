import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { attachWidgetTypeActions } from "../core/widget-card-actions.js";

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.tokens = new Set();
  }

  toggle(name, force) {
    const enabled = typeof force === "boolean" ? force : !this.tokens.has(name);
    if (enabled) {
      this.tokens.add(name);
    } else {
      this.tokens.delete(name);
    }
    this.owner.className = Array.from(this.tokens).join(" ");
    return enabled;
  }

  contains(name) {
    return this.tokens.has(name);
  }
}

class FakeUseElement {
  constructor(href = "") {
    this.attributes = new Map();
    if (href) {
      this.attributes.set("href", href);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || "";
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.parentElement = null;
    this.className = "";
    this.classList = new FakeClassList(this);
    this.disabled = false;
    this.hidden = false;
    this.title = "";
    this.type = "";
    this.useElement = null;
  }

  set innerHTML(value) {
    const match = String(value).match(/<use href="([^"]+)"><\/use>/);
    this.useElement = new FakeUseElement(match?.[1] || "");
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
  }

  insertBefore(child, before) {
    child.parentElement = this;
    const index = this.children.indexOf(before);
    if (index === -1) {
      this.children.push(child);
      return;
    }
    this.children.splice(index, 0, child);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  querySelector(selector) {
    return selector === "use" ? this.useElement : null;
  }
}

function installFakeDocument() {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
  return () => {
    globalThis.document = previousDocument;
  };
}

function click(button) {
  const event = {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    }
  };
  button.listeners.get("click")?.(event);
  return event;
}

function createActionTargets() {
  const headActions = new FakeElement("div");
  const selectBtn = new FakeElement("button");
  headActions.append(selectBtn);
  const topActions = [];
  const bottomActions = [];
  return {
    headActions,
    selectBtn,
    topActions,
    bottomActions,
    placeFloatTopAction: (button) => topActions.push(button),
    placeFloatBottomAction: (button) => bottomActions.push(button)
  };
}

test("widget card actions keep one shared button factory", async () => {
  const source = await fs.readFile(new URL("../core/widget-card-actions.js", import.meta.url), "utf8");
  const buttonFactoryCalls = source.match(/document\.createElement\("button"\)/g) || [];

  assert.equal(buttonFactoryCalls.length, 1);
  assert.doesNotMatch(source, /const makeActionButton/);
  assert.doesNotMatch(source, /const placeHeadAction =/);
});

test("GitHub review inbox actions share head and float button wiring", () => {
  const restoreDocument = installFakeDocument();
  try {
    const calls = [];
    const targets = createActionTargets();

    attachWidgetTypeActions({
      instance: { type: "githubReviewInbox" },
      controller: {
        manualRefresh() {
          calls.push("refresh");
        },
        openRepository() {
          calls.push("open");
        }
      },
      ...targets
    });

    const [refreshHead, openHead, selectBtn] = targets.headActions.children;
    assert.equal(selectBtn, targets.selectBtn);
    assert.equal(refreshHead.title, "Refresh review inbox");
    assert.equal(openHead.title, "Open repository pull requests");
    assert.equal(targets.bottomActions[0].title, "Refresh review inbox");
    assert.equal(targets.topActions[0].title, "Open repository pull requests");

    const refreshEvent = click(refreshHead);
    const openEvent = click(targets.topActions[0]);
    assert.deepEqual(calls, ["refresh", "open"]);
    assert.equal(refreshEvent.defaultPrevented, true);
    assert.equal(openEvent.propagationStopped, true);
  } finally {
    restoreDocument();
  }
});

test("Monday auth actions resync icon and title after connection toggle", async () => {
  const restoreDocument = installFakeDocument();
  try {
    let connected = false;
    const targets = createActionTargets();

    attachWidgetTypeActions({
      instance: { type: "mondayAssigned" },
      controller: {
        toggleConnection() {
          connected = !connected;
        },
        isConnected() {
          return connected;
        }
      },
      ...targets
    });

    const authHead = targets.headActions.children[0];
    const authFloat = targets.topActions[0];
    assert.equal(authHead.title, "Connect Monday");
    assert.equal(authHead.querySelector("use").getAttribute("href"), "#i-connect");
    assert.equal(authFloat.title, "Connect Monday");

    click(authHead);
    await Promise.resolve();

    assert.equal(authHead.title, "Disconnect Monday");
    assert.equal(authHead.querySelector("use").getAttribute("href"), "#i-disconnect");
    assert.equal(authHead.classList.contains("is-disconnect"), true);
    assert.equal(authFloat.title, "Disconnect Monday");
    assert.equal(authFloat.querySelector("use").getAttribute("href"), "#i-disconnect");
  } finally {
    restoreDocument();
  }
});

test("account widget switch actions keep unavailable buttons hidden", () => {
  const restoreDocument = installFakeDocument();
  try {
    const calls = [];
    const targets = createActionTargets();

    attachWidgetTypeActions({
      instance: { type: "gmail" },
      controller: {
        refresh() {
          calls.push("refresh");
        },
        openGmail() {
          calls.push("open");
        },
        switchAccount() {
          calls.push("switch");
        },
        canSwitchAccount() {
          return false;
        }
      },
      ...targets
    });

    const [refreshHead, openHead, switchHead] = targets.headActions.children;
    assert.equal(refreshHead.title, "Refresh unread mail");
    assert.equal(openHead.title, "Open Gmail");
    assert.equal(switchHead.title, "Switch Gmail account");
    assert.equal(switchHead.hidden, true);
    assert.equal(switchHead.disabled, true);
    assert.equal(targets.topActions[1].hidden, true);
    assert.equal(targets.topActions[1].disabled, true);

    click(refreshHead);
    click(openHead);
    assert.deepEqual(calls, ["refresh", "open"]);
  } finally {
    restoreDocument();
  }
});
