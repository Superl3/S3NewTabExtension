export function applyAddWidgetModalAction(
  {
    type,
    titleInputValue,
    allowUseModeAdd = false
  } = {},
  deps = {}
) {
  const {
    widgetRegistry,
    widgetDefaultGridSize,
    normalizeText,
    addWidget,
    closeAddWidgetModal,
    markAddAttempt,
    didAddWidgetAfterError
  } = deps;

  const def = widgetRegistry?.[type];
  if (!def) {
    return false;
  }

  const defaultSize = widgetDefaultGridSize?.(type, def) || { colSpan: 1, rowSpan: 1 };
  const colSpan = type === "container" ? 1 : defaultSize.colSpan;
  const rowSpan = type === "container" ? 1 : defaultSize.rowSpan;
  const title = normalizeText?.(titleInputValue, def.title) ?? def.title;

  const marker = markAddAttempt?.();
  let added = false;
  try {
    added = addWidget?.(type, {
      colSpan,
      rowSpan,
      title,
      allowUseModeAdd
    }) === true;
  } catch (error) {
    const addedAfterError = didAddWidgetAfterError?.(marker) === true;
    if (!addedAfterError) {
      throw error;
    }
    added = true;
  }

  if (added) {
    closeAddWidgetModal?.();
  }

  return added;
}
