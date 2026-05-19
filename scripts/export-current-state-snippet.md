# Export current state (DevTools)

간단 사용법:
1. 새 탭 페이지에서 DevTools (`F12`) -> **Console** 열기
2. 아래 코드를 그대로 실행
3. 자동으로 `s3-new-tab-profile.json` 파일이 다운로드됨

```js
const STORAGE_KEY = "s3newtab-state-v1";
const SENSITIVE_TERMS = [
  "auth",
  "secret",
  "token",
  "password",
  "apikey",
  "credential",
  "session",
  "bearer",
  "private",
  "clientsecret"
];
const URL_SECRET_PARAMS = new Set([
  "token",
  "accesstoken",
  "auth",
  "apikey",
  "key",
  "secret",
  "password",
  "sig",
  "signature",
  "session",
  "code",
  "refreshtoken",
  "clientsecret"
]);
const VOLATILE_PROFILE_TERMS = [
  "cache",
  "cached",
  "fingerprint",
  "runtime",
  "temp",
  "signature",
  "etag",
  "storedat",
  "lastfetch",
  "fetchedat",
  "expires"
];

const normalizeKey = (key) => String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
const isSensitiveKey = (key) => {
  const normalized = normalizeKey(key);
  return SENSITIVE_TERMS.some((term) => normalized.includes(term));
};

const scrubUrlLikeString = (value) => {
  if (typeof value !== "string") return value;
  if (!value.includes("?") || !value.includes("=")) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    try {
      url = new URL(value, "https://local.invalid");
    } catch {
      return value;
    }
  }

  let changed = false;
  for (const key of url.searchParams.keys()) {
    if (URL_SECRET_PARAMS.has(normalizeKey(key))) {
      url.searchParams.set(key, "[REDACTED]");
      changed = true;
    }
  }
  if (!changed) return value;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return url.toString();
  }

  return `${url.pathname}${url.search}${url.hash}`;
};

const scrubNode = (node) => {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const value = node[i];
      if (typeof value === "string") {
        node[i] = scrubUrlLikeString(value);
      } else {
        scrubNode(value);
      }
    }
    return;
  }

  if (!node || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    if (isSensitiveKey(key)) {
      if (typeof value === "string") {
        node[key] = value.trim() ? "[REDACTED]" : "";
      } else if (value != null) {
        node[key] = "[REDACTED]";
      }
      continue;
    }

    if (typeof value === "string") {
      node[key] = scrubUrlLikeString(value);
      continue;
    }

    scrubNode(value);
  }
};

const removeVolatileFields = (node) => {
  if (Array.isArray(node)) {
    node.forEach(removeVolatileFields);
    return;
  }
  if (!node || typeof node !== "object") return;

  for (const key of Object.keys(node)) {
    const normalized = normalizeKey(key);
    if (VOLATILE_PROFILE_TERMS.some((term) => normalized.includes(term))) {
      delete node[key];
      continue;
    }
    removeVolatileFields(node[key]);
  }
};

const { [STORAGE_KEY]: rawState } = await chrome.storage.local.get(STORAGE_KEY);

if (!rawState || typeof rawState !== "object") {
  console.warn(`[export] No '${STORAGE_KEY}' found in chrome.storage.local.`);
  "";
} else {
  const sanitized = structuredClone(rawState);

  if (sanitized.ui?.monday && typeof sanitized.ui.monday === "object") {
    sanitized.ui.monday.accessToken = "[REDACTED]";
  }

  removeVolatileFields(sanitized);
  scrubNode(sanitized);

  const profile = {
    format: "s3-new-tab-profile",
    version: 1,
    exportedAt: new Date().toISOString(),
    app: {
      name: "S3 New Tab",
      version: ""
    },
    browser: {
      userAgent: navigator.userAgent
    },
    portability: {
      credentials: "excluded",
      volatileCaches: "excluded",
      browserSpecificUrls: "removed-on-import",
      reauthenticationRequired: true
    },
    snapshot: sanitized
  };
  const jsonString = JSON.stringify(profile, null, 2);
  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "s3-new-tab-profile.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  if (typeof globalThis.copy === "function") {
    globalThis.copy(jsonString);
    console.log("[export] copy() available: sanitized JSON also copied to clipboard.");
  }

  console.log("[export] Portable profile preview:", profile);
  console.log("[export] Downloaded: s3-new-tab-profile.json");
  jsonString;
}
```
