import { normalizeText } from "./utils/text.js";

export function createFormRow(labelText, helpText = "") {
  const row = document.createElement("label");
  row.className = "form-row";

  const titleWrap = document.createElement("span");
  titleWrap.className = "form-row-label";

  const text = document.createElement("span");
  text.textContent = labelText;
  titleWrap.append(text);

  const help = normalizeText(helpText);
  if (help) {
    const tip = document.createElement("span");
    tip.className = "field-help";
    tip.textContent = "?";
    tip.title = help;
    tip.setAttribute("aria-label", help);
    titleWrap.append(tip);
  }

  row.append(titleWrap);
  return row;
}

export function normalizeDisplayColor(value, fallback = "#000000") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = [raw[1], raw[2], raw[3]];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback.toUpperCase();
}

export function createColorControl(value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "color-field-control";

  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.value = normalizeDisplayColor(value, "#000000");

  const code = document.createElement("code");
  code.className = "color-code";
  code.textContent = swatch.value.toUpperCase();

  const emit = () => {
    const next = normalizeDisplayColor(swatch.value, "#000000");
    swatch.value = next;
    code.textContent = next;
    onChange(next);
  };

  swatch.addEventListener("input", emit);
  swatch.addEventListener("change", emit);

  wrap.append(swatch, code);
  return wrap;
}

export function createSectionChip(text) {
  const chip = document.createElement("p");
  chip.className = "section-chip";
  chip.textContent = text;
  return chip;
}

export function isThemeFieldKey(key) {
  return (
    key === "primary" ||
    key === "accent" ||
    key === "secondary" ||
    key === "background" ||
    key === "surface" ||
    key === "text" ||
    key === "line" ||
    key === "fontFamily" ||
    key === "fontScale" ||
    key === "widgetThemeMode" ||
    key === "useCustomColors" ||
    key === "customTextColor" ||
    key === "customAccentColor" ||
    key === "customSurfaceColor"
  );
}

export function settingsEventName(schema = {}) {
  if (schema.type === "checkbox" || schema.type === "select" || schema.type === "bookmark-folder-select") {
    return "change";
  }
  if (schema.type === "color") {
    return "input";
  }
  return "change";
}
