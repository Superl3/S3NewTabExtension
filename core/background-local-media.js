import { normalizeText as defaultNormalizeText } from "./utils/text.js";

function resolveNormalizeText(normalizeText) {
  if (typeof normalizeText === "function") {
    return normalizeText;
  }
  return defaultNormalizeText;
}

export function hasLocalMediaData(background = {}, normalizeText) {
  const normalize = resolveNormalizeText(normalizeText);
  return Boolean(normalize(background.localMediaDataUrl));
}

export function resolveSelectedLocalMediaName(background = {}, normalizeText) {
  const normalize = resolveNormalizeText(normalizeText);
  return normalize(
    background.localMediaName,
    hasLocalMediaData(background, normalize) ? "Local file selected" : "No file selected"
  );
}

export function createLocalMediaClearPatch() {
  return {
    localMediaDataUrl: "",
    localMediaType: "",
    localMediaName: ""
  };
}
