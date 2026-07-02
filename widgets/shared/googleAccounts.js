import { normalizeIntegerInRange } from "../../core/utils/number.js";

export function normalizeGoogleAccountIndex(value, fallback = 0) {
  return normalizeIntegerInRange(value, fallback, 0, 9);
}
