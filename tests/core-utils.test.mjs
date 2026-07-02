import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  resolveBrowserEventTarget,
  resolveBrowserTimerApi
} from "../core/platform/browser-api.js";
import { normalizeErrorMessage } from "../core/utils/error.js";
import { callIfFunction } from "../core/utils/function.js";
import { pointInsideRect } from "../core/utils/geometry.js";
import { snapToHalfGridTrack } from "../core/utils/grid.js";
import { parseJsonOrFallback, parseJsonOrNull } from "../core/utils/json.js";
import {
  clamp,
  clampFiniteOrMin,
  clampNumberOrFallback,
  clampRoundedTruthyNumberOrFallback,
  clampTruthyNumberOrFallback,
  normalizeIntegerInRange,
  roundFiniteOrFallback,
  toFiniteNumber,
  toInteger,
  toNonNegativeNumberOrFallback,
  toTruthyNumberOrFallback,
  toPositiveInteger
} from "../core/utils/number.js";
import { hasOwn, isPlainObject } from "../core/utils/object.js";
import { normalizeText } from "../core/utils/text.js";
import { clamp as layoutClamp } from "../core/layout-primitives.js";
import {
  createFlexAuthRequiredError,
  FLEX_AUTH_REQUIRED_CODE,
  isFlexAuthRequiredError,
  isFlexLoginUrl
} from "../widgets/shared/flexAuth.js";
import {
  isLikelyOngoingFlexAuthFlowUrl,
  isMatchingFlexHomeTabUrl,
  isMatchingFlexLoginTabUrl,
  parseFlexHomeTargetUrl
} from "../widgets/shared/flexUrls.js";

test("normalizeText trims text and falls back for blank-like values", () => {
  assert.equal(normalizeText("  hello  "), "hello");
  assert.equal(normalizeText("   ", "fallback"), "fallback");
  assert.equal(normalizeText(0, "fallback"), "fallback");
});

test("clamp bounds values inside min and max", () => {
  assert.equal(clamp(9, 1, 5), 5);
  assert.equal(clamp(-2, 1, 5), 1);
  assert.equal(clamp(3, 1, 5), 3);
});

test("clampFiniteOrMin bounds finite values and uses min for non-finite values", () => {
  assert.equal(clampFiniteOrMin(9, 1, 5), 5);
  assert.equal(clampFiniteOrMin(-2, 1, 5), 1);
  assert.equal(clampFiniteOrMin(Number.NaN, 1, 5), 1);
});

test("clampNumberOrFallback coerces numbers and preserves fallback values", () => {
  assert.equal(clampNumberOrFallback("9", 1, 1, 5), 5);
  assert.equal(clampNumberOrFallback("-2", 1, 1, 5), 1);
  assert.equal(clampNumberOrFallback("bad", 150, 0, 100), 150);
});

test("clampTruthyNumberOrFallback preserves legacy falsy fallback semantics", () => {
  assert.equal(clampTruthyNumberOrFallback(0, 0.24, 0, 0.85), 0.24);
  assert.equal(clampTruthyNumberOrFallback("", 0.24, 0, 0.85), 0.24);
  assert.equal(clampTruthyNumberOrFallback(null, 0.24, 0, 0.85), 0.24);
  assert.equal(clampTruthyNumberOrFallback(-1, 0.24, 0, 0.85), 0);
  assert.equal(clampTruthyNumberOrFallback(2, 0.24, 0, 0.85), 0.85);
});

test("clampRoundedTruthyNumberOrFallback preserves rounded truthy fallback semantics", () => {
  assert.equal(clampRoundedTruthyNumberOrFallback(0, 10, 0, 48), 10);
  assert.equal(clampRoundedTruthyNumberOrFallback(null, 10, 0, 48), 10);
  assert.equal(clampRoundedTruthyNumberOrFallback("4.6", 10, 0, 48), 5);
  assert.equal(clampRoundedTruthyNumberOrFallback(120, 10, 0, 48), 48);
});

test("toNonNegativeNumberOrFallback preserves legacy non-negative number semantics", () => {
  assert.equal(toNonNegativeNumberOrFallback(4.5), 4.5);
  assert.equal(toNonNegativeNumberOrFallback(-1), 0);
  assert.equal(toNonNegativeNumberOrFallback("bad"), 0);
  assert.equal(toNonNegativeNumberOrFallback("", 7), 7);
});

test("toTruthyNumberOrFallback preserves truthy number fallback semantics", () => {
  let fallbackCalls = 0;
  const fallback = () => {
    fallbackCalls += 1;
    return 10;
  };

  assert.equal(toTruthyNumberOrFallback("4.5", 10), 4.5);
  assert.equal(toTruthyNumberOrFallback("4.5", fallback), 4.5);
  assert.equal(fallbackCalls, 0);
  assert.equal(toTruthyNumberOrFallback(0, fallback), 10);
  assert.equal(fallbackCalls, 1);
  assert.equal(toTruthyNumberOrFallback("bad", fallback), 10);
  assert.equal(fallbackCalls, 2);
  assert.equal(toTruthyNumberOrFallback(-5, 10), -5);
});

test("toFiniteNumber returns numeric values and falls back for non-finite values", () => {
  assert.equal(toFiniteNumber("4.5", 1), 4.5);
  assert.equal(toFiniteNumber("bad", 7), 7);
  assert.equal(toFiniteNumber(null, 7), 0);
});

test("integer utilities floor finite values and preserve fallback semantics", () => {
  assert.equal(toInteger("4.8", 1), 4);
  assert.equal(toInteger("bad", 7), 7);
  assert.equal(toPositiveInteger("0.4", 1), 1);
  assert.equal(toPositiveInteger("bad", 0), 0);
});

test("normalizeIntegerInRange rounds finite values and clamps fallback values", () => {
  assert.equal(normalizeIntegerInRange("4.6", 1, 1, 10), 5);
  assert.equal(normalizeIntegerInRange("bad", 12, 1, 10), 10);
  assert.equal(normalizeIntegerInRange(-3, 2, 1, 10), 1);
});

test("roundFiniteOrFallback rounds finite values and preserves fallback values", () => {
  assert.equal(roundFiniteOrFallback("4.6", 1), 5);
  assert.equal(roundFiniteOrFallback("bad", 1.4), 1.4);
  assert.equal(roundFiniteOrFallback(null, 7), 0);
});

test("normalizeErrorMessage returns safe fallback text", () => {
  assert.equal(normalizeErrorMessage(), "Unknown error");
  assert.equal(normalizeErrorMessage("  bad request  "), "bad request");
  assert.equal(normalizeErrorMessage({ message: "  failed  " }), "failed");
});

test("parseJsonOrNull parses JSON objects and ignores invalid input", () => {
  assert.deepEqual(parseJsonOrNull(" { \"ok\": true } "), { ok: true });
  assert.equal(parseJsonOrNull(""), null);
  assert.equal(parseJsonOrNull("not-json"), null);
  assert.equal(parseJsonOrNull({ ok: true }), null);
});

