import { toFiniteNumber } from "./number.js";

export function snapToHalfGridTrack(value) {
  const numeric = toFiniteNumber(value, 0);
  return Math.round(numeric * 2) / 2;
}
