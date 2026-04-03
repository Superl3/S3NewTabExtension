function resolveNormalizePadding(normalizePadding) {
  if (typeof normalizePadding === "function") {
    return normalizePadding;
  }
  return (value, fallback = 10) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(0, Math.min(100, numeric));
  };
}

export function projectContentPaddingFromDrag(
  {
    corner,
    proportional = false,
    dx = 0,
    dy = 0,
    startPadding = {},
    fallbackPadding = 10
  } = {},
  { normalizePadding } = {}
) {
  const normalize = resolveNormalizePadding(normalizePadding);
  const next = {
    top: startPadding.top,
    right: startPadding.right,
    bottom: startPadding.bottom,
    left: startPadding.left
  };

  if (corner === "topRight") {
    if (proportional) {
      const delta = (-dx + dy) / 2.5;
      next.top = normalize(startPadding.top + delta, fallbackPadding);
      next.right = normalize(startPadding.right + delta, fallbackPadding);
    } else {
      next.top = normalize(startPadding.top + dy / 2.5, fallbackPadding);
      next.right = normalize(startPadding.right - dx / 2.5, fallbackPadding);
    }
  } else if (proportional) {
    const delta = (dx - dy) / 2.5;
    next.bottom = normalize(startPadding.bottom + delta, fallbackPadding);
    next.left = normalize(startPadding.left + delta, fallbackPadding);
  } else {
    next.bottom = normalize(startPadding.bottom - dy / 2.5, fallbackPadding);
    next.left = normalize(startPadding.left + dx / 2.5, fallbackPadding);
  }

  return {
    top: next.top,
    right: next.right,
    bottom: next.bottom,
    left: next.left,
    topRight: normalize((next.top + next.right) / 2, fallbackPadding),
    bottomLeft: normalize((next.bottom + next.left) / 2, fallbackPadding),
    all: normalize((next.top + next.right + next.bottom + next.left) / 4, fallbackPadding)
  };
}

export function hasContentPaddingChanged(current = {}, next = {}) {
  return (
    current.top !== next.top ||
    current.right !== next.right ||
    current.bottom !== next.bottom ||
    current.left !== next.left
  );
}
