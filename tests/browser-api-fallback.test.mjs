import test from "node:test";
import assert from "node:assert/strict";

import { areBookmarksAvailable, resolveBookmarkRoot } from "../bookmarks.js";
import { loadState, saveState, STORAGE_KEY } from "../storage.js";
import { bookmarksWidget } from "../widgets/bookmarks.js";
import { shortcutWidget } from "../widgets/shortcut.js";

class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.style = {
      values: {},
      setProperty: (key, value) => {
        this.style.values[key] = value;
      }
    };
    this.className = "";
    this.textContent = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  queryText() {
    return [this.textContent, ...this.children.map((child) => child.queryText?.() || child.textContent || "")]
      .filter(Boolean)
      .join(" ");
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function withGlobalValue(key, value, callback) {
  const hadValue = Object.prototype.hasOwnProperty.call(globalThis, key);
  const previous = globalThis[key];
  if (value === undefined) {
    delete globalThis[key];
  } else {
    globalThis[key] = value;
  }

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (hadValue) {
        globalThis[key] = previous;
      } else {
        delete globalThis[key];
      }
    });
}

test("storage falls back safely when chrome storage is unavailable", async () => {
  const store = new Map();
  const localStorage = {
    getItem(key) {
      return store.get(key) || null;
    },
    setItem(key, value) {
      store.set(key, value);
    }
  };

  await withGlobalValue("chrome", undefined, async () => {
    await withGlobalValue("localStorage", localStorage, async () => {
      const defaultState = { mode: "use", ui: { home: { pageCount: 1 } } };

      assert.deepEqual(await loadState(defaultState), defaultState);

      await saveState({ mode: "edit", ui: { home: { pageCount: 2 } } });
      assert.equal(JSON.parse(store.get(STORAGE_KEY)).ui.home.pageCount, 2);

      const loaded = await loadState(defaultState);
      assert.equal(loaded.mode, "edit");
      assert.equal(loaded.ui.home.pageCount, 2);
    });
  });
});

test("bookmark root resolution degrades without chrome bookmarks API", async () => {
  await withGlobalValue("chrome", undefined, async () => {
    assert.equal(areBookmarksAvailable(), false);
    assert.equal(await resolveBookmarkRoot({ folderId: "0" }), null);
  });
});

test("default shortcut and bookmarks widgets render without browser APIs", async () => {
  const documentObj = new FakeDocument();

  await withGlobalValue("chrome", undefined, async () => {
    await withGlobalValue("document", documentObj, async () => {
      const shortcutContainer = documentObj.createElement("div");
      assert.doesNotThrow(() => {
        shortcutWidget.create({
          container: shortcutContainer,
          getConfig: () => ({ ...shortcutWidget.defaultConfig, faviconMode: "none" }),
          getUi: () => ({ shortcuts: { iconSizePercent: 100 } }),
          isEditMode: () => false,
          openSettings() {}
        });
      });

      const bookmarksContainer = documentObj.createElement("div");
      assert.doesNotThrow(() => {
        bookmarksWidget.create({
          container: bookmarksContainer,
          getConfig: () => bookmarksWidget.defaultConfig,
          patchConfig() {},
          isEditMode: () => false,
          getWidget: () => ({ viewMode: "window" })
        });
      });

      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.match(bookmarksContainer.queryText(), /browser extension/);
      assert.doesNotMatch(bookmarksContainer.queryText(), /Widget failed to load/);
    });
  });
});
