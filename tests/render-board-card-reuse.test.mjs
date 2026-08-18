import assert from "node:assert/strict";
import test from "node:test";

import { widgetCardSignature } from "../core/widget-card-signature.js";

test("signature is stable across layout-only changes", () => {
  const before = { type: "clock", viewMode: "window", surfaceMode: "normal", containerId: "", page: 0 };
  const after = { ...before, layout: { x: 99, y: 99, w: 10, h: 10 }, title: "Renamed" };

  assert.equal(widgetCardSignature(before), widgetCardSignature(after));
});

test("signature changes when the widget type changes", () => {
  const before = { type: "clock", viewMode: "window", surfaceMode: "normal", containerId: "", page: 0 };
  const after = { ...before, type: "notes" };

  assert.notEqual(widgetCardSignature(before), widgetCardSignature(after));
});

test("signature changes when the view or surface mode changes", () => {
  const base = { type: "clock", viewMode: "window", surfaceMode: "normal", containerId: "", page: 0 };

  assert.notEqual(widgetCardSignature(base), widgetCardSignature({ ...base, viewMode: "headless" }));
  assert.notEqual(widgetCardSignature(base), widgetCardSignature({ ...base, surfaceMode: "transparent" }));
});

test("signature changes when container membership or page changes", () => {
  const base = { type: "clock", viewMode: "window", surfaceMode: "normal", containerId: "", page: 0 };

  assert.notEqual(widgetCardSignature(base), widgetCardSignature({ ...base, containerId: "c1" }));
  assert.notEqual(widgetCardSignature(base), widgetCardSignature({ ...base, page: 1 }));
});

test("signature treats missing container and page as stable defaults", () => {
  const withDefaults = { type: "clock", viewMode: "window", surfaceMode: "normal" };
  const withExplicit = { ...withDefaults, containerId: "", page: 0 };

  assert.equal(widgetCardSignature(withDefaults), widgetCardSignature(withExplicit));
});

test("signature does not throw on a missing instance", () => {
  assert.equal(typeof widgetCardSignature(null), "string");
  assert.equal(typeof widgetCardSignature(undefined), "string");
});

test("rehydrated instance with identical content keeps its signature", () => {
  const original = {
    type: "clock",
    viewMode: "window",
    surfaceMode: "normal",
    containerId: "",
    page: 0,
    config: { showSeconds: true }
  };
  // Simulates hydrate(): new object identity, same content.
  const rehydrated = JSON.parse(JSON.stringify(original));

  assert.notEqual(original, rehydrated, "identities must differ for this to be meaningful");
  assert.equal(
    widgetCardSignature(original),
    widgetCardSignature(rehydrated),
    "content-equal instances must reuse the existing card"
  );
});
