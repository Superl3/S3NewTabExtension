import {
  queryTabs as queryBrowserTabs,
  updateTab as updateBrowserTab
} from "../../core/platform/chrome-tabs.js";
import { normalizeText } from "../../core/utils/text.js";
import { isFlexAuthRequiredError } from "./flexAuth.js";
import {
  isLikelyOngoingFlexAuthFlowUrl,
  isMatchingFlexLoginTabUrl
} from "./flexUrls.js";

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

export async function activateFlexAuthFlowTabIfNeeded({
  tabId,
  error,
  currentTab,
  targetTab,
  targetUrl,
  updateTab = updateBrowserTab
} = {}) {
  const currentTabUrl = normalizeText(currentTab?.url, normalizeText(targetTab?.url));
  const authFlowLikely =
    isFlexAuthRequiredError(error) || isLikelyOngoingFlexAuthFlowUrl(currentTabUrl, targetUrl);

  if (!authFlowLikely) {
    return false;
  }

  try {
    await updateTab(tabId, { active: true });
  } catch {
    // noop
  }
  return true;
}
