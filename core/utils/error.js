import { normalizeText } from "./text.js";

export function normalizeErrorMessage(error, fallback = "Unknown error") {
  if (!error) {
    return fallback;
  }
  if (typeof error === "string") {
    return normalizeText(error, fallback);
  }
  if (typeof error.message === "string") {
    return normalizeText(error.message, fallback);
  }
  return fallback;
}
