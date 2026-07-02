export function resolveChromeApi(chromeApi = null) {
  return chromeApi ?? globalThis.chrome ?? null;
}
