import test from "node:test";
import assert from "node:assert/strict";

import {
  DRAG_PREVIEW_Z_INDEX,
  DROP_SILHOUETTE_Z_INDEX,
  MAX_CARD_Z_INDEX,
  MAX_CONTENT_Z_INDEX,
  normalizeRawContentZIndex,
  resolveCardContentZIndex,
  resolveFolderPanelZIndex
} from "../core/drag-layering.js";
import { createWidgetDragPreview } from "../core/drag-preview.js";

test("drag layering keeps high-z cards below overlays without collapsing their order", () => {
  const zIndices = [999997, 999998, 999999].map((value) => resolveCardContentZIndex(value, 999999));

  assert.deepEqual(zIndices, [MAX_CARD_Z_INDEX - 2, MAX_CARD_Z_INDEX - 1, MAX_CARD_Z_INDEX]);
  assert.equal(new Set(zIndices).size, zIndices.length);
  assert.ok(DRAG_PREVIEW_Z_INDEX > DROP_SILHOUETTE_Z_INDEX);
  assert.ok(DROP_SILHOUETTE_Z_INDEX > zIndices.at(-1));
});

test("folder panel remains above its source card while staying below drag overlays", () => {
  const cardZIndex = resolveCardContentZIndex(999999, 999999);
  const panelZIndex = resolveFolderPanelZIndex(cardZIndex);

  assert.equal(cardZIndex, MAX_CARD_Z_INDEX);
  assert.equal(panelZIndex, MAX_CONTENT_Z_INDEX);
  assert.ok(panelZIndex > cardZIndex);
  assert.ok(DROP_SILHOUETTE_Z_INDEX > panelZIndex);
  assert.ok(DRAG_PREVIEW_Z_INDEX > panelZIndex);
});

test("folder panel layering stays above ordinary cards when source z-index is in range", () => {
  assert.equal(resolveFolderPanelZIndex(12), 13);
  assert.equal(resolveFolderPanelZIndex(Number.NaN), 2);
});

test("createWidgetDragPreview uses preview layer above normalized content", () => {
  const appended = [];
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;

  globalThis.HTMLElement = class HTMLElement {};

  globalThis.document = {
    createElement(tagName) {
      return {
        tagName,
        className: "",
        textContent: "",
        style: {},
        dataset: {}
      };
    },
    body: {
      append(node) {
        appended.push(node);
      }
    }
  };

  try {
    const preview = createWidgetDragPreview({ title: "Drag me" });

    assert.equal(preview.style.zIndex, String(DRAG_PREVIEW_Z_INDEX));
    assert.ok(Number(preview.style.zIndex) > resolveCardContentZIndex(999999, 999999));
    assert.equal(appended[0], preview);
  } finally {
    globalThis.document = originalDocument;
    globalThis.HTMLElement = originalHTMLElement;
  }
});

test("createWidgetDragPreview keeps long-press pointer misses anchored to top-left", () => {
  const appended = [];
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;

  class MockHTMLElement {}
  globalThis.HTMLElement = MockHTMLElement;

  const makeNode = () => {
    const classNames = new Set();
    return Object.assign(new MockHTMLElement(), {
      classList: {
        add(name) {
          classNames.add(name);
        },
        remove(name) {
          classNames.delete(name);
        },
        has(name) {
          return classNames.has(name);
        }
      },
      dataset: {},
      style: {
        setProperty(name, value) {
          this[name] = value;
        }
      },
      removeAttribute() {}
    });
  };

  const sourceCard = makeNode();
  sourceCard.getBoundingClientRect = () => ({
    left: 100,
    top: 100,
    width: 80,
    height: 60
  });

  globalThis.document = {
    body: {
      append(node) {
        appended.push(node);
      }
    }
  };

  try {
    const preview = makeNode();
    sourceCard.cloneNode = () => preview;

    const result = createWidgetDragPreview({ title: "Drag me" }, {
      sourceCard,
      pointerX: 260,
      pointerY: 240,
      fallbackPointerAnchor: "top-left"
    });

    assert.equal(result, preview);
    assert.equal(preview.dataset.dragOffsetX, "0");
    assert.equal(preview.dataset.dragOffsetY, "0");
    assert.equal(appended[0], preview);
  } finally {
    globalThis.document = originalDocument;
    globalThis.HTMLElement = originalHTMLElement;
  }
});

test("raw content z-index state stays unbounded while display z-index is normalized", () => {
  assert.equal(normalizeRawContentZIndex(999999), 999999);
  assert.equal(resolveCardContentZIndex(999999, 999999), MAX_CARD_Z_INDEX);
});
