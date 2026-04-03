import { normalizeText } from "../utils/text.js";

function resolveChromeApi(chromeApi) {
  return chromeApi ?? globalThis.chrome;
}

export function fromChromeCallback(run, options = {}) {
  const { chromeApi = globalThis.chrome, fallbackMessage = "Browser API request failed." } = options;

  return new Promise((resolve, reject) => {
    try {
      run((result) => {
        const runtimeError = normalizeText(resolveChromeApi(chromeApi)?.runtime?.lastError?.message);
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }
        resolve(result);
      });
    } catch (error) {
      if (error instanceof Error) {
        reject(error);
        return;
      }
      reject(new Error(fallbackMessage));
    }
  });
}
