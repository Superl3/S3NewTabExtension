function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeSafeUrl(value, fallback = "https://www.google.com") {
  const text = normalizeText(value, fallback);
  if (!text) {
    return fallback;
  }

  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

const SHORTCUT_FAVICON_CACHE_KEY = "s3newtab-shortcut-favicon-cache-v1";
const SHORTCUT_FAVICON_CACHE_LIMIT = 240;

let shortcutFaviconCache = {};
let shortcutFaviconCacheLoaded = false;
let shortcutFaviconCacheLoadPromise = null;

function chromeStorageLocal() {
  return globalThis.chrome?.storage?.local || null;
}

function isUrlIcon(value) {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("chrome-extension://")
  );
}

function bookmarkFavicon(url) {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
}

function normalizeFaviconCache(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
      continue;
    }
    const normalizedValue = normalizeText(value);
    if (!normalizedValue.startsWith("data:image/")) {
      continue;
    }
    out[normalizedKey] = normalizedValue;
  }
  return out;
}

async function loadShortcutFaviconCache() {
  if (shortcutFaviconCacheLoaded) {
    return;
  }
  if (shortcutFaviconCacheLoadPromise) {
    await shortcutFaviconCacheLoadPromise;
    return;
  }

  const storage = chromeStorageLocal();
  if (typeof storage?.get !== "function") {
    shortcutFaviconCache = {};
    shortcutFaviconCacheLoaded = true;
    return;
  }

  shortcutFaviconCacheLoadPromise = storage
    .get(SHORTCUT_FAVICON_CACHE_KEY)
    .then((stored) => {
      shortcutFaviconCache = normalizeFaviconCache(stored?.[SHORTCUT_FAVICON_CACHE_KEY]);
      shortcutFaviconCacheLoaded = true;
    })
    .catch(() => {
      shortcutFaviconCache = {};
      shortcutFaviconCacheLoaded = true;
    })
    .finally(() => {
      shortcutFaviconCacheLoadPromise = null;
    });

  await shortcutFaviconCacheLoadPromise;
}

function faviconCacheKey(url) {
  const normalized = normalizeText(url);
  if (!normalized) {
    return "";
  }
  try {
    return new URL(normalized).origin.toLowerCase();
  } catch {
    return normalized.toLowerCase();
  }
}

function trimFaviconCache(cache) {
  const keys = Object.keys(cache);
  if (keys.length <= SHORTCUT_FAVICON_CACHE_LIMIT) {
    return cache;
  }

  const removeCount = keys.length - SHORTCUT_FAVICON_CACHE_LIMIT;
  for (let i = 0; i < removeCount; i += 1) {
    delete cache[keys[i]];
  }
  return cache;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result || ""));
    };
    reader.onerror = () => {
      reject(reader.error || new Error("Failed to read favicon blob"));
    };
    reader.readAsDataURL(blob);
  });
}

