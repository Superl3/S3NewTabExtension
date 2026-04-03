export function buildThemeSettingFields({ fontOptions = [] } = {}) {
  return [
    { key: "primary", label: "Primary", type: "color" },
    { key: "accent", label: "Accent", type: "color" },
    { key: "secondary", label: "Secondary", type: "color" },
    { key: "background", label: "Background", type: "color" },
    { key: "surface", label: "Surface", type: "color" },
    { key: "text", label: "Text", type: "color" },
    { key: "line", label: "Line", type: "color" },
    { key: "fontFamily", label: "Font family", type: "select", options: fontOptions },
    { key: "fontScale", label: "Content font scale", type: "number", min: 0.5, max: 2, step: 0.05 }
  ];
}

export function buildHomeSettingFields({ maxColumns = 16, maxRows = 16 } = {}) {
  return [
    {
      key: "mode",
      label: "Home layout mode",
      type: "select",
      options: [
        { value: "grid", label: "Grid" },
        { value: "free", label: "Free mode" }
      ]
    },
    {
      key: "gridColumns",
      label: "Grid columns (N)",
      type: "number",
      min: 1,
      max: maxColumns,
      step: 1
    },
    {
      key: "gridRows",
      label: "Grid rows (M)",
      type: "number",
      min: 1,
      max: maxRows,
      step: 1
    },
    {
      key: "marginHorizontal",
      label: "Horizontal margin",
      type: "select",
      options: [
        { value: "wide", label: "Wide" },
        { value: "medium", label: "Medium" },
        { value: "narrow", label: "Narrow" },
        { value: "none", label: "None" }
      ]
    },
    {
      key: "marginVertical",
      label: "Vertical margin",
      type: "select",
      options: [
        { value: "wide", label: "Wide" },
        { value: "medium", label: "Medium" },
        { value: "narrow", label: "Narrow" },
        { value: "none", label: "None" }
      ]
    },
    {
      key: "itemGap",
      label: "Item gap",
      type: "select",
      options: [
        { value: "narrow", label: "Narrow (Default)" },
        { value: "wide", label: "Wide" },
        { value: "none", label: "None" }
      ]
    },
    {
      key: "dockEnabled",
      label: "Enable dock",
      type: "checkbox"
    },
    {
      key: "widgetBackdropBlur",
      label: "Blur behind widgets",
      type: "checkbox"
    }
  ];
}
