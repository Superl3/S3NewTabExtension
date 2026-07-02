import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { normalizeErrorMessage } from "../core/utils/error.js";
import { callIfFunction } from "../core/utils/function.js";
import { parseJsonOrNull } from "../core/utils/json.js";
import {
  clamp,
  clampFiniteOrMin,
  normalizeIntegerInRange,
  toFiniteNumber,
  toInteger,
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

test("callIfFunction returns undefined for non-functions and forwards arguments", () => {
  assert.equal(callIfFunction(null, 1, 2), undefined);
  assert.equal(callIfFunction(function sum(left, right) {
    return left + right;
  }, 2, 3), 5);
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

test("core modules use the shared text normalizer instead of local copies", async () => {
  const moduleUrls = [
    new URL("../core/container-state.js", import.meta.url),
    new URL("../core/dock-state.js", import.meta.url),
    new URL("../core/drag-preview.js", import.meta.url),
    new URL("../core/home-layout.js", import.meta.url),
    new URL("../core/settings-controls.js", import.meta.url),
    new URL("../core/settings-input-schema.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.doesNotMatch(source, /^function normalizeText\(/m, moduleUrl.pathname);
  }
});

test("core modules use the shared finite clamp helper instead of local copies", async () => {
  const moduleUrls = [
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
    assert.doesNotMatch(source, /^function clamp\(/m, moduleUrl.pathname);
  }
});

test("core drag and resize modules use the shared finite number helper", async () => {
  const moduleUrls = [
    new URL("../core/drag-drop-evaluation.js", import.meta.url),
    new URL("../core/drag-positioning.js", import.meta.url),
    new URL("../core/resize-drag.js", import.meta.url),
    new URL("../core/resize-session.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.doesNotMatch(source, /^function toFinite(Number)?\(/m, moduleUrl.pathname);
  }
});

test("core modules use shared integer helpers instead of local copies", async () => {
  const moduleUrls = [
    new URL("../core/drag-drop-evaluation.js", import.meta.url),
    new URL("../core/drag-drop-orchestration.js", import.meta.url),
    new URL("../core/widget-card-drag-session.js", import.meta.url),
    new URL("../core/launcher-page-affordances.js", import.meta.url),
    new URL("../core/widget-modal-fields.js", import.meta.url)
  ];

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.doesNotMatch(source, /^function (toInteger|normalizeInteger|toPositiveInteger)\(/m, moduleUrl.pathname);
  }
});

test("core profile utilities use shared object helpers", async () => {
  const source = await fs.readFile(new URL("../core/profile-transfer.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^function isPlainObject\(/m);
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
});

test("widgets keep only domain-specific local error normalizers", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  const localErrorNormalizers = sources
    .filter((source) => /^function normalizeErrorMessage\(/m.test(source.text))
    .map((source) => source.name.replace(/^.*\/widgets\//, "widgets/"));

  assert.deepEqual(localErrorNormalizers, ["widgets/rss.js"]);
});

test("widgets keep only connector-specific local JSON parsers", async () => {
  const sources = await collectWidgetSources(new URL("../widgets/", import.meta.url));
  const localJsonParsers = sources
    .filter((source) => /^function (tryParseJson|parseJsonSafely)\(/m.test(source.text))
    .map((source) => source.name.replace(/^.*\/widgets\//, "widgets/"));

  assert.deepEqual(localJsonParsers, ["widgets/shared/authConnector.js"]);
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
    /^function (formatDurationMinutes|formatSyncedLabel|formatTimeFromRef|normalizeCachedRow|normalizeFlexHomeScrapeRow|normalizeTabId|normalizeWorktimeRow|sanitizePlaceholderMap|toCachedRow)\(/m;

  for (const moduleUrl of moduleUrls) {
    const source = await fs.readFile(moduleUrl, "utf8");
    assert.match(source, /shared\/flexWorktimeRows\.js/, moduleUrl.pathname);
    assert.doesNotMatch(source, localHelperPattern, moduleUrl.pathname);
  }
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
