import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import {
  isAllowedRedirectUri as isAllowedRedirectUriByPolicy,
  normalizeText,
  parseAllowedExtensionIds
} from "./redirect-policy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, ".env");
const LOCAL_ENV = loadEnvFile(ENV_PATH);
const env = { ...process.env, ...LOCAL_ENV };
const PORT = Number(env.PORT) || 8787;
const CONNECTOR_HOST = normalizeText(env.CONNECTOR_HOST) || "127.0.0.1";
const BASE_URL = env.CONNECTOR_BASE_URL || `http://localhost:${PORT}`;
const ALLOWED_EXTENSION_IDS = parseAllowedExtensionIds(env.ALLOWED_EXTENSION_IDS);
const ALLOW_CHROME_EXTENSION_REDIRECT = normalizeText(env.ALLOW_CHROME_EXTENSION_REDIRECT) === "1";
const ENABLE_TOKEN_RELAY = normalizeText(env.ENABLE_TOKEN_RELAY) === "1";
const OAUTH_REQUEST_TIMEOUT_MS = parseClampedInt(env.OAUTH_REQUEST_TIMEOUT_MS, 15000, 1000, 120000);
const STATE_TTL = 10 * 60 * 1000;
const pendingStates = new Map();

const TOKEN_RELAYS = {
  monday: { tokenEnv: "MONDAY_ACCESS_TOKEN", accountEnv: "MONDAY_ACCOUNT_LABEL" },
  "google-gmail": { tokenEnv: "GOOGLE_ACCESS_TOKEN", accountEnv: "GOOGLE_ACCOUNT_LABEL" },
  "google-calendar": { tokenEnv: "GOOGLE_ACCESS_TOKEN", accountEnv: "GOOGLE_ACCOUNT_LABEL" },
  openai: { tokenEnv: "OPENAI_ACCESS_TOKEN", accountEnv: "OPENAI_ACCOUNT_LABEL" },
  "ai-chat": { tokenEnv: "OPENAI_ACCESS_TOKEN", accountEnv: "OPENAI_ACCOUNT_LABEL" }
};

const OAUTH_PROVIDERS = {
  monday: {
    authorizeUrl: "https://auth.monday.com/oauth2/authorize",
    tokenUrl: "https://auth.monday.com/oauth2/token",
    clientIdEnv: "MONDAY_CLIENT_ID",
    clientSecretEnv: "MONDAY_CLIENT_SECRET",
    callbackPath: "/api/auth/callback/monday",
    scope: "api"
  },
  "google-gmail": {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    callbackPath: "/api/auth/callback/google",
    scope: "https://www.googleapis.com/auth/gmail.readonly"
  },
  "google-calendar": {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    callbackPath: "/api/auth/callback/google",
    scope: "https://www.googleapis.com/auth/calendar.events.readonly"
  }
};

const server = http.createServer((req, res) => {
  const parsedUrl = parseRequestUrl(req);
  const pathname = parsedUrl.pathname;
  const method = (req.method || "GET").toUpperCase();

  if (pathname === "/") {
    return sendText(
      res,
      "Local auth connector for widgets. Use GET /api/auth/start with redirect_uri, state, provider. Read connector/.env.example for env vars."
    );
  }

  if (pathname === "/healthz") {
    if (method !== "GET") {
      return sendText(res, "Method not allowed", 405);
    }
    return sendJson(res, { status: "ok" });
  }

  if (pathname === "/api/auth/start") {
    if (method !== "GET") {
      return sendText(res, "Method not allowed", 405);
    }
    return handleStart(req, res, parsedUrl);
  }

  if (pathname === "/api/auth/callback/monday" || pathname === "/api/auth/callback/google") {
    if (method !== "GET") {
      return sendText(res, "Method not allowed", 405);
    }
    void handleCallback(res, parsedUrl).catch((error) => {
      if (!res.headersSent) {
        sendText(res, `Internal server error: ${error?.message || "unknown"}`, 500);
      }
    });
    return;
  }

  sendText(res, "Not found", 404);
});

