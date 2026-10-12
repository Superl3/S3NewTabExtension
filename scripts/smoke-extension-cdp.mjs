import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildSmokeExtensionPackage } from "./extension-package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
  return args;
}

function findBrowser(explicitPath) {
  const agentBrowserDir = path.join(os.homedir(), ".agent-browser", "browsers");
  const agentBrowserCandidates = fs.existsSync(agentBrowserDir)
    ? fs.readdirSync(agentBrowserDir)
      .filter((name) => /^chrome-/i.test(name))
      .sort()
      .reverse()
      .map((name) => path.join(agentBrowserDir, name, "chrome.exe"))
    : [];
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    ...agentBrowserCandidates,
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "google-chrome",
    "chrome",
    "chromium",
    "msedge"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 3000 });
      return candidate;
    } catch {
    }
  }
  throw new Error("No Chromium browser found. Pass --browser <path> or set CHROME_PATH.");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: options.method || "GET" }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} for ${url}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body || "null"));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once("error", reject);
    request.end();
  });
}

function normalizePathForCompare(value) {
  if (!value) {
    return "";
  }
  return path.resolve(value).toLowerCase();
}

function discoverExtensionId(profileDir, extensionPath) {
  const preferencePath = path.join(profileDir, "Default", "Preferences");
  if (!fs.existsSync(preferencePath)) {
    return null;
  }
  try {
    const preferences = JSON.parse(fs.readFileSync(preferencePath, "utf8"));
    const settings = preferences.extensions?.settings || {};
    const normalizedExtensionPath = normalizePathForCompare(extensionPath);
    for (const [id, value] of Object.entries(settings)) {
      const manifestName = value?.manifest?.name;
      const configuredPath = normalizePathForCompare(value?.path);
      if (manifestName === "S3 New Tab" && configuredPath === normalizedExtensionPath) {
        return id;
      }
    }
  } catch {
  }
  return null;
}

function resolveNewTabUrl(browserPath) {
  return /msedge/i.test(browserPath) ? "edge://newtab/" : "chrome://newtab/";
}

function isExtensionNewTabTarget(target) {
  if (target.type !== "page") {
    return false;
  }
  if (target.url?.startsWith("chrome-extension://") && target.url.includes("/newtab.html")) {
    return true;
  }
  return target.title === "S3 New Tab" && /^(chrome|edge):\/\/newtab\/?/.test(target.url || "");
}

async function waitFor(description, callback, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await callback();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

async function removeTreeWithRetry(targetPath, attempts = 8) {
  const resolved = path.resolve(targetPath);
  if (path.dirname(resolved) !== path.join(root, ".tmp") ||
      !/^extension-smoke-(profile|package)-\d+$/.test(path.basename(resolved))) {
    throw new Error("Refusing to remove a path outside the smoke workspace.");
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error(`Failed to connect WebSocket ${url}`)), { once: true });
  });
}

