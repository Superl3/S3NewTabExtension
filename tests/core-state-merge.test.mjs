import test from "node:test";
import assert from "node:assert/strict";

import { deepMerge, isStateObject, mergeStateObjects } from "../core/state/merge.js";

test("isStateObject accepts plain objects and rejects arrays and null", () => {
  assert.equal(isStateObject({ nested: true }), true);
  assert.equal(isStateObject([]), false);
  assert.equal(isStateObject(null), false);
});

test("deepMerge preserves nested merge semantics and clones patched arrays", () => {
  const base = {
    ui: {
      home: {
        pageCount: 1,
        sections: ["a"]
      },
      theme: {
        mode: "light"
      }
    }
  };
  const patch = {
    ui: {
      home: {
        pageCount: 2,
        sections: ["b", "c"]
      }
    }
  };

  const merged = deepMerge(base, patch);

  assert.deepEqual(merged, {
    ui: {
      home: {
        pageCount: 2,
        sections: ["b", "c"]
      },
      theme: {
        mode: "light"
      }
    }
  });
  assert.notStrictEqual(merged, base);
  assert.notStrictEqual(merged.ui, base.ui);
  assert.notStrictEqual(merged.ui.home.sections, patch.ui.home.sections);
});

test("deepMerge returns patch when either side is not a state object", () => {
  assert.equal(deepMerge(null, 5), 5);
  assert.equal(deepMerge({ value: 1 }, null), null);
});

test("mergeStateObjects clones base and ignores invalid patch objects", () => {
  const base = {
    ui: {
      home: {
        pageCount: 1
      }
    }
  };

  const merged = mergeStateObjects(base, null);

  assert.deepEqual(merged, base);
  assert.notStrictEqual(merged, base);
  assert.notStrictEqual(merged.ui, base.ui);
});

test("mergeStateObjects merges nested objects without mutating inputs", () => {
  const base = {
    ui: {
      home: {
        pageCount: 1,
        gridColumns: 4
      }
    }
  };
  const patch = {
    ui: {
      home: {
        pageCount: 3
      }
    }
  };

  const merged = mergeStateObjects(base, patch);

  assert.deepEqual(merged, {
    ui: {
      home: {
        pageCount: 3,
        gridColumns: 4
      }
    }
  });
  assert.deepEqual(base, {
    ui: {
      home: {
        pageCount: 1,
        gridColumns: 4
      }
    }
  });
});
