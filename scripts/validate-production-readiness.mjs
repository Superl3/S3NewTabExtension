import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function expect(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const packageJson = readJson("package.json");
expect(
  packageJson.scripts?.test === "node --test tests/*.test.mjs",
  "package.json must keep npm test pointed at the full node:test suite."
);
expect(
  packageJson.scripts?.["test:production"] === "node scripts/validate-production-readiness.mjs",
  "package.json must expose npm run test:production."
);
expect(
  packageJson.scripts?.["smoke:extension"] === "node scripts/smoke-extension-cdp.mjs",
  "package.json must expose npm run smoke:extension."
);

const workflow = readText(".github/workflows/tests.yml");
expect(workflow.includes("npm test"), "CI must run npm test.");
expect(workflow.includes("npm run test:production"), "CI must run npm run test:production.");

const manifest = readJson("manifest.json");
expect(manifest.manifest_version === 3, "manifest.json must remain Manifest V3.");
expect(manifest.chrome_url_overrides?.newtab === "newtab.html", "manifest must override the new tab page.");
for (const permission of ["storage", "bookmarks", "identity", "tabs", "scripting"]) {
  expect(manifest.permissions?.includes(permission), `manifest is missing required permission: ${permission}`);
}
for (const forbidden of ["<all_urls>", "http://*/*", "https://*/*", "*://*/*"]) {
  expect(!manifest.host_permissions?.includes(forbidden), `manifest must not use broad host permission ${forbidden}.`);
}
expect(
  manifest.content_scripts?.some((entry) =>
    entry.matches?.includes("https://chatgpt.com/codex/settings/usage*") &&
    entry.js?.includes("content-scripts/codexUsageScraper.js")
  ),
  "manifest must keep the Codex usage content script registered."
);

const attributes = readText(".gitattributes");
expect(attributes.includes("* text=auto eol=lf"), ".gitattributes must enforce LF text working trees.");
for (const binaryPattern of ["*.png binary", "*.woff2 binary"]) {
  expect(attributes.includes(binaryPattern), `.gitattributes must protect binary pattern: ${binaryPattern}`);
}

const testFiles = fs.readdirSync(path.join(root, "tests")).filter((name) => name.endsWith(".test.mjs"));
expect(testFiles.length >= 120, `expected at least 120 test files, found ${testFiles.length}.`);

const testingDoc = readText(".planning/codebase/TESTING.md");
for (const stalePhrase of [
  "No automated test directories",
  "no automated test harness",
  "Not detected",
  "no unit test files",
  "no test suites or CI workflows"
]) {
  expect(!testingDoc.includes(stalePhrase), `.planning/codebase/TESTING.md still contains stale phrase: ${stalePhrase}`);
}

const concernsDoc = readText(".planning/codebase/CONCERNS.md");
for (const stalePhrase of [
  "12,180-line",
  "4,878 lines",
  "wildcard host permissions",
  "No test suites or CI workflows are present"
]) {
  expect(!concernsDoc.includes(stalePhrase), `.planning/codebase/CONCERNS.md still contains stale phrase: ${stalePhrase}`);
}

const readinessDoc = readText("docs/production-readiness.md");
for (const requiredPhrase of [
  "Real Extension Smoke",
  "Account-backed widgets",
  "npm test",
  "npm run test:production",
  "npm run smoke:extension"
]) {
  expect(readinessDoc.includes(requiredPhrase), `docs/production-readiness.md must mention: ${requiredPhrase}`);
}

if (failures.length) {
  console.error("Production readiness checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Production readiness checks passed (${testFiles.length} test files guarded).`);
