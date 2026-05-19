import test from "node:test";
import assert from "node:assert/strict";

import {
  renderProfileSettingsView,
  resolvePresetsArray
} from "../core/profile-settings-render.js";

test("resolvePresetsArray returns array presets or empty fallback", () => {
  assert.deepEqual(resolvePresetsArray({ presets: [{ id: "p1" }] }), [{ id: "p1" }]);
  assert.deepEqual(resolvePresetsArray({ presets: null }), []);
  assert.deepEqual(resolvePresetsArray(null), []);
});

test("renderProfileSettingsView wires portable profile import input", () => {
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;

  class FakeElement {
    constructor(tagName = "div") {
      this.tagName = tagName;
      this.children = [];
      this.listeners = {};
      this.style = {};
      this.files = [];
      this.value = "";
      this.textContent = "";
      this.type = "";
      this.className = "";
      this.accept = "";
      this.disabled = false;
      this.clicked = false;
    }

    append(...children) {
      this.children.push(...children);
    }

    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }

    click() {
      this.clicked = true;
      this.listeners.click?.();
    }

    findByText(text) {
      if (this.textContent === text) {
        return this;
      }
      for (const child of this.children) {
        const found = child?.findByText?.(text);
        if (found) {
          return found;
        }
      }
      return null;
    }

    findByTag(tagName, predicate = () => true) {
      if (this.tagName === tagName && predicate(this)) {
        return this;
      }
      for (const child of this.children) {
        const found = child?.findByTag?.(tagName, predicate);
        if (found) {
          return found;
        }
      }
      return null;
    }
  }

  globalThis.HTMLElement = FakeElement;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName)
  };

  try {
    const imported = [];
    const settingsContent = new FakeElement("section");
    renderProfileSettingsView({
      settingsContent,
      state: { ui: {}, presets: [] },
      createFormRow: () => new FakeElement("label"),
      createSectionChip: () => new FakeElement("span"),
      actions: {
        savePreset: () => {},
        exportCurrentStateToFile: () => {},
        importProfileFromFile: (file) => imported.push(file),
        appendDivider: () => {}
      }
    });

    const importBtn = settingsContent.findByText("Import profile");
    const importInput = settingsContent.findByTag("input", (input) => input.type === "file");
    const file = { name: "profile.json" };

    assert.ok(importBtn);
    assert.equal(importInput.type, "file");
    assert.equal(importInput.accept, "application/json,.json");

    importBtn.click();
    assert.equal(importInput.clicked, true);

    importInput.files = [file];
    importInput.value = "C:\\fakepath\\profile.json";
    importInput.listeners.change();

    assert.deepEqual(imported, [file]);
    assert.equal(importInput.value, "");
  } finally {
    globalThis.document = previousDocument;
    globalThis.HTMLElement = previousHTMLElement;
  }
});
