import { toPositiveInteger } from "./utils/number.js";

export function buildWidgetModalCommonFields({ pageCount = 1, allowManualLayout = false } = {}) {
  const maxPage = toPositiveInteger(pageCount, 1);
  const fields = [
    { key: "title", label: "Title", type: "text", group: "base" },
    {
      key: "page",
      label: "Page",
      type: "number",
      min: 1,
      max: maxPage,
      step: 1,
      group: "base"
    },
    {
      key: "viewMode",
      label: "Display mode",
      type: "select",
      group: "base",
      options: [
        { value: "window", label: "Window" },
        { value: "headless", label: "Headless" }
      ]
    },
    {
      key: "surfaceMode",
      label: "Surface mode",
      type: "select",
      group: "base",
      options: [
        { value: "normal", label: "Normal" },
        { value: "transparent", label: "Transparent" }
      ]
    },
    {
      key: "transparentAutoContrast",
      label: "Auto contrast in transparent mode",
      type: "checkbox",
      group: "base"
    },
    {
      key: "transparentGhostStrength",
      label: "Transparent ghost strength (%)",
      type: "number",
      min: 40,
      max: 180,
      step: 5,
      group: "base"
    },
    {
      key: "backdropBlur",
      label: "Blur background",
      type: "checkbox",
      group: "base"
    },
    {
      key: "edgeRoundness",
      label: "Edge roundness",
      type: "number",
      group: "base",
      min: 0,
      max: 40,
      step: 1
    },
    {
      key: "transparency",
      label: "Transparency",
      type: "number",
      group: "base",
      min: 0,
      max: 1,
      step: 0.05
    },
    {
      key: "titleAlign",
      label: "Title align",
      type: "select",
      group: "base",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" }
      ]
    },
    {
      key: "contentAlignY",
      label: "Content vertical align",
      type: "select",
      group: "base",
      options: [
        { value: "top", label: "Top" },
        { value: "center", label: "Center" },
        { value: "bottom", label: "Bottom" }
      ]
    },
    {
      key: "contentFillParent",
      label: "Fill content to widget",
      type: "checkbox",
      group: "base"
    },
    {
      key: "contentPadding",
      label: "Content padding",
      type: "number",
      min: 0,
      max: 48,
      step: 1,
      group: "base"
    },
    {
      key: "contentFontScale",
      label: "Content font scale",
      type: "number",
      min: 0.5,
      max: 2,
      step: 0.05,
      group: "base"
    },
    {
      key: "widgetThemeMode",
      label: "Widget theme override",
      type: "select",
      group: "base",
      options: [
        { value: "inherit", label: "Inherit global" },
        { value: "light", label: "Force light" },
        { value: "dark", label: "Force dark" }
      ]
    },
    {
      key: "useCustomColors",
      label: "Use custom colors",
      type: "checkbox",
      group: "base"
    },
    { key: "customTextColor", label: "Custom text color", type: "color", group: "base" },
    { key: "customAccentColor", label: "Custom accent color", type: "color", group: "base" },
    { key: "customSurfaceColor", label: "Custom surface color", type: "color", group: "base" }
  ];

  if (allowManualLayout) {
    fields.push(
      { key: "x", label: "X", type: "number", group: "layout" },
      { key: "y", label: "Y", type: "number", group: "layout" },
      { key: "w", label: "Width", type: "number", group: "layout" },
      { key: "h", label: "Height", type: "number", group: "layout" }
    );
  }

  return fields;
}

export function buildWidgetCommonMasterFields() {
  return [
    {
      key: "viewMode",
      label: "Default display mode",
      type: "select",
      options: [
        { value: "window", label: "Window" },
        { value: "headless", label: "Headless" }
      ]
    },
    {
      key: "surfaceMode",
      label: "Default surface mode",
      type: "select",
      options: [
        { value: "normal", label: "Normal" },
        { value: "transparent", label: "Transparent" }
      ]
    },
    { key: "transparentAutoContrast", label: "Default auto contrast in transparent mode", type: "checkbox" },
    {
      key: "transparentGhostStrength",
      label: "Default transparent ghost strength (%)",
      type: "number",
      min: 40,
      max: 180,
      step: 5
    },
    { key: "backdropBlur", label: "Default blur behind widget", type: "checkbox" },
    { key: "edgeRoundness", label: "Default edge roundness", type: "number", min: 0, max: 40, step: 1 },
    { key: "transparency", label: "Default transparency", type: "number", min: 0, max: 1, step: 0.05 },
    {
      key: "titleAlign",
      label: "Default title align",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" }
      ]
    },
    {
      key: "contentAlignY",
      label: "Default content vertical align",
      type: "select",
      options: [
        { value: "top", label: "Top" },
        { value: "center", label: "Center" },
        { value: "bottom", label: "Bottom" }
      ]
    },
    { key: "contentFillParent", label: "Default fill content", type: "checkbox" },
    { key: "contentPadding", label: "Default content padding", type: "number", min: 0, max: 48, step: 1 },
    { key: "contentFontScale", label: "Default content font scale", type: "number", min: 0.5, max: 2, step: 0.05 },
    {
      key: "widgetThemeMode",
      label: "Default widget theme override",
      type: "select",
      options: [
        { value: "inherit", label: "Inherit global" },
        { value: "light", label: "Force light" },
        { value: "dark", label: "Force dark" }
      ]
    },
    { key: "useCustomColors", label: "Default use custom colors", type: "checkbox" },
    { key: "customTextColor", label: "Default custom text color", type: "color" },
    { key: "customAccentColor", label: "Default custom accent color", type: "color" },
    { key: "customSurfaceColor", label: "Default custom surface color", type: "color" }
  ];
}
