import { executeScript, hasScriptingApi } from "../../core/platform/chrome-scripting.js";
import { hasTabsApi } from "../../core/platform/chrome-tabs.js";
import { isPlainObject } from "../../core/utils/object.js";
import { normalizeText } from "../../core/utils/text.js";
import {
  createFlexAuthRequiredError,
  FLEX_AUTH_REQUIRED_CODE,
  isFlexLoginUrl
} from "./flexAuth.js";

export function executeFlexScriptInTab(
  tabId,
  func,
  args = [],
  fallbackMessage = "Unable to run script in Flex tab."
) {
  return executeScript(
    { target: { tabId }, func, args },
    { fallbackMessage }
  );
}

export function assertFlexScrapeApisAvailable(message) {
  if (!hasTabsApi() || !hasScriptingApi()) {
    throw new Error(message);
  }
}

export async function extractFlexHomeWorktimeFromTab(tabId) {
  const results = await executeFlexScriptInTab(
    tabId,
    async () => {
    const AUTH_REQUIRED_CODE = "FLEX_AUTH_REQUIRED";
    const STATUS_PATTERNS = [
      { regex: /근무\s*중|업무\s*중/u, label: "근무중" },
      { regex: /미출근|결근/u, label: "미출근" },
      { regex: /(^|[^미])출근/u, label: "출근" },
      { regex: /퇴근|근무\s*종료|업무\s*종료/u, label: "퇴근" },
      { regex: /휴게|휴식/u, label: "휴게" },
      { regex: /외근/u, label: "외근" },
      { regex: /재택/u, label: "재택" },
      { regex: /근무\s*전/u, label: "근무전" },
      { regex: /휴가/u, label: "휴가" }
    ];
    const DURATION_PATTERN = /(\d+\s*시간\s*\d+\s*분|\d+\s*시간|\d+\s*분)/u;
    const LOGIN_MARKER_GROUPS = [
      ["로그인", "비밀번호"],
      ["로그인", "이메일"],
      ["login", "password"],
      ["sign in", "password"]
    ];
    const WAIT_MS = 7000;
    const INTERVAL_MS = 350;

    function normalizeSpace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function normalizeDuration(value) {
      const text = normalizeSpace(value);
      if (!text) {
        return "";
      }

      const hourMinute = text.match(/(\d+)\s*시간\s*(\d+)\s*분/u);
      if (hourMinute) {
        return `${Number(hourMinute[1])}시간 ${Number(hourMinute[2])}분`;
      }

      const hourOnly = text.match(/(\d+)\s*시간/u);
      if (hourOnly) {
        return `${Number(hourOnly[1])}시간`;
      }

      const minuteOnly = text.match(/(\d+)\s*분/u);
      if (minuteOnly) {
        return `${Number(minuteOnly[1])}분`;
      }

      return text;
    }

    function detectStatus(text) {
      const line = normalizeSpace(text);
      for (const pattern of STATUS_PATTERNS) {
        if (pattern.regex.test(line)) {
          return pattern.label;
        }
      }
      return "";
    }

    function isLoginUrl(urlText) {
      const text = String(urlText || "");
      if (!text) {
        return false;
      }

      try {
        const parsed = new URL(text, location.origin);
        return /^\/auth\/login(?:\/|$)/i.test(String(parsed.pathname || "/"));
      } catch {
        return /(?:^|[/?#])auth\/login(?:[/?#]|$)/i.test(text);
      }
    }

    function hasLoginTextMarkers(bodyText, titleText) {
      const normalized = `${normalizeSpace(titleText)} ${normalizeSpace(bodyText)}`.toLowerCase();
      if (!normalized) {
        return false;
      }
      return LOGIN_MARKER_GROUPS.some((markerGroup) => markerGroup.every((marker) => normalized.includes(marker)));
    }

    function buildLoginRequiredResult(urlText, bodyText, titleText) {
      if (!isLoginUrl(urlText) && !hasLoginTextMarkers(bodyText, titleText)) {
        return null;
      }

      return {
        ok: false,
        code: AUTH_REQUIRED_CODE,
        authRequired: true,
        error: "Flex login is required. Sign in on the opened Flex tab, then return and refresh this widget.",
        title: normalizeSpace(titleText),
        url: normalizeSpace(urlText)
      };
    }

    function scanText() {
      const pageUrl = String(location.href || "");
      const pageTitle = String(document.title || "");

      if (!document.body) {
        const loginResult = buildLoginRequiredResult(pageUrl, "", pageTitle);
        if (loginResult) {
          return loginResult;
        }

        return {
          ok: false,
          error: "Flex Home page is not ready yet."
        };
      }

      const bodyTextRaw = String(document.body.innerText || "");
      const loginResult = buildLoginRequiredResult(pageUrl, bodyTextRaw, pageTitle);
      if (loginResult) {
        return loginResult;
      }

      const bodyText = normalizeSpace(bodyTextRaw);
      if (!bodyText) {
        return {
          ok: false,
          error: "Flex Home page text is empty."
        };
      }

      const candidates = [];

      function addCandidate(status, duration, line, bonus = 0) {
        const normalizedStatus = normalizeSpace(status);
        const normalizedDuration = normalizeDuration(duration);
        if (!normalizedStatus && !normalizedDuration) {
          return;
        }
        const normalizedLine = normalizeSpace(line || `${normalizedStatus} ${normalizedDuration}`.trim());
        const score =
          (normalizedStatus ? 35 : 0) +
          (normalizedDuration ? 45 : 0) +
          Math.max(0, 90 - normalizedLine.length) +
          bonus;
        candidates.push({
          status: normalizedStatus,
          duration: normalizedDuration,
          line: normalizedLine,
          score
        });
      }

      const seen = new Set();
      const lines = [];
      for (const rawLine of bodyTextRaw.split(/\n+/g)) {
        const line = normalizeSpace(rawLine);
        if (!line || line.length > 120 || seen.has(line)) {
          continue;
        }
        seen.add(line);
        lines.push(line);
      }

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const next = lines[index + 1] || "";

        const lineStatus = detectStatus(line);
        const lineDurationMatch = line.match(DURATION_PATTERN);
        const lineDuration = lineDurationMatch ? lineDurationMatch[1] : "";
        if (lineStatus || lineDuration) {
          addCandidate(lineStatus, lineDuration, line, lineStatus && lineDuration ? 120 : 0);
        }

        const nextStatus = detectStatus(next);
        const nextDurationMatch = next.match(DURATION_PATTERN);
        const nextDuration = nextDurationMatch ? nextDurationMatch[1] : "";

        if (lineStatus && !lineDuration && nextDuration) {
          addCandidate(lineStatus, nextDuration, `${line} ${next}`, 70);
        }
        if (!lineStatus && lineDuration && nextStatus) {
          addCandidate(nextStatus, lineDuration, `${nextStatus} ${lineDuration}`, 70);
        }
      }

      const bodyStatus = detectStatus(bodyText);
      const bodyDurationMatch = bodyText.match(DURATION_PATTERN);
      const bodyDuration = bodyDurationMatch ? bodyDurationMatch[1] : "";
      if (bodyStatus || bodyDuration) {
        addCandidate(bodyStatus, bodyDuration, `${bodyStatus} ${bodyDuration}`.trim(), 10);
      }

      if (!candidates.length) {
        return {
          ok: false,
          error: "Could not find work status/duration text on flex.team/home.",
          sample: lines.slice(0, 8),
          title: pageTitle,
          url: pageUrl
        };
      }

      candidates.sort((left, right) => right.score - left.score);
      const best = candidates[0];
      return {
        ok: true,
        status: best.status,
        duration: best.duration,
        line: best.line,
        title: pageTitle,
        url: pageUrl,
        extractedAt: Date.now()
      };
    }

    function wait(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }

    const deadline = Date.now() + WAIT_MS;
    let lastResult = null;
    while (Date.now() <= deadline) {
      const result = scanText();
      lastResult = result;
      if (result.ok) {
        return result;
      }
      await wait(INTERVAL_MS);
    }

    return lastResult || { ok: false, error: "Flex Home scrape timed out." };
    },
    [],
    "Unable to run script in Flex Home tab."
  );

  const result = Array.isArray(results) && results.length > 0 ? results[0].result : null;
  if (!isPlainObject(result)) {
    throw new Error("Flex Home scrape returned no result.");
  }

  if (!result.ok) {
    if (
      normalizeText(result.code).toUpperCase() === FLEX_AUTH_REQUIRED_CODE ||
      result.authRequired === true ||
      isFlexLoginUrl(result.url)
    ) {
      throw createFlexAuthRequiredError(result.error);
    }

    const extractedError = normalizeText(result.error);
    if (extractedError) {
      throw new Error(extractedError);
    }
    throw new Error("Unable to extract work status from Flex Home page.");
  }

  return result;
}