test("parseJsonOrFallback preserves valid null and custom invalid fallbacks", () => {
  const fallback = { fallback: true };
  assert.deepEqual(parseJsonOrFallback(" { \"ok\": true } ", fallback), { ok: true });
  assert.equal(parseJsonOrFallback("null", fallback), null);
  assert.equal(parseJsonOrFallback("", fallback), fallback);
  assert.equal(parseJsonOrFallback("not-json", fallback), fallback);
});

test("callIfFunction returns undefined for non-functions and forwards arguments", () => {
  assert.equal(callIfFunction(null, 1, 2), undefined);
  assert.equal(callIfFunction(function sum(left, right) {
    return left + right;
  }, 2, 3), 5);
});

test("pointInsideRect keeps pointer hit testing numeric and inclusive", () => {
  const rect = { left: 10, right: 20, top: 30, bottom: 40 };
  assert.equal(pointInsideRect(10, 35, rect), true);
  assert.equal(pointInsideRect(20, 40, rect), true);
  assert.equal(pointInsideRect(9, 35, rect), false);
  assert.equal(pointInsideRect("10", 35, rect), false);
  assert.equal(pointInsideRect(10, Number.NaN, rect), false);
  assert.equal(pointInsideRect(10, 35, null), false);
});

test("snapToHalfGridTrack rounds finite values to the nearest half track", () => {
  assert.equal(snapToHalfGridTrack(1.24), 1);
  assert.equal(snapToHalfGridTrack(1.25), 1.5);
  assert.equal(snapToHalfGridTrack("2.74"), 2.5);
  assert.equal(snapToHalfGridTrack(null), 0);
  assert.equal(snapToHalfGridTrack("bad"), 0);
});

