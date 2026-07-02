import { queryTabs as queryBrowserTabs } from "../../core/platform/chrome-tabs.js";
import { isMatchingFlexLoginTabUrl } from "./flexUrls.js";

export function selectPreferredFlexTab(tabs, targetUrl, matchTabUrl) {
  const pageMatch = tabs.find((tab) => matchTabUrl(tab?.url, targetUrl));
  if (pageMatch) {
    return pageMatch;
  }

  return tabs.find((tab) => isMatchingFlexLoginTabUrl(tab?.url, targetUrl)) || null;
}

export async function findFlexTabByPriority(targetUrl, matchTabUrl, options = {}) {
  const queryTabs = typeof options.queryTabs === "function" ? options.queryTabs : queryBrowserTabs;

  const activeCurrentWindow = await queryTabs({ active: true, currentWindow: true });
  const activeMatch = selectPreferredFlexTab(activeCurrentWindow, targetUrl, matchTabUrl);
  if (activeMatch) {
    return activeMatch;
  }

  const currentWindowTabs = await queryTabs({ currentWindow: true });
  const currentMatch = selectPreferredFlexTab(currentWindowTabs, targetUrl, matchTabUrl);
  if (currentMatch) {
    return currentMatch;
  }

  const allTabs = await queryTabs({});
  return selectPreferredFlexTab(allTabs, targetUrl, matchTabUrl);
}
