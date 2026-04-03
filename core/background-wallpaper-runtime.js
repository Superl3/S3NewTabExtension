export function createBackgroundWallpaperRuntime(deps) {
  function wallpaperSignature(cfg) {
    return [
      cfg.wallpaperProvider,
      cfg.wallpaperTheme,
      cfg.redditSubreddit,
      cfg.redditTime
    ].join("|");
  }

  function wallpaperRotateMs(cfg) {
    return deps.clamp(Number(cfg.rotateMinutes) || 15, 1, 240) * 60000;
  }

  function hasWallpaperCacheRecord(cfg, signature) {
    return (
      deps.normalizeText(cfg.wallpaperCachedUrl) !== "" &&
      deps.normalizeText(cfg.wallpaperCachedSignature) === signature &&
      Number(cfg.wallpaperCachedAt) > 0
    );
  }

  function isWallpaperCacheFresh(cfg, signature) {
    if (!hasWallpaperCacheRecord(cfg, signature)) {
      return false;
    }
    const age = Math.max(0, deps.now() - Number(cfg.wallpaperCachedAt || 0));
    return age < wallpaperRotateMs(cfg);
  }

  function applyWallpaperSwap(url, token) {
    if (!url) {
      return false;
    }
    if (token !== deps.getWallpaperLoadToken()) {
      return false;
    }
    deps.elements.bgImage.src = url;
    deps.elements.bgImage.classList.add("visible");
    void deps.updateBlurFromImage(url);
    deps.requestWallpaperLuminanceSample(url);
    return true;
  }

  async function preloadAndSwapWallpaper(url, token) {
    await preloadImage(url);
    return applyWallpaperSwap(url, token);
  }

  function buildSimpleWallpaperUrl(provider, themeTag) {
    const wallpaperCounter = deps.incrementWallpaperCounter();
    const theme = encodeURIComponent(deps.normalizeText(themeTag, "nature"));

    if (provider === "unsplash") {
      return `https://source.unsplash.com/1920x1080/?${theme}&sig=${wallpaperCounter}`;
    }

    const seed = encodeURIComponent(`${theme}-${deps.now()}-${wallpaperCounter}`);
    return `https://picsum.photos/seed/${seed}/1920/1080`;
  }

  function parseRedditImage(post) {
    const raw = post?.url_overridden_by_dest || post?.url || post?.preview?.images?.[0]?.source?.url || "";
    const decoded = String(raw).replaceAll("&amp;", "&");
    const isImage = /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(decoded);
    const fromImageHost = decoded.includes("i.redd.it") || decoded.includes("i.imgur.com");
    if (!decoded.startsWith("http")) {
      return "";
    }
    if (isImage || fromImageHost) {
      return decoded;
    }
    return "";
  }

  async function fetchRedditWallpaperUrl(cfg) {
    const subreddit = deps.normalizeText(cfg.redditSubreddit, "EarthPorn").replace(/^r\//i, "");
    const allowedTimes = new Set(["hour", "day", "week", "month", "year", "all"]);
    const t = allowedTimes.has(cfg.redditTime) ? cfg.redditTime : "week";
    const endpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${t}&limit=80`;
    const response = await deps.fetch(endpoint, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`reddit:${response.status}`);
    }

    const data = await response.json();
    const items = (data?.data?.children || [])
      .map((entry) => parseRedditImage(entry?.data || {}))
      .filter(Boolean);

    const pick = deps.pickRandom(items);
    if (!pick) {
      throw new Error("reddit:no-image");
    }
    return pick;
  }

  async function resolveWallpaperUrl(cfg) {
    const provider = deps.normalizeText(cfg.wallpaperProvider, "picsum");

    if (provider === "reddit") {
      return fetchRedditWallpaperUrl(cfg);
    }

    return buildSimpleWallpaperUrl(provider, cfg.wallpaperTheme);
  }

  function preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = deps.createImage();
      img.onload = () => resolve(url);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function refreshWallpaper({ signature = null, force = false } = {}) {
    const state = deps.getState();
    const cfg = state.ui.background;
    const activeSignature = signature || wallpaperSignature(cfg);
    const token = deps.incrementWallpaperLoadToken();
    const currentSrc = deps.normalizeText(deps.elements.bgImage.getAttribute("src"));
    let hasVisibleSource = Boolean(currentSrc && deps.elements.bgImage.classList.contains("visible"));
    let cachedShown = false;

    if (hasWallpaperCacheRecord(cfg, activeSignature)) {
      const cachedUrl = deps.normalizeText(cfg.wallpaperCachedUrl);
      if (cachedUrl) {
        if (currentSrc === cachedUrl && deps.elements.bgImage.classList.contains("visible")) {
          hasVisibleSource = true;
          cachedShown = true;
          void deps.updateBlurFromImage(cachedUrl);
          deps.requestWallpaperLuminanceSample(cachedUrl);
        } else {
          try {
            const swapped = await preloadAndSwapWallpaper(cachedUrl, token);
            if (swapped) {
              hasVisibleSource = true;
              cachedShown = true;
            }
          } catch {
          }
        }
      }
    }

    const cacheFresh = isWallpaperCacheFresh(cfg, activeSignature);
    if (!force && cacheFresh && (cachedShown || hasVisibleSource)) {
      deps.setWallpaperSourceSignature(activeSignature);
      return;
    }

    let nextUrl = "";
    try {
      nextUrl = await resolveWallpaperUrl(cfg);
      await preloadImage(nextUrl);
    } catch {
      nextUrl = buildSimpleWallpaperUrl("picsum", cfg.wallpaperTheme);
      try {
        await preloadImage(nextUrl);
      } catch {
        nextUrl = "";
      }
    }

    if (!nextUrl || token !== deps.getWallpaperLoadToken()) {
      if (!hasVisibleSource && !cachedShown) {
        deps.elements.bgImage.classList.remove("visible");
        deps.clearBlurLayer();
      }
      return;
    }

    state.ui.background.wallpaperCachedUrl = nextUrl;
    state.ui.background.wallpaperCachedAt = deps.now();
    state.ui.background.wallpaperCachedSignature = activeSignature;
    deps.setWallpaperSourceSignature(activeSignature);
    deps.queueSave({ allowWithoutUserMutation: true });

    applyWallpaperSwap(nextUrl, token);
  }

  function scheduleWallpaperRefresh(signature) {
    deps.clearWallpaperTimer();

    if (deps.getState().ui.background.mode !== "wallpaper") {
      return;
    }

    const cfg = deps.getState().ui.background;
    const period = wallpaperRotateMs(cfg);
    let wait = 1000;

    if (hasWallpaperCacheRecord(cfg, signature)) {
      const age = Math.max(0, deps.now() - Number(cfg.wallpaperCachedAt || 0));
      wait = Math.max(1000, period - age);
    }

    deps.setWallpaperTimer(
      deps.setTimeout(() => {
        if (deps.getState().ui.background.mode !== "wallpaper") {
          return;
        }
        const nextSignature = wallpaperSignature(deps.getState().ui.background);
        void refreshWallpaper({ signature: nextSignature, force: true }).finally(() => {
          scheduleWallpaperRefresh(nextSignature);
        });
      }, wait)
    );
  }

  return {
    wallpaperSignature,
    wallpaperRotateMs,
    hasWallpaperCacheRecord,
    isWallpaperCacheFresh,
    applyWallpaperSwap,
    preloadAndSwapWallpaper,
    buildSimpleWallpaperUrl,
    parseRedditImage,
    fetchRedditWallpaperUrl,
    resolveWallpaperUrl,
    preloadImage,
    refreshWallpaper,
    scheduleWallpaperRefresh
  };
}