async function fetchAndCacheFavicon(url, cacheKey) {
  const response = await fetch(bookmarkFavicon(url), {
    cache: "force-cache"
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch favicon: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  if (!blob || !String(blob.type || "").startsWith("image/")) {
    throw new Error("Invalid favicon response");
  }

  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Invalid favicon data URL");
  }

  if (shortcutFaviconCache[cacheKey] !== dataUrl) {
    if (cacheKey in shortcutFaviconCache) {
      delete shortcutFaviconCache[cacheKey];
    }
    shortcutFaviconCache[cacheKey] = dataUrl;
    trimFaviconCache(shortcutFaviconCache);
    const storage = chromeStorageLocal();
    if (typeof storage?.set === "function") {
      await storage.set({
        [SHORTCUT_FAVICON_CACHE_KEY]: shortcutFaviconCache
      });
    }
  }

  return dataUrl;
}

export const shortcutWidget = {
  type: "shortcut",
  title: "Shortcut",
  defaultConfig: {
    label: "Shortcut",
    url: "https://www.google.com",
    icon: "",
    faviconMode: "site",
    openInNewTab: false,
    useGlobalIconSize: true,
    iconSizePercent: 100
  },
  defaultGridSize: {
    w: 1,
    h: 1
  },
  defaultLayout: {
    x: 980,
    y: 560,
    w: 120,
    h: 120
  },
  settingsSchema: [
    { key: "label", label: "Label", type: "text", placeholder: "Shortcut" },
    { key: "url", label: "Target URL", type: "url", placeholder: "https://example.com" },
    {
      key: "icon",
      label: "Icon (emoji or image URL)",
      type: "text",
      placeholder: "⭐ or https://example.com/icon.png"
    },
    {
      key: "iconEditor",
      label: "Icon editor",
      type: "shortcut-icon-editor",
      helpText: "Draw or import an image and apply it as icon."
    },
    {
      key: "faviconMode",
      label: "Icon source",
      type: "select",
      options: [
        { value: "site", label: "Website favicon" },
        { value: "none", label: "No favicon" }
      ]
    },
    { key: "openInNewTab", label: "Open in new tab", type: "checkbox" },
    { key: "useGlobalIconSize", label: "Use global icon size", type: "checkbox" },
    {
      key: "iconSizePercent",
      label: "Icon size (%)",
      type: "number",
      min: 40,
      max: 220,
      step: 5
    }
  ],
  create({ container, getConfig, getUi, isEditMode, openSettings }) {
    const tile = document.createElement("a");
    tile.className = "shortcut-tile";

    const icon = document.createElement("span");
    icon.className = "shortcut-icon";

    const label = document.createElement("span");
    label.className = "shortcut-label";

    tile.append(icon, label);
    container.append(tile);

    let renderToken = 0;

    tile.addEventListener("click", (event) => {
      if (!isEditMode?.()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openSettings?.();
    });

    function render() {
      renderToken += 1;
      const currentToken = renderToken;

      const cfg = getConfig();
      const ui = typeof getUi === "function" ? getUi() : null;
      const url = normalizeSafeUrl(cfg.url, "https://www.google.com");
      const text = normalizeText(cfg.label, "Shortcut");
      const iconValue = normalizeText(cfg.icon);
      const globalSize = Number(ui?.shortcuts?.iconSizePercent);
      const localSize = Number(cfg.iconSizePercent);
      const useGlobal = cfg.useGlobalIconSize !== false;
      const fallbackSize = Number.isFinite(globalSize) ? globalSize : 100;
      const effectiveSize = useGlobal ? fallbackSize : Number.isFinite(localSize) ? localSize : fallbackSize;
      const clampedSize = Math.min(220, Math.max(40, effectiveSize));

      tile.href = url;
      tile.target = cfg.openInNewTab ? "_blank" : "_self";
      tile.rel = cfg.openInNewTab ? "noreferrer" : "";
      label.textContent = text;
      tile.style.setProperty("--shortcut-scale", `${clampedSize / 100}`);

      icon.replaceChildren();
      if (iconValue) {
        if (isUrlIcon(iconValue)) {
          const img = document.createElement("img");
          img.src = iconValue;
          img.alt = "";
          icon.append(img);
          return;
        }
        icon.textContent = iconValue;
        return;
      }

      if (cfg.faviconMode === "site") {
        const key = faviconCacheKey(url);
        if (!key) {
          icon.textContent = "↗";
          return;
        }

        icon.textContent = "↗";

        void (async () => {
          await loadShortcutFaviconCache();
          if (currentToken !== renderToken) {
            return;
          }

          const cached = shortcutFaviconCache[key];
          if (cached) {
            const img = document.createElement("img");
            img.src = cached;
            img.alt = "";
            icon.replaceChildren(img);
            return;
          }

          try {
            const dataUrl = await fetchAndCacheFavicon(url, key);
            if (currentToken !== renderToken) {
              return;
            }
            const img = document.createElement("img");
            img.src = dataUrl;
            img.alt = "";
            icon.replaceChildren(img);
          } catch {
            if (currentToken !== renderToken) {
              return;
            }
            const img = document.createElement("img");
            img.src = bookmarkFavicon(url);
            img.alt = "";
            icon.replaceChildren(img);
          }
        })();

        return;
      }

      icon.textContent = "↗";
    }

    render();
    return {
      refresh: render
    };
  }
};
