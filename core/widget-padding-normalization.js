import { resolvePaddingNormalizer } from "./utils/padding.js";

export function resolveDirectionalPaddingFromDraft(draft = {}, fallback = 10, normalizePadding) {
  const normalize = resolvePaddingNormalizer(normalizePadding);
  const uniformPadding = normalize(draft.contentPadding, fallback);
  const top = normalize(draft.contentPaddingTop ?? draft.contentPaddingTopRight ?? uniformPadding, uniformPadding);
  const right = normalize(draft.contentPaddingRight ?? draft.contentPaddingTopRight ?? uniformPadding, uniformPadding);
  const bottom = normalize(draft.contentPaddingBottom ?? draft.contentPaddingBottomLeft ?? uniformPadding, uniformPadding);
  const left = normalize(draft.contentPaddingLeft ?? draft.contentPaddingBottomLeft ?? uniformPadding, uniformPadding);

  return {
    uniform: uniformPadding,
    top,
    right,
    bottom,
    left,
    topRight: normalize((top + right) / 2, uniformPadding),
    bottomLeft: normalize((bottom + left) / 2, uniformPadding),
    all: normalize((top + right + bottom + left) / 4, uniformPadding)
  };
}

export function resolveAveragePaddingValue(padding = {}, fallback = 10, normalizePadding) {
  const normalize = resolvePaddingNormalizer(normalizePadding);
  const base = normalize(padding.contentPadding, fallback);
  const top = normalize(padding.contentPaddingTop, base);
  const right = normalize(padding.contentPaddingRight, base);
  const bottom = normalize(padding.contentPaddingBottom, base);
  const left = normalize(padding.contentPaddingLeft, base);
  return normalize((top + right + bottom + left) / 4, base);
}
