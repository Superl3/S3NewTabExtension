import assert from "node:assert/strict";
import test from "node:test";

import { createLazyWidgetControllerForTest, createLazyWidgetDefinitionForTest } from "../widgets/index.js";

function createStubElement(tagName = "div") {
  const element = {
    tagName,
    className: "",
    textContent: "",
    type: "",
    children: [],
    listeners: new Map(),
    ownerDocument: null,
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    addEventListener(name, handler) {
      this.listeners.set(name, handler);
    },
    closest() {
      return null;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10 };
    }
  };
  return element;
}

function createStubDocument() {
  const documentObj = {
    createElement(tagName) {
      const element = createStubElement(tagName);
      element.ownerDocument = documentObj;
      return element;
    },
    documentElement: { clientWidth: 800, clientHeight: 600 }
  };
  return documentObj;
}

function createStubContainer() {
  const documentObj = createStubDocument();
  const container = createStubElement("div");
  container.ownerDocument = documentObj;
  documentObj.defaultView = {
    innerWidth: 800,
    innerHeight: 600,
    requestAnimationFrame: (fn) => {
      fn();
      return 1;
    },
    setTimeout: (fn) => {
      void fn;
      return 0;
    }
  };
  return container;
}

function findRetryButton(container) {
  const stack = [...container.children];
  while (stack.length) {
    const node = stack.shift();
    if (!node) {
      continue;
    }
    if (node.tagName === "button") {
      return node;
    }
    stack.push(...(node.children || []));
  }
  return null;
}

test("lazy widget definition retries the loader after a rejected load", async () => {
  let attempts = 0;
  const definition = createLazyWidgetDefinitionForTest(
    { type: "stub" },
    () => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error("transient module failure"));
      }
      return Promise.resolve({ create: () => ({}) });
    }
  );

  await assert.rejects(() => definition.load(), /transient module failure/);
  assert.equal(attempts, 1);

  const loaded = await definition.load();
  assert.equal(typeof loaded.create, "function");
  assert.equal(attempts, 2, "rejected load must not be memoized");
});

test("lazy widget definition still caches a successful load", async () => {
  let attempts = 0;
  const definition = createLazyWidgetDefinitionForTest(
    { type: "stub" },
    () => {
      attempts += 1;
      return Promise.resolve({ create: () => ({}) });
    }
  );

  await definition.load();
  await definition.load();
  assert.equal(attempts, 1, "successful load must stay memoized");
});

test("lazy controller renders a retry action and recovers after failure", async () => {
  const container = createStubContainer();
  let attempts = 0;
  let created = 0;

  const definition = {
    type: "stub",
    load() {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error("transient module failure"));
      }
      return Promise.resolve({
        create: () => {
          created += 1;
          return {};
        }
      });
    }
  };

  const controller = createLazyWidgetControllerForTest(definition, { container });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(attempts, 1);
  assert.equal(created, 0);

  const retry = findRetryButton(container);
  assert.ok(retry, "failure state must expose a retry control");

  retry.listeners.get("click")?.({ preventDefault() {}, stopPropagation() {} });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(attempts, 2, "retry must re-invoke the loader");
  assert.equal(created, 1, "retry must create the widget controller");

  void controller;
});

test("lazy controller refresh re-invokes the loader after a failed load", async () => {
  const container = createStubContainer();
  let attempts = 0;

  const definition = {
    type: "stub",
    load() {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error("transient module failure"));
      }
      return Promise.resolve({ create: () => ({}) });
    }
  };

  const controller = createLazyWidgetControllerForTest(definition, { container });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 1);

  controller.manualRefresh();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(attempts, 2, "manualRefresh must retry after a failed load");
});

test("lazy controller does not retry after destroy", async () => {
  const container = createStubContainer();
  let attempts = 0;

  const definition = {
    type: "stub",
    load() {
      attempts += 1;
      return Promise.reject(new Error("transient module failure"));
    }
  };

  const controller = createLazyWidgetControllerForTest(definition, { container });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 1);

  controller.destroy();
  controller.manualRefresh();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(attempts, 1, "destroyed controller must not reload");
});