server.listen(PORT, CONNECTOR_HOST, () => {
  console.log(`Connector server listening at ${BASE_URL} (bind ${CONNECTOR_HOST}:${PORT})`);
});

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    const out = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const equals = trimmed.indexOf("=");
      if (equals === -1) {
        continue;
      }
      const key = trimmed.slice(0, equals).trim();
      let value = trimmed.slice(equals + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function cleanupPendingStates() {
  const now = Date.now();
  for (const [key, info] of pendingStates) {
    if (info.expiresAt <= now) {
      pendingStates.delete(key);
    }
  }
}

function parseRequestUrl(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  return new URL(req.url || "", `http://${host}`);
}

function sendText(res, text, status = 200) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function createRandomId(length = 16) {
  return crypto.randomBytes(length).toString("hex");
}

function isAllowedRedirectUri(value) {
  return isAllowedRedirectUriByPolicy(value, {
    allowedExtensionIds: ALLOWED_EXTENSION_IDS,
    allowChromeExtensionRedirect: ALLOW_CHROME_EXTENSION_REDIRECT
  });
}

function parseClampedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function redirectWithHash(res, redirectUri, params) {
  try {
    const target = new URL(redirectUri);
    let hashString = "";
    if (params instanceof URLSearchParams) {
      hashString = params.toString();
    } else {
      hashString = new URLSearchParams(params).toString();
    }
    target.hash = hashString ? `#${hashString}` : "";
    res.writeHead(302, { Location: target.toString(), "Cache-Control": "no-store" });
    res.end(`Redirecting to ${target.toString()}`);
  } catch (error) {
    sendText(res, `Invalid redirect URI: ${error?.message || "unknown"}`, 400);
  }
}

function attemptTokenRelay(provider, extState, redirectUri, res) {
  const relay = TOKEN_RELAYS[provider];
  if (!relay) {
    return false;
  }
  const token = normalizeText(env[relay.tokenEnv]);
  if (!token) {
    return false;
  }
  const params = new URLSearchParams();
  params.set("state", extState);
  params.set("access_token", token);
  const account = normalizeText(env[relay.accountEnv]);
  if (account) {
    params.set("account", account);
  }
  redirectWithHash(res, redirectUri, params);
  return true;
}

function buildAuthUrl(provider, oauth, callbackUrl, callbackState) {
  const url = new URL(oauth.authorizeUrl);
  url.searchParams.set("client_id", normalizeText(env[oauth.clientIdEnv]));
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", callbackState);
  url.searchParams.set("response_type", "code");
  if (oauth.scope) {
    url.searchParams.set("scope", oauth.scope);
  }
  if (provider.startsWith("google")) {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
  }
  return url.toString();
}

function isLoopbackRequest(req) {
  const remoteAddress = normalizeText(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "").toLowerCase();
  return remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
}

function handleStart(req, res, parsedUrl) {
  cleanupPendingStates();
  const params = parsedUrl.searchParams;
  const mode = params.get("mode");
  const provider = params.get("provider");

  if (mode === "token") {
    if (!ENABLE_TOKEN_RELAY) {
      return sendText(res, "Token relay is disabled", 403);
    }
    if (!isLoopbackRequest(req)) {
      return sendText(res, "Token relay is limited to local requests", 403);
    }
    if (!provider) {
      return sendText(res, "Missing provider", 400);
    }
    const relay = TOKEN_RELAYS[provider];
    if (!relay) {
      return sendText(res, "Token relay not configured for this provider", 400);
    }
    const token = normalizeText(env[relay.tokenEnv]);
    if (!token) {
      return sendText(res, `Missing ${relay.tokenEnv} for token relay`, 400);
    }
    const payload = { access_token: token };
    const account = normalizeText(env[relay.accountEnv]);
    if (account) {
      payload.account = account;
    }
    return sendJson(res, payload);
  }

  const redirectUri = params.get("redirect_uri");
  const extState = params.get("state");

  if (!redirectUri || !extState || !provider) {
    return sendText(res, "Missing redirect_uri, state or provider", 400);
  }

  if (!isAllowedRedirectUri(redirectUri)) {
    return sendText(res, "Redirect URI is not allowed", 400);
  }

  if (ENABLE_TOKEN_RELAY && isLoopbackRequest(req) && attemptTokenRelay(provider, extState, redirectUri, res)) {
    return;
  }

  const oauth = OAUTH_PROVIDERS[provider];
  if (!oauth) {
    return sendText(res, "Unsupported provider", 400);
  }

  const clientId = normalizeText(env[oauth.clientIdEnv]);
  const clientSecret = normalizeText(env[oauth.clientSecretEnv]);
  if (!clientId || !clientSecret) {
    return sendText(res, `Missing ${oauth.clientIdEnv} or ${oauth.clientSecretEnv}`, 400);
  }

  const callbackUrl = new URL(oauth.callbackPath, BASE_URL).toString();
  const callbackState = createRandomId(16);
  const entry = {
    requestId: createRandomId(8),
    provider,
    extensionState: extState,
    redirectUri,
    expiresAt: Date.now() + STATE_TTL,
    callbackUrl
  };
  pendingStates.set(callbackState, entry);

  const authUrl = buildAuthUrl(provider, oauth, callbackUrl, callbackState);
  res.writeHead(302, { Location: authUrl, "Cache-Control": "no-store" });
  res.end(`Redirecting to ${authUrl}`);
}

async function handleCallback(res, parsedUrl) {
  cleanupPendingStates();
  const params = parsedUrl.searchParams;
  const callbackState = params.get("state");
  if (!callbackState) {
    return sendText(res, "Missing state", 400);
  }

  const entry = pendingStates.get(callbackState);
  if (!entry) {
    return sendText(res, "Session expired or invalid state", 400);
  }

  pendingStates.delete(callbackState);
  if (entry.expiresAt <= Date.now()) {
    return sendText(res, "Session expired", 400);
  }

  const error = params.get("error");
  const errorDescription = params.get("error_description");
  if (error) {
    return redirectWithHash(res, entry.redirectUri, {
      state: entry.extensionState,
      error,
      error_description: errorDescription || ""
    });
  }

  const code = params.get("code");
  if (!code) {
    return redirectWithHash(res, entry.redirectUri, {
      state: entry.extensionState,
      error: "missing_code",
      error_description: "Authorization callback did not include a code."
    });
  }

  try {
    const tokenBody = await exchangeCode(entry.provider, code, entry.callbackUrl);
    const accessToken = normalizeText(tokenBody?.access_token || tokenBody?.id_token || "");
    if (!accessToken) {
      return redirectWithHash(res, entry.redirectUri, {
        state: entry.extensionState,
        error: "missing_token",
        error_description: "Token response did not include access_token."
      });
    }

    const accountLabel = extractAccountLabel(tokenBody);
    const hash = new URLSearchParams();
    hash.set("state", entry.extensionState);
    hash.set("access_token", accessToken);
    if (accountLabel) {
      hash.set("account", accountLabel);
    }
    return redirectWithHash(res, entry.redirectUri, hash);
  } catch (error) {
    const description = normalizeText(error?.message) || "Token exchange failed";
    return redirectWithHash(res, entry.redirectUri, {
      state: entry.extensionState,
      error: "token_error",
      error_description: description
    });
  }
}

function extractAccountLabel(body) {
  if (!body || typeof body !== "object") {
    return "";
  }
  return (
    normalizeText(body.account) ||
    normalizeText(body.email) ||
    normalizeText(body.user) ||
    normalizeText(body.name) ||
    ""
  );
}

async function exchangeCode(provider, code, callbackUrl) {
  const oauth = OAUTH_PROVIDERS[provider];
  if (!oauth) {
    throw new Error("Unsupported provider for token exchange");
  }
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", callbackUrl);
  params.set("client_id", normalizeText(env[oauth.clientIdEnv]));
  params.set("client_secret", normalizeText(env[oauth.clientSecretEnv]));

  return postForm(oauth.tokenUrl, params);
}

function postForm(urlString, params) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch (error) {
      return finishReject(error);
    }

    const payload = params.toString();
    const client = parsedUrl.protocol === "https:" ? https : http;
    const request = client.request(
      {
        method: "POST",
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode || 0;
          const normalized = body ? tryParseJson(body) : {};
          if (status >= 400) {
            const message = normalized?.error_description || normalized?.error || `HTTP ${status}`;
            return finishReject(new Error(message));
          }
          return finishResolve(normalized);
        });
      }
    );

    request.setTimeout(OAUTH_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`OAuth request timed out after ${OAUTH_REQUEST_TIMEOUT_MS}ms`));
    });
    request.on("error", finishReject);
    request.write(payload);
    request.end();
  });
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
