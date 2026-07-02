export function pointInsideRect(x, y, rect) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !rect) {
    return false;
  }
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