function createCdpClient(socket) {
  let nextId = 1;
  const pending = new Map();
  const events = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result || {});
      }
      return;
    }
    if (message.method) {
      events.push(message);
    }
  });

  function call(method, params = {}) {
    const id = nextId;
    nextId += 1;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!pending.has(id)) {
          return;
        }
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
    });
  }

  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime.evaluate exception");
    }
    return result.result?.value;
  }

  async function click(selector) {
    const point = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (!point) {
      throw new Error(`Missing selector for click: ${selector}`);
    }
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await call("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  }

  return { call, evaluate, click, events };
}

function collectStatsExpression() {
  return `(() => {
    const text = document.body?.textContent || "";
    const widgets = Array.from(document.querySelectorAll(".widget-card")).map((card) => ({
      id: card.getAttribute("data-widget-id"),
      type: card.getAttribute("data-widget-type"),
      text: (card.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160)
    }));
    return {
      url: location.href,
      ready: document.readyState,
      widgetCount: widgets.length,
      clockCount: widgets.filter((widget) => widget.type === "clock").length,
      loadingCount: widgets.filter((widget) => /Loading widget/i.test(widget.text)).length,
      hasWidgetFailed: /Widget failed to load|This widget could not be loaded/i.test(text),
      hasRawErrorText: /Unknown error|Failed to fetch|chrome is not defined/i.test(text),
      modalOpen: document.body.classList.contains("modal-open"),
      widgets
    };
  })()`;
}

function hasLoadedRssWidget(stats) {
  const rssWidget = stats?.widgets?.find((widget) => widget.type === "rss");
  if (!rssWidget) {
    return false;
  }
  return (
    /Open feed/i.test(rssWidget.text) &&
    !/Loading widget|Loading feed|Refreshing feed|Feed is not|not reachable|not available/i.test(rssWidget.text)
  );
}

async function verifyConcurrentPersistence(cdp, port, extensionUrl) {
  const storageKey = `s3newtab-smoke-concurrency-${Date.now()}`;
  const secondTarget = await requestJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(extensionUrl)}`, { method: "PUT" });
  const secondSocket = await connectWebSocket(secondTarget.webSocketDebuggerUrl);
  const second = createCdpClient(secondSocket);
  const setup = (revision, delayWrite) => `(async () => {
    const { createPersistenceRuntime } = await import("./core/persistence-runtime.js");
    const key = ${JSON.stringify(storageKey)};
    const state = { meta: { lastUserMutationAt: ${revision} }, instances: [{ id: "revision-${revision}" }] };
    const probe = globalThis.persistenceSmokeProbe = { started: false, done: false, conflicts: 0 };
    const gate = ${delayWrite} ? new Promise(resolve => { probe.release = resolve; }) : Promise.resolve();
    const runtime = createPersistenceRuntime({
      storageKey: key, getState: () => state, structuredClone,
      applyRuntimeOnlyPolicyToSnapshot() {},
      chromeStorageLocalGet: key => chrome.storage.local.get(key),
      saveState: async snapshot => {
        probe.started = true;
        await gate;
        await chrome.storage.local.set({ [key]: snapshot });
      },
      getLastSavedUserMutationAt: () => 0,
      getLastSavedFingerprint: () => "",
      setLastSavedUserMutationAt() {}, setLastSavedFingerprint() {}, setSaveInFlightFingerprint() {},
      clearUndoRedo() {}, restoreFromSnapshot: snapshot => Object.assign(state, snapshot),
      onPersistConflict: () => { probe.conflicts += 1; }
    });
    void runtime.saveSnapshotIfNotStale(state, "revision-${revision}", ${revision})
      .then(saved => { probe.saved = saved; probe.done = true; })
      .catch(error => { probe.error = error.message; probe.done = true; });
    return true;
  })()`;
  try {
    await second.call("Runtime.enable");
    await waitFor("second extension tab", () => second.evaluate("document.readyState === 'complete'"));
    await cdp.evaluate(`chrome.storage.local.set({ [${JSON.stringify(storageKey)}]: { meta: { lastUserMutationAt: 0 }, instances: [] } })`);
    await cdp.evaluate(setup(200, true));
    await waitFor("newer write holding the native lock", () => cdp.evaluate("globalThis.persistenceSmokeProbe?.started"));
    await second.evaluate(setup(100, false));
    await cdp.evaluate("globalThis.persistenceSmokeProbe.release(); true");
    await waitFor("newer write completion", () => cdp.evaluate("globalThis.persistenceSmokeProbe?.done"));
    await waitFor("older write rejection", () => second.evaluate("globalThis.persistenceSmokeProbe?.done"));
    const newer = await cdp.evaluate("({ saved: persistenceSmokeProbe.saved, error: persistenceSmokeProbe.error })");
    const older = await second.evaluate("({ saved: persistenceSmokeProbe.saved, conflicts: persistenceSmokeProbe.conflicts, error: persistenceSmokeProbe.error })");
    const finalRevision = await cdp.evaluate(`(async () => (await chrome.storage.local.get(${JSON.stringify(storageKey)}))[${JSON.stringify(storageKey)}].meta.lastUserMutationAt)()`);
    if (newer.saved !== true || older.saved !== false || older.conflicts !== 1 || finalRevision !== 200) {
      throw new Error(`Cross-tab persistence failed: ${JSON.stringify({ newer, older, finalRevision })}`);
    }
    return { finalRevision, newerSaved: newer.saved, olderSaved: older.saved, conflictReported: older.conflicts === 1 };
  } finally {
    await cdp.evaluate(`(async () => { globalThis.persistenceSmokeProbe?.release?.(); await chrome.storage.local.remove(${JSON.stringify(storageKey)}); delete globalThis.persistenceSmokeProbe; })()`).catch(() => null);
    secondSocket.close();
    await cdp.call("Target.closeTarget", { targetId: secondTarget.id }).catch(() => null);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browserPath = findBrowser(args.get("browser"));
  const keepProfile = args.has("keep-profile");
  const addWidgetType = args.get("widget-type") || "";
  const port = await getFreePort();
  const newTabUrl = resolveNewTabUrl(browserPath);
  const profileDir = path.join(root, ".tmp", `extension-smoke-profile-${Date.now()}`);
  const packageDir = path.join(root, ".tmp", `extension-smoke-package-${Date.now()}`);
  buildSmokeExtensionPackage(root, packageDir);
  const extensionPath = packageDir.replace(/\\/g, "/");
  fs.mkdirSync(profileDir, { recursive: true });

  let browserStderr = "";
  const browser = spawn(browserPath, [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    ...(args.has("headless") ? ["--headless=new"] : []),
    "--enable-logging=stderr",
    "--window-size=1280,720",
    newTabUrl
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  browser.stderr?.on("data", (chunk) => {
    browserStderr += chunk.toString("utf8");
    if (browserStderr.length > 8000) {
      browserStderr = browserStderr.slice(-8000);
    }
  });

  const cleanup = async () => {
    try {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        browser.kill("SIGKILL");
      }
    } catch {
    }
    try {
      if (keepProfile) {
        console.error(`Kept smoke profile: ${profileDir}`);
        console.error(`Kept smoke extension package: ${packageDir}`);
      } else {
        for (const targetPath of [profileDir, packageDir]) {
          try {
            await removeTreeWithRetry(targetPath);
          } catch (error) {
            console.error(`Unable to remove smoke temp path ${targetPath}: ${error.message}`);
          }
        }
      }
    } catch {
    }
  };

  try {
    await waitFor("browser debugging endpoint", () => requestJson(`http://127.0.0.1:${port}/json/version`), 20000);
    await requestJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(newTabUrl)}`, { method: "PUT" }).catch(() => null);
    let target = await waitFor("extension new tab target", async () => {
      const targets = await requestJson(`http://127.0.0.1:${port}/json/list`);
      return targets.find(isExtensionNewTabTarget);
    }, 6000).catch(() => null);

    let extensionId = "";
    if (!target) {
      extensionId = await waitFor("loaded extension id", async () => {
        const fromPreferences = discoverExtensionId(profileDir, packageDir);
        if (fromPreferences) {
          return fromPreferences;
        }
        const targets = await requestJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
        const extensionTarget = targets.find(isExtensionNewTabTarget);
        return extensionTarget?.url?.match(/^chrome-extension:\/\/([^/]+)/)?.[1] || null;
      }, 12000).catch(async (error) => {
        const targets = await requestJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
        const preferencePath = path.join(profileDir, "Default", "Preferences");
        const preferenceExists = fs.existsSync(preferencePath);
        throw new Error(
          `${error.message}\nTargets: ${JSON.stringify(targets.map((item) => ({ type: item.type, url: item.url, title: item.title })), null, 2)}\n` +
          `Preferences exists: ${preferenceExists}\nExtension path: ${extensionPath}\nChrome stderr:\n${browserStderr.slice(-3000)}`
        );
      });
      const extensionUrl = `chrome-extension://${extensionId}/newtab.html`;
      await requestJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(extensionUrl)}`, { method: "PUT" }).catch(() => null);
      target = await waitFor("extension page target", async () => {
        const targets = await requestJson(`http://127.0.0.1:${port}/json/list`);
        return targets.find((item) => item.type === "page" && item.url?.startsWith(extensionUrl));
      }, 12000);
    }
    const targetUrl = target.url;

    const socket = await connectWebSocket(target.webSocketDebuggerUrl);
    const cdp = createCdpClient(socket);
    await cdp.call("Runtime.enable");
    await cdp.call("Page.enable");

    await waitFor("initial widgets", async () => {
      const stats = await cdp.evaluate(collectStatsExpression());
      return stats.ready === "complete" && stats.widgetCount >= 1 ? stats : null;
    }).catch(async (error) => {
      const body = await cdp.evaluate("document.body ? document.body.textContent.slice(0, 1000) : ''").catch((evalError) => `eval failed: ${evalError.message}`);
      const currentUrl = await cdp.evaluate("location.href").catch(() => targetUrl);
      throw new Error(
        `${error.message}\nTarget URL: ${targetUrl}\nCurrent URL: ${currentUrl}\nExtension ID: ${extensionId || "(newtab override)"}\nBody:\n${body}\n` +
        `Chrome stderr:\n${browserStderr.slice(-3000)}`
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const initial = await cdp.evaluate(collectStatsExpression());

    await cdp.click("#modeToggleBtn");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await cdp.click("#addWidgetBtn");
    await waitFor("add widget modal", () => cdp.evaluate("Boolean(document.querySelector('#addWidgetModalOkBtn') && document.body.classList.contains('modal-open'))"));
    if (addWidgetType) {
      const selectedType = await cdp.evaluate(`(() => {
        const select = document.querySelector("#widgetTypeSelect");
        if (!select) return "";
        const option = Array.from(select.options).find((item) => item.value === ${JSON.stringify(addWidgetType)});
        if (!option) return "";
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return select.value;
      })()`);
      if (selectedType !== addWidgetType) {
        throw new Error(`Unable to select add widget type: ${addWidgetType}`);
      }
    }
    await cdp.click("#addWidgetModalOkBtn");
    await waitFor("widget settings modal", () => cdp.evaluate("Boolean(document.querySelector('#widgetModalOkBtn') && document.body.classList.contains('modal-open'))"));
    await cdp.click("#widgetModalOkBtn");
    let afterAdd = null;
    if (addWidgetType === "rss") {
      afterAdd = await waitFor("RSS feed items after add", async () => {
        const stats = await cdp.evaluate(collectStatsExpression());
        return hasLoadedRssWidget(stats) ? stats : null;
      }, 15000).catch(() => null);
    }
    if (!afterAdd) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      afterAdd = await cdp.evaluate(collectStatsExpression());
    }

    await cdp.call("Page.navigate", { url: newTabUrl });
    await waitFor("reload widgets", async () => {
      const stats = await cdp.evaluate(collectStatsExpression());
      return stats.ready === "complete" && stats.widgetCount >= 1 ? stats : null;
    });
    let afterReload = null;
    if (addWidgetType === "rss") {
      afterReload = await waitFor("RSS feed items after reload", async () => {
        const stats = await cdp.evaluate(collectStatsExpression());
        return hasLoadedRssWidget(stats) ? stats : null;
      }, 15000).catch(() => null);
    }
    if (!afterReload) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      afterReload = await cdp.evaluate(collectStatsExpression());
    }

    const failures = [];
    if (initial.widgetCount < 7) failures.push(`expected at least 7 initial widgets, found ${initial.widgetCount}`);
    if (initial.loadingCount !== 0) failures.push(`initial widgets still loading: ${initial.loadingCount}`);
    if (initial.hasWidgetFailed || initial.hasRawErrorText) failures.push("initial page exposed failure text");
    if (afterAdd.widgetCount <= initial.widgetCount) failures.push("Add Widget did not increase widget count");
    if (addWidgetType && !afterAdd.widgets.some((widget) => widget.type === addWidgetType)) {
      failures.push(`Add Widget did not create ${addWidgetType}`);
    }
    if (addWidgetType === "rss" && !hasLoadedRssWidget(afterAdd)) {
      failures.push("RSS widget did not render loaded feed items after add");
    }
    if (afterAdd.modalOpen) failures.push("widget settings modal remained open after OK");
    if (afterAdd.hasWidgetFailed || afterAdd.hasRawErrorText) failures.push("post-add page exposed failure text");
    if (afterReload.widgetCount !== afterAdd.widgetCount) failures.push("reload did not preserve widget count");
    if (addWidgetType && !afterReload.widgets.some((widget) => widget.type === addWidgetType)) {
      failures.push(`reload did not preserve ${addWidgetType}`);
    }
    if (addWidgetType === "rss" && !hasLoadedRssWidget(afterReload)) {
      failures.push("RSS widget did not render loaded feed items after reload");
    }
    if (afterReload.clockCount < afterAdd.clockCount) failures.push("reload lost the added clock widget");
    if (afterReload.hasWidgetFailed || afterReload.hasRawErrorText) failures.push("post-reload page exposed failure text");

    const fontsLoaded = await cdp.evaluate(`(async () => {
      const weights = [400, 500, 600, 700];
      const loaded = await Promise.all(weights.map(weight => document.fonts.load(weight + ' 16px "Pretendard Std"')));
      return loaded.every(faces => faces.length > 0 && faces.every(face => face.status === "loaded"));
    })()`);
    if (!fontsLoaded) failures.push("packaged fonts did not load");

    if (failures.length) {
      throw new Error(`Extension smoke failed:\n- ${failures.join("\n- ")}\nStats:\n${JSON.stringify({ initial, afterAdd, afterReload }, null, 2)}`);
    }

    const concurrentPersistence = await verifyConcurrentPersistence(cdp, port, afterReload.url);
    if (cdp.events.some(event => event.method === "Runtime.exceptionThrown")) {
      throw new Error("Extension smoke observed an uncaught runtime exception.");
    }
    console.log(JSON.stringify({ browserPath, initial, afterAdd, afterReload, fontsLoaded, concurrentPersistence }, null, 2));
    socket.close();
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
