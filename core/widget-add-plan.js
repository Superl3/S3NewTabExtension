import { arrayOrEmpty } from "./utils/array.js";
import { callIfFunction as call } from "./utils/function.js";

export function countBoardWidgetsOnPage(instances, targetPage, pageCount, deps = {}) {
  const { isWidgetDocked, isWidgetInContainer, normalizeWidgetPage } = deps;
  return arrayOrEmpty(instances).filter((instance) => {
    return (
      !call(isWidgetDocked, instance) &&
      !call(isWidgetInContainer, instance) &&
      (call(normalizeWidgetPage, instance?.page, pageCount, 0) ?? 0) === targetPage
    );
  }).length;
}

export function resolveRequestedWidgetSpans(type, options = {}, defaultSize = {}, deps = {}) {
  const { normalizeGridSpanValue, maxColumns = 16, maxRows = 24 } = deps;

  const requestedColSpan = call(normalizeGridSpanValue, options.colSpan, defaultSize.colSpan, maxColumns) ?? 1;
  const requestedRowSpan = call(normalizeGridSpanValue, options.rowSpan, defaultSize.rowSpan, maxRows) ?? 1;

  if (type === "container") {
    return {
      requestedColSpan,
      requestedRowSpan,
      colSpan: 1,
      rowSpan: 1
    };
  }

  return {
    requestedColSpan,
    requestedRowSpan,
    colSpan: requestedColSpan,
    rowSpan: requestedRowSpan
  };
}
