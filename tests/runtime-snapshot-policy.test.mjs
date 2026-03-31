import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRuntimeOnlyPolicyToSnapshot,
  applyRuntimeOnlyWidgetConfigDefaults,
  buildPersistableWidgetConfigPatch
} from "../core/runtimeSnapshotPolicy.js";

test("applies runtime-only defaults for monday widgets", () => {
  const config = { accessToken: "token" };
  applyRuntimeOnlyWidgetConfigDefaults("mondayAssigned", config);
  assert.equal(config.autoRefreshDayKey, "");
  assert.equal(config.autoRefreshSlotsDone, "");
  assert.equal(config.accessToken, "token");
});

test("strips runtime-only fields from persistable widget patch", () => {
  const patch = buildPersistableWidgetConfigPatch("mondayMeetingNote", {
    autoRefreshDayKey: "2026-03-30",
    autoRefreshSlotsDone: "0,1",
    boardId: "123"
  });

  assert.equal(Object.prototype.hasOwnProperty.call(patch, "autoRefreshDayKey"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "autoRefreshSlotsDone"), false);
  assert.equal(patch.boardId, "123");
});

test("normalizes snapshot runtime-only fields before persistence", () => {
  const snapshot = {
    mode: "edit",
    selectedWidgetId: "todo-1",
    ui: {
      activeTab: "background",
      settingsOpen: true,
      home: {
        activePage: 3
      }
    },
    instances: [
      {
        type: "container",
        config: {
          expanded: true,
          title: "Folder"
        }
      },
      {
        type: "mondayAssigned",
        config: {
          autoRefreshDayKey: "2026-03-30",
          autoRefreshSlotsDone: "0,1",
          boardIds: "111"
        }
      }
    ]
  };

  applyRuntimeOnlyPolicyToSnapshot(snapshot);

  assert.equal(snapshot.mode, "use");
  assert.equal(snapshot.selectedWidgetId, "");
  assert.equal(snapshot.ui.activeTab, "global");
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.ui, "settingsOpen"), false);
  assert.equal(snapshot.ui.home.activePage, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.instances[0].config, "expanded"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.instances[1].config, "autoRefreshDayKey"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.instances[1].config, "autoRefreshSlotsDone"), false);
  assert.equal(snapshot.instances[1].config.boardIds, "111");
});
