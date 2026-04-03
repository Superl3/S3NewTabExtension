export function shouldRenderWidgetModalField(field = {}, { currentType = "", useCustomColors = false } = {}) {
  if (currentType === "aiChat" && (field.key === "contentFillParent" || field.key === "contentAlignY")) {
    return false;
  }

  if (
    !useCustomColors &&
    (field.key === "customTextColor" || field.key === "customAccentColor" || field.key === "customSurfaceColor")
  ) {
    return false;
  }

  return true;
}

export function isShortcutIconEditorField(field = {}) {
  return field.type === "shortcut-icon-editor";
}
