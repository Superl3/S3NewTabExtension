import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildSmokeExtensionPackage } from "../scripts/extension-package.mjs";

test("the smoke package includes local CSS assets and excludes development and credential files", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), "s3-extension-package-"));
  try {
    buildSmokeExtensionPackage(root, packageDir);
    for (const filename of ["styles.css", "single-item-surfaces.css", "widget-drag-motion.css"]) {
      const css = fs.readFileSync(path.join(packageDir, filename), "utf8");
      for (const match of css.matchAll(/url\(["']?([^\s)"']+)["']?\)/g)) {
        if (/^(data:|https?:|#)/.test(match[1])) continue;
        assert.ok(fs.existsSync(path.join(packageDir, match[1])), `missing asset: ${match[1]}`);
      }
    }
    const font = fs.readFileSync(path.join(packageDir, "fonts/pretendard/PretendardStd-Regular.woff2"));
    assert.equal(font.subarray(0, 4).toString(), "wOF2");
    for (const excluded of [".git", ".jj", ".planning", "tests", "connector", "docs", "scripts"]) {
      assert.equal(fs.existsSync(path.join(packageDir, excluded)), false, `${excluded} must be excluded`);
    }
  } finally {
    const resolved = path.resolve(packageDir);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("s3-extension-package-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
