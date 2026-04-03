export function createBackgroundVideoCacheRuntime(deps) {
  function parseRedditLoopVideoUrl(post) {
    if (!post || typeof post !== "object") {
      return "";
    }

    const candidates = [];
    const redditVideo = post?.secure_media?.reddit_video || post?.media?.reddit_video;
    if (redditVideo?.fallback_url) {
      candidates.push(redditVideo.fallback_url);
    }

    const previewVideo = post?.preview?.videos?.[0];
    if (previewVideo) {
      const variants = Array.isArray(previewVideo?.variants) ? previewVideo.variants : [];
      for (const variant of variants) {
        if (variant?.url) {
          candidates.push(variant.url);
        }
      }
    }

    if (typeof post.url_overridden_by_dest === "string") {
      candidates.push(post.url_overridden_by_dest);
    }
    if (typeof post.url === "string") {
      candidates.push(post.url);
    }

    for (const raw of candidates) {
      if (!raw) {
        continue;
      }
      const decoded = String(raw).replaceAll("&amp;", "&");
      if (!decoded.startsWith("http")) {
        continue;
      }
      if (/\.mp4(\?.*)?$/i.test(decoded) || decoded.includes("v.redd.it")) {
        return decoded;
      }
    }

    return "";
  }

  async function fetchRedditLoopVideoUrl(cfg) {
    const subreddit = deps.normalizeText(cfg.redditVideoSubreddit, "loopingvideos").replace(/^r\//i, "");
    const allowedTimes = new Set(["hour", "day", "week", "month", "year", "all"]);
    const timeRange = allowedTimes.has(cfg.redditVideoTime) ? cfg.redditVideoTime : "week";
    const endpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${timeRange}&limit=80`;
    const response = await deps.fetch(endpoint, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`reddit-video:${response.status}`);
    }

    const data = await response.json();
    const candidates = (data?.data?.children || [])
      .map((entry) => parseRedditLoopVideoUrl(entry?.data || {}))
      .filter(Boolean);
    const pick = deps.pickRandom(candidates);
    if (!pick) {
      throw new Error("reddit:video-not-found");
    }
    return pick;
  }

  async function resolveVideoRemoteUrl(cfg) {
    const source = deps.normalizeVideoSource(cfg?.videoSource, "manual");
    if (source === "reddit") {
      return fetchRedditLoopVideoUrl(cfg);
    }
    const manualUrl = deps.normalizeText(cfg?.videoUrl);
    if (!manualUrl) {
      throw new Error("video:missing-url");
    }
    return manualUrl;
  }

  async function fetchLoopVideoResponse(url) {
    const response = await deps.fetch(url, {
      cache: "no-store"
    });
    if (!response.ok) {
      throw new Error(`loop-video:${response.status}`);
    }
    return response;
  }

  function isLoopVideoCacheRequest(request) {
    if (!request) {
      return false;
    }
    const key = typeof request === "string" ? request : request.url;
    return deps.normalizeText(key).startsWith(deps.videoCacheKeyPrefix);
  }

  async function pruneLoopVideoCache(cache, keepCount = deps.videoCacheMaxEntries) {
    const boundedKeepCount = deps.clamp(Number(keepCount) || deps.videoCacheMaxEntries, 1, 24);
    const keys = await cache.keys();
    const videoKeys = keys.filter((request) => isLoopVideoCacheRequest(request));
    const overflow = Math.max(0, videoKeys.length - boundedKeepCount);
    if (!overflow) {
      return;
    }

    const staleEntries = videoKeys.slice(0, overflow);
    await Promise.all(staleEntries.map((request) => cache.delete(request)));
  }

  async function ensureCachedLoopVideoResponse(cfg, signature, { force = false } = {}) {
    const remoteUrl = await resolveVideoRemoteUrl(cfg);
    const cacheKey = deps.buildVideoCacheKey(signature);

    if (!cacheKey || !deps.hasCaches()) {
      return fetchLoopVideoResponse(remoteUrl);
    }

    const cache = await deps.openCache(deps.videoCacheName);
    if (force) {
      await cache.delete(cacheKey);
    }

    if (!force) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return cached.clone();
      }
    }

    const response = await fetchLoopVideoResponse(remoteUrl);
    try {
      await cache.put(cacheKey, response.clone());
      try {
        await pruneLoopVideoCache(cache);
      } catch {
      }
    } catch {
    }
    return response;
  }

  async function loadVideoLoop({ force = false } = {}) {
    const state = deps.getState();
    const cfg = state.ui.background;
    if (cfg.mode !== "video") {
      return;
    }

    const signature = deps.videoConfigSignature(cfg);
    const token = deps.incrementVideoLoadToken();
    deps.hideVideo();
    deps.releaseVideoObjectUrl();

    try {
      const response = await ensureCachedLoopVideoResponse(cfg, signature, { force });
      if (token !== deps.getVideoLoadToken()) {
        return;
      }
      const blob = await response.blob();
      if (token !== deps.getVideoLoadToken()) {
        return;
      }
      const objectUrl = deps.createObjectURL(blob);
      if (token !== deps.getVideoLoadToken()) {
        deps.revokeObjectURL(objectUrl);
        return;
      }
      deps.releaseVideoObjectUrl();
      deps.setCurrentVideoObjectUrl(objectUrl);
      deps.elements.bgVideo.src = objectUrl;
      deps.elements.bgVideo.load();
      void deps.elements.bgVideo.play().catch(() => {});
      deps.elements.bgVideo.classList.add("visible");
      deps.elements.bgVideo.style.filter = "none";
      cfg.videoCacheSignature = signature;
      cfg.videoCacheStoredAt = deps.now();
      deps.queueSave({ allowWithoutUserMutation: true });
    } catch (error) {
      if (token !== deps.getVideoLoadToken()) {
        return;
      }
      deps.onLoadError(error);
    }
  }

  return {
    parseRedditLoopVideoUrl,
    fetchRedditLoopVideoUrl,
    resolveVideoRemoteUrl,
    fetchLoopVideoResponse,
    isLoopVideoCacheRequest,
    pruneLoopVideoCache,
    ensureCachedLoopVideoResponse,
    loadVideoLoop
  };
}
