const WIDGET_TYPE_CATEGORY_DEFINITIONS = [
  {
    label: "Essentials",
    types: ["clock", "search", "weather", "shortcut", "bookmarks"]
  },
  {
    label: "Planning",
    types: ["todo", "notes", "calendar", "rss"]
  },
  {
    label: "Work",
    types: [
      "gmail",
      "githubPrList",
      "githubReviewInbox",
      "mondayAssigned",
      "mondayMeetingNote",
      "flexWorktime",
      "flexWorktimeTimeline",
      "codexUsage"
    ]
  },
  {
    label: "Layout",
    types: ["container", "label"]
  },
  {
    label: "Experimental",
    types: ["aiChat"]
  }
];

const FALLBACK_CATEGORY_LABEL = "Other";

export function widgetTypeCategoryLabel(type) {
  for (const category of WIDGET_TYPE_CATEGORY_DEFINITIONS) {
    if (category.types.includes(type)) {
      return category.label;
    }
  }
  return FALLBACK_CATEGORY_LABEL;
}

export function groupWidgetDefinitionsByCategory(widgetDefinitions = []) {
  const groupsByLabel = new Map(
    WIDGET_TYPE_CATEGORY_DEFINITIONS.map((category) => [
      category.label,
      {
        label: category.label,
        widgets: []
      }
    ])
  );
  groupsByLabel.set(FALLBACK_CATEGORY_LABEL, {
    label: FALLBACK_CATEGORY_LABEL,
    widgets: []
  });

  for (const widget of widgetDefinitions) {
    if (!widget?.type) {
      continue;
    }
    groupsByLabel.get(widgetTypeCategoryLabel(widget.type)).widgets.push(widget);
  }

  return Array.from(groupsByLabel.values()).filter((group) => group.widgets.length > 0);
}
