import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const stylesPath = new URL("../styles.css", import.meta.url);

async function readStyles() {
  return fs.readFile(stylesPath, "utf8");
}

test("switch-account inline action follows normal/edit/hover/focus visibility selectors", async () => {
  const styles = await readStyles();

  assert.match(
    styles,
    /body:not\(\.mode-edit\) \.widget-inline-actions \.widget-float-auth-toggle,\s*body:not\(\.mode-edit\) \.widget-inline-actions \.widget-float-switch-account \{\s*display: none;/
  );

  assert.match(
    styles,
    /body\.mode-edit \.widget-inline-actions \.widget-float-auth-toggle,\s*body\.mode-edit \.widget-inline-actions \.widget-float-switch-account \{\s*display: none;/
  );

  assert.match(
    styles,
    /body\.mode-edit \.widget-card:hover \.widget-inline-actions \.widget-float-auth-toggle,[\s\S]*body\.mode-edit \.widget-card:hover \.widget-inline-actions \.widget-float-switch-account,[\s\S]*body\.mode-edit \.widget-card:focus-within \.widget-inline-actions \.widget-float-auth-toggle,[\s\S]*body\.mode-edit \.widget-card:focus-within \.widget-inline-actions \.widget-float-switch-account \{\s*display: inline-flex;/
  );
});

test("switch-account header and inline buttons share widget action styling selectors", async () => {
  const styles = await readStyles();

  assert.match(
    styles,
    /\.widget-auth-toggle-btn,\s*\.widget-float-auth-toggle,\s*\.widget-switch-account-btn,\s*\.widget-float-switch-account \{\s*border-color: color-mix\(in srgb, var\(--widget-effective-accent\), var\(--tone-dark\) 22%\);\s*color: var\(--widget-effective-accent\);/
  );

  assert.match(
    styles,
    /\.widget-auth-toggle-btn \.icon,\s*\.widget-float-auth-toggle \.icon,\s*\.widget-switch-account-btn \.icon,\s*\.widget-float-switch-account \.icon \{\s*stroke-width: 1\.95;/
  );
});
