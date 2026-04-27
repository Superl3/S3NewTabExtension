import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { widgetList, widgetRegistry } from "../widgets/index.js";

const metadataKeys = ["type", "title", "defaultConfig", "defaultLayout", "defaultGridSize", "settingsSchema"];

function pickMetadata(definition) {
  return Object.fromEntries(
    metadataKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(definition, key))
      .map((key) => [key, definition[key]])
  );
}

test("widget registry exposes metadata without eagerly loading widget implementations", async () => {
  assert.ok(widgetList.length > 0);
  for (const lazyDefinition of widgetList) {
    assert.equal(typeof lazyDefinition.create, "function");
    assert.equal(typeof lazyDefinition.load, "function");
    assert.equal(widgetRegistry[lazyDefinition.type], lazyDefinition);

    const loadedDefinition = await lazyDefinition.load();
    assert.equal(typeof loadedDefinition.create, "function");
    assert.deepEqual(pickMetadata(lazyDefinition), pickMetadata(loadedDefinition));
  }
});

test("lazy widget controller waits for viewport visibility before loading", async () => {
  const source = await fs.readFile(new URL("../widgets/index.js", import.meta.url), "utf8");

  assert.match(source, /IntersectionObserver/, "expected widget lazy loading to be viewport-gated");
  assert.match(source, /visibilityState !== "visible"/, "expected hidden documents to defer widget loading");
  assert.match(source, /getBoundingClientRect/, "expected visible widgets to have an immediate geometry fallback");
  assert.match(source, /refreshPosition\(\)/, "expected lightweight controller methods to be forwarded");
});

test("lazy widget controller loads immediately when target is already visible", async () => {
  const lazyDefinition = widgetRegistry.clock;
  const originalLoad = lazyDefinition.load;
  let loadCalls = 0;
  let created = false;
  let replacedChildren = [];
  let observedTarget = null;

  const target = {
    nodeType: 1,
    ownerDocument: null,
    getBoundingClientRect() {
      return {
        left: 10,
        top: 10,
        right: 120,
        bottom: 90
      };
    }
  };
  const documentObj = {
    visibilityState: "visible",
    documentElement: {
      clientWidth: 1024,
      clientHeight: 768
    },
    defaultView: {
      innerWidth: 1024,
      innerHeight: 768,
      requestAnimationFrame(callback) {
        callback();
      },
      IntersectionObserver: class {
        constructor() {}
        observe(nextTarget) {
          observedTarget = nextTarget;
        }
        disconnect() {}
      }
    },
    createElement() {
      return {
        className: "",
        textContent: ""
      };
    }
  };
  target.ownerDocument = documentObj;
  const container = {
    ownerDocument: documentObj,
    closest() {
      return target;
    },
    replaceChildren(...children) {
      replacedChildren = children;
    }
  };

  lazyDefinition.load = () => {
    loadCalls += 1;
    return Promise.resolve({
      create() {
        created = true;
        return {};
      }
    });
  };

  try {
    lazyDefinition.create({ container });
    await Promise.resolve();

    assert.equal(loadCalls, 1);
    assert.equal(created, true);
    assert.equal(observedTarget, null);
    assert.deepEqual(replacedChildren, []);
  } finally {
    lazyDefinition.load = originalLoad;
  }
});

test("lazy widget manualRefresh forces load when visibility gate has not fired", async () => {
  const lazyDefinition = widgetRegistry.clock;
  const originalLoad = lazyDefinition.load;
  let loadCalls = 0;
  let controllerManualRefreshCalls = 0;
  let observedTarget = null;

  const target = {
    nodeType: 1,
    ownerDocument: null,
    getBoundingClientRect() {
      return {
        left: 3000,
        top: 3000,
        right: 3120,
        bottom: 3090
      };
    }
  };
  const documentObj = {
    visibilityState: "visible",
    documentElement: {
      clientWidth: 1024,
      clientHeight: 768
    },
    defaultView: {
      innerWidth: 1024,
      innerHeight: 768,
      requestAnimationFrame(callback) {
        callback();
      },
      IntersectionObserver: class {
        constructor() {}
        observe(nextTarget) {
          observedTarget = nextTarget;
        }
        disconnect() {}
      }
    },
    createElement() {
      return {
        className: "",
        textContent: ""
      };
    }
  };
  target.ownerDocument = documentObj;
  const container = {
    ownerDocument: documentObj,
    closest() {
      return target;
    },
    replaceChildren() {}
  };

  lazyDefinition.load = () => {
    loadCalls += 1;
    return Promise.resolve({
      create() {
        return {
          manualRefresh() {
            controllerManualRefreshCalls += 1;
          }
        };
      }
    });
  };

  try {
    const controller = lazyDefinition.create({ container });

    assert.equal(loadCalls, 0);
    assert.equal(observedTarget, target);

    controller.manualRefresh();
    await Promise.resolve();

    assert.equal(loadCalls, 1);
    assert.equal(controllerManualRefreshCalls, 1);
  } finally {
    lazyDefinition.load = originalLoad;
  }
});
