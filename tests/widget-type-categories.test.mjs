import test from "node:test";
import assert from "node:assert/strict";

import {
  groupWidgetDefinitionsByCategory,
  widgetTypeCategoryLabel
} from "../core/widget-type-categories.js";

test("widget type categories group common widgets for add-widget selection", () => {
  const groups = groupWidgetDefinitionsByCategory([
    { type: "clock", title: "Clock" },
    { type: "todo", title: "TODO" },
    { type: "geekNews", title: "GeekNews" },
    { type: "githubReviewInbox", title: "GitHub Review Inbox" },
    { type: "container", title: "Widget Folder" },
    { type: "aiChat", title: "AI Chat" },
    { type: "customThing", title: "Custom Thing" }
  ]);

  assert.deepEqual(
    groups.map((group) => [group.label, group.widgets.map((widget) => widget.type)]),
    [
      ["Essentials", ["clock"]],
      ["Planning", ["todo", "geekNews"]],
      ["Work", ["githubReviewInbox"]],
      ["Layout", ["container"]],
      ["Experimental", ["aiChat"]],
      ["Other", ["customThing"]]
    ]
  );
});

test("widget type categories resolve labels directly", () => {
  assert.equal(widgetTypeCategoryLabel("search"), "Essentials");
  assert.equal(widgetTypeCategoryLabel("notes"), "Planning");
  assert.equal(widgetTypeCategoryLabel("geekNews"), "Planning");
  assert.equal(widgetTypeCategoryLabel("gmail"), "Work");
  assert.equal(widgetTypeCategoryLabel("label"), "Layout");
  assert.equal(widgetTypeCategoryLabel("aiChat"), "Experimental");
  assert.equal(widgetTypeCategoryLabel("unknown"), "Other");
});
