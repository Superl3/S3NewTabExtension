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
  assert.match(source, /visibilityState === "hidden"/, "expected hidden documents to defer widget loading");
  assert.match(source, /refreshPosition\(\)/, "expected lightweight controller methods to be forwarded");
});