test("browser API resolvers prefer injected APIs and preserve global fallbacks", () => {
  const previousWindow = globalThis.window;
  const injectedTarget = { addEventListener() {} };
  const injectedTimers = {
    setTimeout() {
      return 1;
    },
    clearTimeout() {}
  };
  globalThis.window = {
    addEventListener() {},
    setTimeout() {
      return 2;
    },
    clearTimeout() {}
  };

  try {
    assert.equal(resolveBrowserEventTarget(injectedTarget), injectedTarget);
    assert.equal(resolveBrowserEventTarget(), globalThis.window);

    const timers = resolveBrowserTimerApi(injectedTimers);
    assert.equal(timers.setTimeout(), 1);
    assert.equal(typeof timers.clearTimeout, "function");

    const globalTimers = resolveBrowserTimerApi();
    assert.equal(globalTimers.setTimeout(), 2);
    assert.equal(typeof globalTimers.clearTimeout, "function");
  } finally {
    if (typeof previousWindow === "undefined") {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("object utilities preserve plain-object and safe own-property semantics", () => {
  assert.equal(isPlainObject({ ok: true }), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(null), false);
  assert.equal(hasOwn({ ok: false }, "ok"), true);
  assert.equal(hasOwn(null, "ok"), false);
});

test("Flex auth helpers preserve auth-required and login URL semantics", () => {
  const error = createFlexAuthRequiredError("  login needed  ");
  assert.equal(error.message, "login needed");
  assert.equal(error.code, FLEX_AUTH_REQUIRED_CODE);
  assert.equal(isFlexAuthRequiredError(error), true);
  assert.equal(isFlexAuthRequiredError({ code: "other" }), false);
  assert.equal(isFlexLoginUrl("https://flex.team/auth/login"), true);
  assert.equal(isFlexLoginUrl("https://flex.team/home"), false);
  assert.equal(isFlexLoginUrl("/auth/login?next=/home"), true);
});

test("Flex URL helpers preserve home matching and auth-flow semantics", () => {
  const targetUrl = parseFlexHomeTargetUrl("https://flex.team/home?team=core#ignore");
  assert.equal(targetUrl.toString(), "https://flex.team/home?team=core");
  assert.equal(isMatchingFlexHomeTabUrl("https://flex.team/home/dashboard", targetUrl), true);
  assert.equal(isMatchingFlexHomeTabUrl("https://example.com/home", targetUrl), false);
  assert.equal(isMatchingFlexLoginTabUrl("https://flex.team/auth/login", targetUrl), true);
  assert.equal(isLikelyOngoingFlexAuthFlowUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=x", targetUrl), true);
  assert.throws(() => parseFlexHomeTargetUrl("http://flex.team/home"), /must use https/);
});

test("layout-primitives clamp delegates to core utils number module", () => {
  assert.equal(layoutClamp(12, 2, 8), 8);
  assert.equal(layoutClamp(6, 2, 8), 6);
});

test("core style and layout modules share number utilities for rounded clamps", async () => {
  const moduleUrls = [
    new URL("../core/layout-primitives.js", import.meta.url),
    new URL("../core/widget-common-style.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.doesNotMatch(source, /^function clamp\(/m, moduleUrl.pathname);
    assert.doesNotMatch(
      source,
      /const num = Number\(value\);\s*if \(!Number\.isFinite\(num\)\) \{\s*return clamp\(Math\.round\(fallback\),/m,
      moduleUrl.pathname
    );
  }
});

test("widget common style shares number clamp helpers", async () => {
  const source = await fs.readFile(new URL("../core/widget-common-style.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /clampNumberOrFallback/);
  assert.doesNotMatch(source, /const num = Number\(value\)/);
  assert.doesNotMatch(source, /Number\(fallback\) \|\| 1/);
});

test("widget common style centralizes backdrop overlay opacity normalization", async () => {
  const source = await fs.readFile(new URL("../core/widget-common-style.js", import.meta.url), "utf8");
  assert.match(source, /normalizeBackdropOverlayOpacity/);
  assert.match(source, /clampTruthyNumberOrFallback/);
  assert.doesNotMatch(source, /Number\(ui\?\.background\?\.overlayOpacity\) \|\| 0\.24/);
});

test("background overlay opacity uses shared truthy clamp semantics", async () => {
  const moduleUrls = [
    new URL("../core/background-runtime.js", import.meta.url),
    new URL("../core/background-patch.js", import.meta.url),
    new URL("../core/hydrate-state.js", import.meta.url),
    new URL("../core/widget-common-style.js", import.meta.url),
    new URL("../widgets/label.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.doesNotMatch(source, /Number\([^)]*overlayOpacity[^)]*\) \|\| 0\.24/, moduleUrl.pathname);
  }
});

test("truthy fallback scalar clamps use the shared number helper", async () => {
  const moduleUrls = [
    new URL("../core/background-blur-runtime.js", import.meta.url),
    new URL("../core/background-patch.js", import.meta.url),
    new URL("../core/background-wallpaper-runtime.js", import.meta.url),
    new URL("../core/hydrate-state.js", import.meta.url),
    new URL("../core/profile-apply-flow.js", import.meta.url),
    new URL("../core/shortcut-icon-editor-runtime.js", import.meta.url),
    new URL("../widgets/label.js", import.meta.url)
  ];

  const localTruthyClampPattern =
    /(?:deps\.)?clamp\(Number\([^)]*(?:blurAmount|fontScale|fontSize|fontWeight|iconSizePercent|rotateMinutes|scale|textSize)[^)]*\) \|\| (?:0|1|15|36|58|100|700),/;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /clampTruthyNumberOrFallback/, moduleUrl.pathname);
    assert.doesNotMatch(source, localTruthyClampPattern, moduleUrl.pathname);
  }
});

test("background video cache uses shared keep-count clamp", async () => {
  const source = await fs.readFile(new URL("../core/background-video-cache-runtime.js", import.meta.url), "utf8");
  assert.match(source, /clampTruthyNumberOrFallback\(keepCount, deps\.videoCacheMaxEntries, 1, 24\)/);
  assert.doesNotMatch(source, /deps\.clamp\(Number\(keepCount\) \|\| deps\.videoCacheMaxEntries, 1, 24\)/);
});

test("state timestamp fields use shared non-negative number normalization", async () => {
  const moduleUrls = [
    new URL("../core/hydrate-state.js", import.meta.url),
    new URL("../core/history-snapshot-materialize.js", import.meta.url),
    new URL("../core/reset-state-preservation.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /toNonNegativeNumberOrFallback/, moduleUrl.pathname);
    assert.doesNotMatch(
      source,
      /Math\.max\(0, Number\([^)]*(?:defaultProfileUpdatedAt|lastUserMutationAt|videoCacheStoredAt|wallpaperCachedAt)[^)]*\) \|\| 0\)/,
      moduleUrl.pathname
    );
  }
});

test("hydrate preset timestamp fallbacks use shared truthy number normalization", async () => {
  const source = await fs.readFile(new URL("../core/hydrate-state.js", import.meta.url), "utf8");
  assert.match(source, /createdAt: toTruthyNumberOrFallback\(preset\.createdAt, Date\.now\)/);
  assert.match(source, /updatedAt: toTruthyNumberOrFallback\(preset\.updatedAt, Date\.now\)/);
  assert.doesNotMatch(source, /(?:createdAt|updatedAt): Number\(preset\.(?:createdAt|updatedAt)\) \|\| Date\.now\(\)/);
});

test("geometry edge gaps use shared non-negative number normalization", async () => {
  const moduleUrls = [
    new URL("../core/dock-geometry.js", import.meta.url),
    new URL("../core/drag-page-switch.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /toNonNegativeNumberOrFallback/, moduleUrl.pathname);
    assert.doesNotMatch(
      source,
      /Math\.max\(0, Number\([^)]*(?:gap|threshold)[^)]*\) \|\| 0\)/,
      moduleUrl.pathname
    );
  }
});

test("dock geometry uses shared truthy clamp normalization for unit size", async () => {
  const source = await fs.readFile(new URL("../core/dock-geometry.js", import.meta.url), "utf8");
  assert.match(source, /clampTruthyNumberOrFallback\(unitSize, 44, 1, Number\.POSITIVE_INFINITY\)/);
  assert.doesNotMatch(source, /Math\.max\(1, Number\(unitSize\) \|\| 44\)/);
});

test("container order runtime uses shared rounded truthy clamp normalization", async () => {
  const source = await fs.readFile(new URL("../core/container-order-runtime.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /clampRoundedTruthyNumberOrFallback/);
  assert.doesNotMatch(source, /Math\.round\(Number\((?:destinationIndex|insertIndex)\) \|\| 0\)/);
});

test("core modules use the shared text normalizer instead of local copies", async () => {
  const moduleUrls = [
    new URL("../core/background-local-media.js", import.meta.url),
    new URL("../core/container-state.js", import.meta.url),
    new URL("../core/dock-state.js", import.meta.url),
    new URL("../core/drag-preview.js", import.meta.url),
    new URL("../core/home-layout.js", import.meta.url),
    new URL("../core/settings-controls.js", import.meta.url),
    new URL("../core/settings-input-schema.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /utils\/text\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function normalizeText\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function normalizeTextFallback\(/m, moduleUrl.pathname);
  }
});

test("dock state uses the shared container membership predicate", async () => {
  const source = await fs.readFile(new URL("../core/dock-state.js", import.meta.url), "utf8");
  assert.match(source, /container-state\.js/);
  assert.match(source, /isWidgetInContainer/);
  assert.doesNotMatch(source, /^function defaultIsInContainer\(/m);
});

test("core modules use the shared finite clamp helper instead of local copies", async () => {
  const moduleUrls = [
    new URL("../core/board-grid-slot.js", import.meta.url),
    new URL("../core/board-swipe.js", import.meta.url),
    new URL("../core/dock-geometry.js", import.meta.url),
    new URL("../core/drag-positioning.js", import.meta.url),
    new URL("../core/drag-preview.js", import.meta.url),
    new URL("../core/home-layout.js", import.meta.url),
    new URL("../core/launcher-pages.js", import.meta.url),
    new URL("../core/launcher-viewport.js", import.meta.url),
    new URL("../core/resize-drag.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /utils\/number\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function clamp\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function fallbackClamp\(/m, moduleUrl.pathname);
  }
});

test("home layout uses shared truthy fallback for grid dimensions", async () => {
  const source = await fs.readFile(new URL("../core/home-layout.js", import.meta.url), "utf8");
  assert.match(source, /toTruthyNumberOrFallback\(base\.gridColumns, 4\)/);
  assert.match(source, /toTruthyNumberOrFallback\(base\.gridRows, 3\)/);
  assert.doesNotMatch(source, /Number\(base\.grid(?:Columns|Rows)\) \|\| [43]/);
});

test("core drag and resize modules use the shared finite number helper", async () => {
  const moduleUrls = [
    new URL("../core/board-swipe.js", import.meta.url),
    new URL("../core/drag-drop-evaluation.js", import.meta.url),
    new URL("../core/drag-positioning.js", import.meta.url),
    new URL("../core/drag-preview.js", import.meta.url),
    new URL("../core/resize-drag.js", import.meta.url),
    new URL("../core/resize-session.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /toFiniteNumber/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function toFinite(Number)?\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /Number\.isFinite\(Number\(/, moduleUrl.pathname);
  }
});

test("board swipe uses shared finite number normalization for deltas", async () => {
  const source = await fs.readFile(new URL("../core/board-swipe.js", import.meta.url), "utf8");
  assert.match(source, /toFiniteNumber\(dx, 0\)/);
  assert.match(source, /toFiniteNumber\(dy, 0\)/);
  assert.match(source, /toFiniteNumber\(velocity, 0\)/);
  assert.doesNotMatch(source, /Number\((?:dx|dy|velocity)\) \|\| 0/);
});

test("board swipe session uses shared truthy timestamp fallback", async () => {
  const source = await fs.readFile(new URL("../core/board-swipe-session.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /toTruthyNumberOrFallback\(performanceNow\?\.\(\), Date\.now\)/);
  assert.doesNotMatch(source, /Number\(performanceNow\?\.\(\)\) \|\| Date\.now\(\)/);
});

test("board wheel navigation uses shared number normalization", async () => {
  const source = await fs.readFile(new URL("../core/board-wheel-navigation.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /toFiniteNumber\(event\?\.deltaX, 0\)/);
  assert.match(source, /toTruthyNumberOrFallback\(nowMs\?\.\(\), Date\.now\)/);
  assert.doesNotMatch(source, /Number\((?:event\?\.deltaX|event\?\.deltaY|nowMs\?\.\(\)|boardWheelState\.(?:cooldownUntil|lastEventAt))\) \|\|/);
});

test("widget card drag session shares finite clamp fallback", async () => {
  const source = await fs.readFile(new URL("../core/widget-card-drag-session.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /clampFiniteOrMin/);
  assert.doesNotMatch(source, /const numeric = Number\(value\)/);
  assert.doesNotMatch(source, /Number\.isFinite\(numeric\) \? numeric : min/);
  assert.doesNotMatch(source, /Math\.min\(max, Math\.max\(min, safeValue\)\)/);
});

test("widget card drag session uses shared truthy timestamp fallback", async () => {
  const source = await fs.readFile(new URL("../core/widget-card-drag-session.js", import.meta.url), "utf8");
  assert.match(source, /toTruthyNumberOrFallback\(performanceNow\?\.\(\), Date\.now\)/);
  assert.doesNotMatch(source, /Number\(performanceNow\?\.\(\)\) \|\| Date\.now\(\)/);
});

test("widget card drag session normalizes grid metrics once with shared helpers", async () => {
  const source = await fs.readFile(new URL("../core/widget-card-drag-session.js", import.meta.url), "utf8");
  assert.match(source, /toFiniteNumber\(metrics\?\.cellW, 0\)/);
  assert.match(source, /toFiniteNumber\(metrics\?\.marginX, 0\)/);
  assert.doesNotMatch(source, /Number\(metrics\?\.(?:cellW|cellH|gapX|gapY|marginX|marginY|cols|rows)\) \|\| 0/);
});

test("core modules use shared integer helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../core/board-grid-slot.js", import.meta.url),
    new URL("../core/default-widget-order.js", import.meta.url),
    new URL("../core/dock-geometry.js", import.meta.url),
    new URL("../core/dock-state.js", import.meta.url),
    new URL("../core/drag-page-switch.js", import.meta.url),
    new URL("../core/drag-drop-evaluation.js", import.meta.url),
    new URL("../core/drag-drop-orchestration.js", import.meta.url),
    new URL("../core/widget-card-drag-session.js", import.meta.url),
    new URL("../core/launcher-page-affordances.js", import.meta.url),
    new URL("../core/launcher-page-runtime.js", import.meta.url),
    new URL("../core/launcher-pages.js", import.meta.url),
    new URL("../core/launcher-viewport.js", import.meta.url),
    new URL("../core/launcherDropPlan.js", import.meta.url),
    new URL("../core/widget-drop-plan-apply.js", import.meta.url),
    new URL("../core/widget-state-runtime.js", import.meta.url),
    new URL("../core/widget-modal-fields.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /utils\/number\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function (toInteger|normalizeInteger|toPositiveInteger)\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function normalizeHoldMs\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function clampSpan\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /Math\.floor\(Number/, moduleUrl.pathname);
    assert.doesNotMatch(source, /Math\.floor\((page|rawPage)\)/, moduleUrl.pathname);
    assert.doesNotMatch(source, /Number\.isFinite\(Number\(/, moduleUrl.pathname);
    assert.doesNotMatch(source, /const page = Number\(internalPlaceholderPage\)/, moduleUrl.pathname);
    assert.doesNotMatch(source, /toInteger as normalizeInteger/, moduleUrl.pathname);
  }
});

test("default widget order uses shared truthy fallback for grid dimensions", async () => {
  const source = await fs.readFile(new URL("../core/default-widget-order.js", import.meta.url), "utf8");
  assert.match(source, /toTruthyNumberOrFallback\(columns, FALLBACK_DEFAULT_GRID\.columns\)/);
  assert.match(source, /toTruthyNumberOrFallback\(rows, FALLBACK_DEFAULT_GRID\.rows\)/);
  assert.doesNotMatch(source, /toPositiveInteger\(Number\((?:columns|rows)\) \|\| FALLBACK_DEFAULT_GRID\.(?:columns|rows)/);
});

test("alarm dispatcher uses native finite timestamp checks directly", async () => {
  const source = await fs.readFile(new URL("../core/alarm/notification-dispatcher.js", import.meta.url), "utf8");
  assert.match(source, /Number\.isFinite\(value\.at\)/);
  assert.doesNotMatch(source, /^function isValidAlarmTimestamp\(/m);
});

test("core padding modules share fallback padding normalization", async () => {
  const moduleUrls = [
    new URL("../core/padding-drag.js", import.meta.url),
    new URL("../core/widget-padding-normalization.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /utils\/padding\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function resolveNormalize(Padding)?\(/m, moduleUrl.pathname);
  }
});

test("padding utility shares number clamp fallback helper", async () => {
  const source = await fs.readFile(new URL("../core/utils/padding.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js|\.\/number\.js/);
  assert.match(source, /clampNumberOrFallback/);
  assert.doesNotMatch(source, /const numeric = Number\(value\)/);
  assert.doesNotMatch(source, /Number\.isFinite\(numeric\)/);
  assert.doesNotMatch(source, /Math\.max\(0, Math\.min\(100, numeric\)\)/);
});

test("core profile utilities use shared object helpers", async () => {
  const source = await fs.readFile(new URL("../core/profile-transfer.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^function isPlainObject\(/m);
});

test("preset management uses shared truthy clamp normalization for z-index", async () => {
  const source = await fs.readFile(new URL("../core/preset-management-runtime.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /clampTruthyNumberOrFallback/);
  assert.doesNotMatch(source, /Math\.max\(1, Number\(instance\.zIndex\) \|\| 1\)/);
});

test("core modules use the shared optional function caller instead of local wrappers", async () => {
  const moduleUrls = [
    new URL("../core/board-grid-slot.js", import.meta.url),
    new URL("../core/drag-drop-orchestration.js", import.meta.url),
    new URL("../core/reset-state-preservation.js", import.meta.url),
    new URL("../core/widget-add-plan.js", import.meta.url),
    new URL("../core/widget-instance-factory.js", import.meta.url),
    new URL("../core/widget-modal-apply.js", import.meta.url),
    new URL("../core/widget-modal-apply-effects.js", import.meta.url),
    new URL("../core/widget-modal-draft.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.doesNotMatch(source, /^function (call|invoke)\(/m, moduleUrl.pathname);
  }
});

test("widget add flow uses shared z-index fallback normalization", async () => {
  const source = await fs.readFile(new URL("../core/widget-add-flow.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /toTruthyNumberOrFallback\(getZCounter\?\.\(\), 1\) \+ 1/);
  assert.doesNotMatch(source, /\(Number\(getZCounter\?\.\(\)\) \|\| 1\) \+ 1/);
});

test("widget instance factory uses shared number normalization for free placement", async () => {
  const source = await fs.readFile(new URL("../core/widget-instance-factory.js", import.meta.url), "utf8");
  assert.match(source, /clampTruthyNumberOrFallback\(defaultSize\?\.colSpan, 1, 1, Number\.POSITIVE_INFINITY\)/);
  assert.match(source, /toInteger\(boardRect\?\.width, 0\)/);
  assert.doesNotMatch(source, /Math\.max\(1, Number\(defaultSize\?\.(?:colSpan|rowSpan)\) \|\| 1\)/);
  assert.doesNotMatch(source, /Math\.floor\(Number\(boardRect\?\.(?:width|height)\) \|\| 0\)/);
});

test("widget card click behavior uses shared truthy timestamp fallback", async () => {
  const source = await fs.readFile(new URL("../core/widget-card-click-behavior.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /toTruthyNumberOrFallback\(lastDragEndAt, 0\)/);
  assert.doesNotMatch(source, /Number\(lastDragEndAt\) \|\| 0/);
});

test("dock and container pointer hit tests share the geometry helper", async () => {
  const moduleUrls = [
    new URL("../core/dock-geometry.js", import.meta.url),
    new URL("../widgets/container.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /utils\/geometry\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function pointInsideRect\(/m, moduleUrl.pathname);
  }
});

test("core chrome modules use the shared chrome API resolver", async () => {
  const moduleUrls = [
    new URL("../core/platform/chrome-callback.js", import.meta.url),
    new URL("../core/platform/chrome-scripting.js", import.meta.url),
    new URL("../core/platform/chrome-tabs.js", import.meta.url),
    new URL("../core/settings-input-schema.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /chrome-api\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function resolveChromeApi\(/m, moduleUrl.pathname);
  }
});

test("chrome tab readiness timeout uses shared truthy clamp", async () => {
  const source = await fs.readFile(new URL("../core/platform/chrome-tabs.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /clampTruthyNumberOrFallback\(timeoutMs, DEFAULT_READY_TIMEOUT_MS, DEFAULT_READY_TIMEOUT_FLOOR_MS, Number\.POSITIVE_INFINITY\)/);
  assert.doesNotMatch(source, /Math\.max\(DEFAULT_READY_TIMEOUT_FLOOR_MS, Number\(timeoutMs\) \|\| DEFAULT_READY_TIMEOUT_MS\)/);
});

test("core drag modules use shared browser and grid helpers instead of local copies", async () => {
  const browserApiModuleUrls = [
    new URL("../core/drag-page-switch.js", import.meta.url),
    new URL("../core/long-press-drag.js", import.meta.url),
    new URL("../core/resize-session.js", import.meta.url)
  ];
  const gridModuleUrls = [
    new URL("../core/widget-card-drag-session.js", import.meta.url),
    new URL("../core/widget-drop-projection.js", import.meta.url)
  ];

  for (const moduleUrl of browserApiModuleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /browser-api\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function resolve(EventTarget|TimerApi)\(/m, moduleUrl.pathname);
  }

  for (const moduleUrl of gridModuleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /utils\/grid\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function snapToHalfGridTrack\(/m, moduleUrl.pathname);
  }
});

test("widget drop projection uses shared truthy size clamps", async () => {
  const source = await fs.readFile(new URL("../core/widget-drop-projection.js", import.meta.url), "utf8");
  assert.match(source, /clampTruthyNumberOrFallback\(instance\.layout\.w, 320, 80, maxW\)/);
  assert.match(source, /clampTruthyNumberOrFallback\(instance\.layout\.h, 220, 80, maxH\)/);
  assert.doesNotMatch(source, /deps\.clamp\(Number\(instance\.layout\.(?:w|h)\) \|\|/);
});

test("grid and layout primitives share half-track snapping", async () => {
  const gridSource = await fs.readFile(new URL("../core/utils/grid.js", import.meta.url), "utf8");
  assert.match(gridSource, /utils\/number\.js|\.\/number\.js/);
  assert.match(gridSource, /toFiniteNumber/);
  assert.doesNotMatch(gridSource, /const numeric = Number\(value\)/);
  assert.doesNotMatch(gridSource, /Number\.isFinite\(numeric\)/);

  const layoutSource = await fs.readFile(new URL("../core/layout-primitives.js", import.meta.url), "utf8");
  assert.match(layoutSource, /utils\/grid\.js/);
  assert.match(layoutSource, /snapToHalfGridTrack/);
  assert.doesNotMatch(layoutSource, /GRID_TRACK_POSITION_STEP/);
  assert.doesNotMatch(layoutSource, /Number\.isFinite\(numeric\) \? numeric/);
});

test("layout primitives use shared truthy fallback for grid layout fallbacks", async () => {
  const source = await fs.readFile(new URL("../core/layout-primitives.js", import.meta.url), "utf8");
  assert.match(source, /toTruthyNumberOrFallback\(fallback\?\.col, 0\)/);
  assert.match(source, /toTruthyNumberOrFallback\(fallback\?\.row, 0\)/);
  assert.match(source, /toTruthyNumberOrFallback\(fallback\?\.colSpan, 1\)/);
  assert.match(source, /toTruthyNumberOrFallback\(fallback\?\.rowSpan, 1\)/);
  assert.doesNotMatch(source, /Number\(fallback\?\.(?:col|row|colSpan|rowSpan)\) \|\| [01]/);
});

test("drop guide runtime uses shared number helpers for board slot rectangles", async () => {
  const source = await fs.readFile(new URL("../core/drop-guide-runtime.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /clampRoundedTruthyNumberOrFallback\(layout\.w, 1, 1, Number\.POSITIVE_INFINITY\)/);
  assert.match(source, /clampRoundedTruthyNumberOrFallback\(insertIndex, 0, 0, siblingIds\.length\)/);
  assert.match(source, /clampRoundedTruthyNumberOrFallback\(span\.cols, 1, 1, cols\)/);
  assert.match(source, /toTruthyNumberOrFallback\(draggedInstance\.layout\?\.x, 0\)/);
  assert.doesNotMatch(source, /Number\((?:layout|draggedInstance\.layout\?)\.[xywh]\) \|\|/);
  assert.doesNotMatch(source, /Math\.round\(Number\(insertIndex\) \|\| 0\)/);
  assert.doesNotMatch(source, /Math\.round\(span\.(?:cols|rows) \|\| 1\)/);
});

test("drag layering uses shared number helpers for z-index normalization", async () => {
  const source = await fs.readFile(new URL("../core/drag-layering.js", import.meta.url), "utf8");
  assert.match(source, /utils\/number\.js/);
  assert.match(source, /roundFiniteOrFallback/);
  assert.match(source, /normalizeIntegerInRange/);
  assert.doesNotMatch(source, /const numeric = Number\((value|cardZIndex)\)/);
  assert.doesNotMatch(source, /Number\.isFinite\(numeric\)/);
});

async function collectWidgetSources(dirUrl) {
  const entries = await fs.readdir(dirUrl, { withFileTypes: true });
  const sources = [];
  for (const entry of entries) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);
    if (entry.isDirectory()) {
      sources.push(...await collectWidgetSources(childUrl));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      sources.push({
        name: childUrl.pathname,
        text: await fs.readFile(childUrl, "utf8")
      });
    }
  }
  return sources;
}

test("widgets use shared core utility functions instead of local copies", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  for (const source of sources) {
    assert.doesNotMatch(source.text, /^function clamp\(/m, source.name);
    assert.doesNotMatch(source.text, /^function normalizeText\(/m, source.name);
  }

  const clampSharedWidgetSources = sources.filter((source) =>
    /\/widgets\/(?:bookmarks|clock|shortcut)\.js$/.test(source.name)
  );
  for (const source of clampSharedWidgetSources) {
    assert.match(source.text, /utils\/number\.js/, source.name);
    assert.match(source.text, /toFiniteNumber/, source.name);
    assert.doesNotMatch(source.text, /Math\.min\([^;\n]*Math\.max\(/, source.name);
    assert.doesNotMatch(source.text, /Number\.isFinite\(Number\(/, source.name);
  }
});

test("widgets keep only domain-specific local error normalizers", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  const localErrorNormalizers = sources
    .filter((source) => /^function normalizeErrorMessage\(/m.test(source.text))
    .map((source) => source.name.replace(/^.*\/widgets\//, "widgets/"));

  assert.deepEqual(localErrorNormalizers, ["widgets/rss.js"]);
});

test("widgets use shared JSON parsing instead of local copies", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  const localJsonParsers = sources
    .filter((source) => /^function (tryParseJson|parseJsonSafely)\(/m.test(source.text))
    .map((source) => source.name.replace(/^.*\/widgets\//, "widgets/"));

  assert.deepEqual(localJsonParsers, []);

  const authConnectorSource = sources.find((source) => /\/widgets\/shared\/authConnector\.js$/.test(source.name));
  assert.ok(authConnectorSource);
  assert.match(authConnectorSource.text, /utils\/json\.js/, authConnectorSource.name);
});

test("widgets use shared color primitives instead of local copies", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  const localColorHelpers = sources
    .filter((source) => /^function (normalizeHex|hexToRgb|srgbToLinear|luminance)\(/m.test(source.text))
    .map((source) => source.name.replace(/^.*\/widgets\//, "widgets/"));

  assert.deepEqual(localColorHelpers, []);

  const labelSource = sources.find((source) => /\/widgets\/label\.js$/.test(source.name));
  assert.ok(labelSource);
  assert.match(labelSource.text, /widget-common-style\.js/, labelSource.name);
  assert.match(labelSource.text, /luminanceFromHex/, labelSource.name);
  assert.match(labelSource.text, /normalizeHexColor/, labelSource.name);
});

test("widgets use shared title alignment normalization instead of local copies", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  const alignedSources = sources.filter((source) =>
    /\/widgets\/(?:clock|container|label)\.js$/.test(source.name)
  );

  for (const source of alignedSources) {
    assert.match(source.text, /widget-common-style\.js/, source.name);
    assert.match(source.text, /normalizeTitleAlign/, source.name);
    assert.doesNotMatch(source.text, /^function normalizeTitleAlign\(/m, source.name);
    assert.doesNotMatch(source.text, /\["left", "center", "right"\]\.includes/, source.name);
    assert.doesNotMatch(source.text, /textAlign === "left" \|\| .*textAlign === "right"/, source.name);
  }
});

test("widgets use the shared integer range normalizer for rounded clamps", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  for (const source of sources) {
    assert.doesNotMatch(
      source.text,
      /const num = Number\(value\);\s*if \(!Number\.isFinite\(num\)\) \{\s*return clamp\(Math\.round\(fallback\),/m,
      source.name
    );
  }

  const containerSource = sources.find((source) => /\/widgets\/container\.js$/.test(source.name));
  assert.ok(containerSource);
  assert.match(containerSource.text, /normalizeIntegerInRange/, containerSource.name);
  assert.match(containerSource.text, /widget-common-style\.js/, containerSource.name);
  assert.match(containerSource.text, /clampRoundedTruthyNumberOrFallback/, containerSource.name);
  assert.doesNotMatch(containerSource.text, /^function normalizeCount\(/m, containerSource.name);
  assert.doesNotMatch(containerSource.text, /^function normalizeTitleAlign\(/m, containerSource.name);
  assert.doesNotMatch(
    containerSource.text,
    /clamp\(Math\.round\(Number\(widget\?\.(?:contentPadding|edgeRoundness)/,
    containerSource.name
  );
  assert.doesNotMatch(containerSource.text, /clamp\(Number\(widget\?\.transparency\) \|\| 0\.94/, containerSource.name);
});

test("widgets keep only blank-aware local finite number normalization", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  const localFiniteNormalizers = sources
    .filter((source) => /^function asFiniteNumber\(/m.test(source.text))
    .map((source) => source.name.replace(/^.*\/widgets\//, "widgets/"));

  assert.deepEqual(localFiniteNormalizers, ["widgets/weather.js"]);
});

test("widgets use shared object helpers instead of local copies", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  for (const source of sources) {
    assert.doesNotMatch(source.text, /^function isPlainObject\(/m, source.name);
    assert.doesNotMatch(source.text, /^function hasOwn\(/m, source.name);
  }

  const flexSources = sources.filter((source) =>
    /\/widgets\/flexWorktime(?:Timeline)?\.js$/.test(source.name)
  );
  for (const source of flexSources) {
    assert.doesNotMatch(source.text, /Object\.prototype\.hasOwnProperty\.call/, source.name);
  }
});

test("Flex worktime widgets share row helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/flexWorktime.js", import.meta.url),
    new URL("../widgets/flexWorktimeTimeline.js", import.meta.url)
  ];
  const localHelperPattern =
    /^function (applyTemplate|formatDurationMinutes|formatSyncedLabel|formatTimeFromRef|normalizeCachedRow|normalizeFlexHomeScrapeRow|normalizeTabId|normalizeWorktimeRow|resolveDetailUrl|resolvePathValue|sanitizePlaceholderMap|toCachedRow)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/flexWorktimeRows\.js/, moduleUrl.pathname);
    assert.match(source, /normalizeFlexWidgetBaseConfig/, moduleUrl.pathname);
    assert.doesNotMatch(source, localHelperPattern, moduleUrl.pathname);
    assert.doesNotMatch(source, /normalizeFlexHomeUrl,\n|normalizeFlexRefreshMinutes/, moduleUrl.pathname);
  }
});

test("Flex shared row helpers use core integer primitives", async () => {
  const source = await fs.readFile(new URL("../widgets/shared/flexWorktimeRows.js", import.meta.url), "utf8");
  assert.match(source, /core\/utils\/number\.js/);
  assert.doesNotMatch(source, /Math\.floor\(Number/, "flexWorktimeRows.js");
  assert.doesNotMatch(source, /Number\.isFinite\(Number\(/, "flexWorktimeRows.js");
  assert.doesNotMatch(source, /Number\(totalMinutes\) \|\| 0/, "flexWorktimeRows.js");
  assert.doesNotMatch(source, /Number\(scraped\?\.extractedAt\) \|\| Date\.now\(\)/, "flexWorktimeRows.js");
});

test("Flex worktime widgets share auth helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/flexWorktime.js", import.meta.url),
    new URL("../widgets/flexWorktimeTimeline.js", import.meta.url)
  ];
  const localAuthPattern =
    /^(const FLEX_AUTH_(?:REQUIRED_CODE|LOGIN_PATH_RE|LOGIN_FALLBACK_RE|FLOW_PENDING_MESSAGE)|function (?:createFlexAuthRequiredError|isFlexAuthRequiredError|isFlexLoginUrl)\()/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/flexAuth\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, localAuthPattern, moduleUrl.pathname);
  }
});

test("Flex worktime widgets share URL helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/flexWorktime.js", import.meta.url),
    new URL("../widgets/flexWorktimeTimeline.js", import.meta.url)
  ];
  const localUrlPattern =
    /^function (areEquivalentFlexHosts|comparablePath|hasAuthQueryMarkers|isAllowedFlexHomeHost|isAllowedFlexHomePath|isAllowedFlexLoginPath|isLikelyExternalAuthFlowUrl|isLikelyOngoingFlexAuthFlowUrl|isLikelySameHostFlexAuthProgressUrl|isMatchingFlexHomeTabUrl|isMatchingFlexLoginTabUrl|parseAllowedFlexTabUrl|parseFlexHomeTargetUrl)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/flexUrls\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, localUrlPattern, moduleUrl.pathname);
  }
});

test("Flex worktime widgets share tab priority helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/flexWorktime.js", import.meta.url),
    new URL("../widgets/flexWorktimeTimeline.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/flexTabs\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function findPreferredFlexTab\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /queryTabs\(\{ active: true, currentWindow: true \}\)/, moduleUrl.pathname);
  }
});

test("Flex worktime widgets share the Flex Home scrape extractor", async () => {
  const moduleUrls = [
    new URL("../widgets/flexWorktime.js", import.meta.url),
    new URL("../widgets/flexWorktimeTimeline.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/flexHomeScrape\.js/, moduleUrl.pathname);
    assert.match(source, /assertFlexScrapeApisAvailable/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function ensureFlexHomeScrapeApis\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /^async function extractFlexHomeWorktimeFromTab\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function executeScriptInTab\(/m, moduleUrl.pathname);
    assert.doesNotMatch(source, /hasTabsApi\(\) \|\| !hasScriptingApi\(\)/, moduleUrl.pathname);
  }
});

test("Flex worktime widgets share cache helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/flexWorktime.js", import.meta.url),
    new URL("../widgets/flexWorktimeTimeline.js", import.meta.url)
  ];
  const localCachePattern =
    /^function (flexWorktimeCacheStorageKey|pruneCacheEntries|readCachedSnapshot|requestSignature|writeCachedSnapshot)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/flexWorktimeCache\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /shared\/localStorageCacheIndex\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, localCachePattern, moduleUrl.pathname);
  }
});

test("Flex worktime cache uses core number helpers", async () => {
  const source = await fs.readFile(new URL("../widgets/shared/flexWorktimeCache.js", import.meta.url), "utf8");
  assert.match(source, /core\/utils\/number\.js/);
  assert.doesNotMatch(source, /Number\(value\) \|\| 1/, "flexWorktimeCache.js");
  assert.doesNotMatch(source, /Number\(fetchedAt\) \|\| Date\.now\(\)/, "flexWorktimeCache.js");
});

test("local storage cache index uses core integer helpers", async () => {
  const source = await fs.readFile(new URL("../widgets/shared/localStorageCacheIndex.js", import.meta.url), "utf8");
  assert.match(source, /core\/utils\/number\.js/);
  assert.doesNotMatch(source, /Math\.floor\(Number/, "localStorageCacheIndex.js");
  assert.doesNotMatch(source, /Number\.isFinite\(Number\(/, "localStorageCacheIndex.js");
  assert.doesNotMatch(source, /Number\(options\.maxEntries\)/, "localStorageCacheIndex.js");
});

test("GitHub widgets share repository and API helpers", async () => {
  const moduleUrls = [
    new URL("../widgets/githubPrList.js", import.meta.url),
    new URL("../widgets/githubReviewInbox.js", import.meta.url)
  ];
  const localGitHubPattern =
    /^function (buildApiHeaders|buildRepoPullsPageUrl|formatRelativeTimestamp|formatSyncedLabel|formatUpdatedLabelFromTimestamp|isRepoSegment|normalizeMaxItems|normalizeRefreshMinutes|normalizeRepository|normalizeReviewerNames|parseGitHubError|repositoryParts|tokenFingerprint)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/githubApi\.js/, moduleUrl.pathname);
    assert.match(source, /buildGitHubRepoApiUrl/, moduleUrl.pathname);
    assert.match(source, /parseGitHubJsonResponse/, moduleUrl.pathname);
    assert.match(source, /normalizeGitHubCache(Number|Count)/, moduleUrl.pathname);
    assert.match(source, /normalizeGitHubCacheTimestamp/, moduleUrl.pathname);
    assert.doesNotMatch(source, localGitHubPattern, moduleUrl.pathname);
    assert.doesNotMatch(source, /JSON\.parse/, moduleUrl.pathname);
    assert.doesNotMatch(source, /new URLSearchParams\(/, moduleUrl.pathname);
    assert.doesNotMatch(source, /\/repos\/\$\{/, moduleUrl.pathname);
    assert.doesNotMatch(source, /githubRepositoryParts as repositoryParts/, moduleUrl.pathname);
    assert.doesNotMatch(source, /Math\.floor\(Number\(entry\?\.teamCount\)/, moduleUrl.pathname);
    assert.doesNotMatch(source, /Number\(rawConfig\?\.cacheAt\) \|\| 0/, moduleUrl.pathname);
    assert.doesNotMatch(source, /Number\(pull\?\.number\) \|\| 0/, moduleUrl.pathname);
    assert.doesNotMatch(source, /Math\.max\(0, normalizeCacheNumber\(/, moduleUrl.pathname);
  }
});

test("GitHub review inbox logic uses shared cache timestamp normalization", async () => {
  const source = await fs.readFile(new URL("../widgets/shared/githubReviewInboxLogic.js", import.meta.url), "utf8");
  assert.match(source, /shared\/githubApi\.js|\.\/githubApi\.js/);
  assert.match(source, /normalizeGitHubCacheTimestamp/);
  assert.doesNotMatch(source, /Math\.max\(0, Number\(latestAttentionAt \?\? latestCodeUpdateAt\) \|\| 0\)/);
});

test("Codex usage widget uses core number helpers", async () => {
  const source = await fs.readFile(new URL("../widgets/codexUsage.js", import.meta.url), "utf8");
  assert.match(source, /core\/utils\/number\.js/);
  assert.match(source, /toFiniteNumber/);
  assert.doesNotMatch(source, /const capturedAt = Number\(raw\.capturedAt\)/);
  assert.doesNotMatch(source, /Number\(raw\.parserVersion\) \|\| 1/);
  assert.doesNotMatch(source, /new Date\(Number\(capturedAt\) \|\| Date\.now\(\)\)/);
});

test("Monday widgets share auto-refresh slot primitives", async () => {
  const moduleUrls = [
    new URL("../widgets/mondayAssigned.js", import.meta.url),
    new URL("../widgets/mondayMeetingNote.js", import.meta.url)
  ];
  const localSlotPattern =
    /^function (dateAtMinute|parseAutoSlotsDone|serializeAutoSlotsDone|toLocalDayKey|updateDoneSlotsForToday)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/autoRefreshSlots\.js/, moduleUrl.pathname);
    assert.match(source, /dueAutoRefreshSlotIndices/, moduleUrl.pathname);
    assert.match(source, /nextAutoRefreshSlot/, moduleUrl.pathname);
    assert.doesNotMatch(source, localSlotPattern, moduleUrl.pathname);
    assert.doesNotMatch(source, /autoRefreshDoneSetForDay\(config, dayKey, .*\.length\)/, moduleUrl.pathname);
  }
});

test("auto refresh slot primitives use core integer helpers", async () => {
  const source = await fs.readFile(new URL("../widgets/shared/autoRefreshSlots.js", import.meta.url), "utf8");
  assert.match(source, /core\/utils\/number\.js/);
  assert.doesNotMatch(source, /Math\.floor\(Number/, "autoRefreshSlots.js");
  assert.doesNotMatch(source, /Number\.isFinite\(Number\(/, "autoRefreshSlots.js");
});

test("Monday widgets share config predicates instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/mondayAssigned.js", import.meta.url),
    new URL("../widgets/mondayMeetingNote.js", import.meta.url)
  ];
  const localConfigPredicatePattern = /^function (hasBoardConfig|hasConnectorConfig)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/mondayConfig\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, localConfigPredicatePattern, moduleUrl.pathname);
  }
});

test("Monday shared config uses core number helpers", async () => {
  const source = await fs.readFile(new URL("../widgets/shared/mondayConfig.js", import.meta.url), "utf8");
  assert.match(source, /core\/utils\/number\.js/);
  assert.match(source, /normalizeMondayCacheNumber/, "mondayConfig.js");
  assert.match(source, /normalizeMondayCacheTimestamp/, "mondayConfig.js");
  assert.doesNotMatch(source, /Math\.floor\(Number/, "mondayConfig.js");
  assert.doesNotMatch(source, /Number\.isFinite\(Number\(/, "mondayConfig.js");
});

test("Monday widgets share cached board base normalization", async () => {
  const moduleUrls = [
    new URL("../widgets/mondayAssigned.js", import.meta.url),
    new URL("../widgets/mondayMeetingNote.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    const cachedSnapshotBlock = source.match(
      /function normalizeCachedBoardSnapshot\([\s\S]*?\n}\n\nfunction readCachedSnapshot/
    )?.[0] || "";
    assert.match(source, /normalizeCachedMondayBoardBase/, moduleUrl.pathname);
    assert.match(source, /normalizeMondayCacheTimestamp/, moduleUrl.pathname);
    assert.doesNotMatch(source, /Number\(rawConfig\?\.cacheAt\) \|\| 0/, moduleUrl.pathname);
    assert.doesNotMatch(
      cachedSnapshotBlock,
      /boardName:\s*normalizeText\(entry\?\.boardName,\s*`Board \$\{boardId\}`\)/,
      moduleUrl.pathname
    );
  }
});

test("Monday meeting notes reuse the shared safe URL parser", async () => {
  const source = await fs.readFile(new URL("../widgets/mondayMeetingNote.js", import.meta.url), "utf8");
  assert.match(source, /parseUrlSafely,\s*\n\s*resolveMondaySiteUrl/s);
  assert.doesNotMatch(source, /^function parseUrlSafely\(/m);
});

test("account auth widgets share local connector auth helpers", async () => {
  const moduleUrls = [
    new URL("../widgets/aiChat.js", import.meta.url),
    new URL("../widgets/mondayAssigned.js", import.meta.url),
    new URL("../widgets/mondayMeetingNote.js", import.meta.url)
  ];
  const localAuthConnectorPattern =
    /^(const LOCAL_AUTH_CONNECTOR_URL|function (?:isAuthCancelledMessage|normalizeConnectorUrl|rewriteAuthorizationLoadError)\()/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/authConnector\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, localAuthConnectorPattern, moduleUrl.pathname);
  }
});

test("AI chat shares core number helpers for request payload numbers", async () => {
  const source = await fs.readFile(new URL("../widgets/aiChat.js", import.meta.url), "utf8");
  assert.match(source, /core\/utils\/number\.js/);
  assert.match(source, /normalizeAiChatTemperature/);
  assert.match(source, /toFiniteNumber/);
  assert.doesNotMatch(source, /Number\(cfg\.temperature \?\? 0\.7\)/);
  assert.doesNotMatch(source, /temperature: Number/);
});

test("feed and monday widgets share local date-time label formatting", async () => {
  const moduleUrls = [
    new URL("../widgets/gmail.js", import.meta.url),
    new URL("../widgets/rss.js", import.meta.url),
    new URL("../widgets/mondayAssigned.js", import.meta.url),
    new URL("../widgets/mondayMeetingNote.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/dateLabels\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function formatDateLabel\(/m, moduleUrl.pathname);
  }
});

test("date-driven widgets share local date key helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/calendar.js", import.meta.url),
    new URL("../widgets/todo.js", import.meta.url),
    new URL("../widgets/shared/icsParser.js", import.meta.url),
    new URL("../widgets/shared/flexWorktimeRows.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/localDates\.js|\.\/localDates\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function (formatDateKey|toLocalDateKey|addDays)\(/m, moduleUrl.pathname);
  }
});

test("Google account widgets share account index normalization", async () => {
  const moduleUrls = [
    new URL("../widgets/calendar.js", import.meta.url),
    new URL("../widgets/gmail.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/googleAccounts\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, /^function normalizeAccountIndex\(/m, moduleUrl.pathname);
  }
});

test("feed widgets share XML helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/gmail.js", import.meta.url),
    new URL("../widgets/rss.js", import.meta.url)
  ];
  const localFeedXmlPattern = /^function (atomAlternateLink|atomLink|nodeText)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/feedXml\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, localFeedXmlPattern, moduleUrl.pathname);
    assert.doesNotMatch(source, /new DOMParser\(\)/, moduleUrl.pathname);
  }
});

test("widgets share link URL helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../widgets/shortcut.js", import.meta.url),
    new URL("../widgets/bookmarks.js", import.meta.url),
    new URL("../widgets/container.js", import.meta.url),
    new URL("../widgets/rss.js", import.meta.url),
    new URL("../widgets/calendar.js", import.meta.url)
  ];
  const localLinkPattern =
    /^function (normalizeSafeUrl|normalizeSafeLink|normalizeEventLink|isUrlIcon|bookmarkFavicon)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/linkUrls\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, localLinkPattern, moduleUrl.pathname);
  }

  const calendarSource = await fs.readFile(new URL("../widgets/calendar.js", import.meta.url), "utf8");
  assert.match(calendarSource, /normalizeHttpUrl\(normalized\)/);
  assert.doesNotMatch(calendarSource, /new URL\(normalized\)/);
});
