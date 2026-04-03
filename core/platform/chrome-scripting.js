import { fromChromeCallback } from "./chrome-callback.js";

function resolveChromeApi(chromeApi) {
  return chromeApi ?? globalThis.chrome;
}

function isValidTabId(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateFrameIds(frameIds) {
  return Array.isArray(frameIds) && frameIds.every((frameId) => Number.isInteger(frameId) && frameId >= 0);
}

function validateInjection(injection) {
  if (!injection || typeof injection !== "object") {
    throw new Error("Script injection options are required.");
  }

  const target = injection.target;
  if (!target || typeof target !== "object" || !isValidTabId(target.tabId)) {
    throw new Error("Script injection target.tabId must be a non-negative integer.");
  }

  const hasFiles = Array.isArray(injection.files) && injection.files.length > 0;
  const hasFunc = typeof injection.func === "function";
  if (hasFiles === hasFunc) {
    throw new Error("Script injection requires exactly one of files or func.");
  }

  if (target.allFrames && target.frameIds !== undefined) {
    throw new Error("Script injection cannot use target.allFrames and target.frameIds together.");
  }

  if (target.frameIds !== undefined && !validateFrameIds(target.frameIds)) {
    throw new Error("Script injection target.frameIds must be an array of non-negative integers.");
  }

  if (injection.args !== undefined && !Array.isArray(injection.args)) {
    throw new Error("Script injection args must be an array.");
  }

  if (hasFiles && injection.args !== undefined) {
    throw new Error("Script injection args are only supported with func injections.");
  }
}

export function hasScriptingApi(options = {}) {
  const chromeApi = resolveChromeApi(options.chromeApi);
  return typeof chromeApi?.scripting?.executeScript === "function";
}

export function executeScript(injection, options = {}) {
  try {
    validateInjection(injection);
  } catch (error) {
    return Promise.reject(error);
  }

  const chromeApi = resolveChromeApi(options.chromeApi);
  return fromChromeCallback(
    (callback) => chromeApi.scripting.executeScript(injection, callback),
    {
      chromeApi,
      fallbackMessage: options.fallbackMessage ?? "Unable to execute browser script."
    }
  );
}
