export function callIfFunction(fn, ...args) {
  if (typeof fn !== "function") {
    return undefined;
  }
  return fn(...args);
}
