import { clampTruthyNumberOrFallback } from "./utils/number.js";

export function createBackgroundRuntime(deps) {
  function syncBackgroundRefreshButton() {
    const bgRefreshBtn = deps.elements?.bgRefreshBtn;
    if (!bgRefreshBtn) {
      return;
    }

    const state = deps.getState();
    const bgMode = state?.ui?.background?.mode;
    const manualUrl = deps.normalizeText(state?.ui?.background?.videoUrl);
    const localMediaUrl = deps.normalizeText(state?.ui?.background?.localMediaDataUrl);
    const remoteVideoReady =
      bgMode === "video" && !localMediaUrl && (state?.ui?.background?.videoSource === "reddit" || Boolean(manualUrl));
    const canRefresh = bgMode === "wallpaper" || remoteVideoReady;

    bgRefreshBtn.disabled = !canRefresh;
    bgRefreshBtn.classList.toggle("is-disabled", !canRefresh);
    bgRefreshBtn.title = bgMode === "video" ? "Refresh local file" : "Refresh wallpaper";
  }

  function refreshBackgroundNow() {
    const state = deps.getState();
    const mode = state.ui.background.mode;

    if (mode === "wallpaper") {
      const signature = deps.wallpaperSignature(state.ui.background);
      void deps.refreshWallpaper({ signature, force: true }).finally(() => {
        if (deps.getState().ui.background.mode !== "wallpaper") {
          return;
        }
        deps.scheduleWallpaperRefresh(deps.wallpaperSignature(deps.getState().ui.background));
      });
      return;
    }

    if (mode === "video") {
      void deps.loadVideoLoop({ force: true });
    }
  }

  function applyBackground() {
    deps.clearWallpaperTimer();

    const state = deps.getState();
    const cfg = state.ui.background;
    const theme = state.ui.theme;
    const overlay = clampTruthyNumberOrFallback(cfg.overlayOpacity, 0.24, 0, 0.85);

    deps.elements.bgOverlay.style.background = `rgba(8, 11, 16, ${overlay})`;
    deps.elements.bgLayer.style.background = theme.background;
    deps.hideVideo();
    deps.applyBackgroundMediaFitStyles(cfg);
    if (cfg.mode !== "video") {
      deps.incrementVideoLoadToken();
    }
    syncBackgroundRefreshButton();

    if (cfg.mode === "solid") {
      deps.setWallpaperSourceSignature("");
      deps.incrementWallpaperLoadToken();
      deps.elements.bgImage.classList.remove("visible");
      deps.clearBlurLayer();
      deps.elements.bgLayer.style.background = cfg.solidColor || theme.background;
      return;
    }

    if (cfg.mode === "video") {
      deps.setWallpaperSourceSignature("");
      deps.incrementWallpaperLoadToken();
      deps.elements.bgImage.classList.remove("visible");
      deps.clearBlurLayer();

      const localMediaUrl = deps.normalizeText(cfg.localMediaDataUrl);
      deps.elements.bgLayer.style.background = localMediaUrl
        ? deps.normalizeHexColor(cfg.localMediaBackgroundColor, deps.defaultBackground().localMediaBackgroundColor)
        : theme.background;

      const localMediaType = deps.normalizeLocalMediaType(cfg.localMediaType, deps.inferLocalMediaTypeFromDataUrl(localMediaUrl));
      if (localMediaUrl && localMediaType === "image") {
        deps.elements.bgImage.src = localMediaUrl;
        deps.elements.bgImage.classList.add("visible");
        return;
      }
      if (localMediaUrl && localMediaType === "video") {
        deps.elements.bgVideo.src = localMediaUrl;
        deps.elements.bgVideo.load();
        void deps.elements.bgVideo.play().catch(() => {});
        deps.elements.bgVideo.classList.add("visible");
        return;
      }

      void deps.loadVideoLoop({ force: false });
      return;
    }

    if (cfg.mode === "wallpaper") {
      deps.elements.bgLayer.style.background = theme.background;
      const signature = deps.wallpaperSignature(cfg);
      deps.setWallpaperSourceSignature(signature);
      void deps.refreshWallpaper({ signature, force: false }).finally(() => {
        if (deps.getState().ui.background.mode !== "wallpaper") {
          return;
        }
        deps.scheduleWallpaperRefresh(deps.wallpaperSignature(deps.getState().ui.background));
      });
      return;
    }

    deps.setWallpaperSourceSignature("");
    deps.incrementWallpaperLoadToken();
    deps.elements.bgImage.classList.remove("visible");
    deps.clearBlurLayer();

    deps.elements.bgLayer.style.background =
      `radial-gradient(circle at 20% 20%, ${theme.surface} 0 20%, transparent 48%), ` +
      `radial-gradient(circle at 80% 82%, ${theme.secondary}33 0 18%, transparent 50%), ` +
      `linear-gradient(145deg, ${theme.background}, ${theme.accent}22)`;
  }

  return {
    syncBackgroundRefreshButton,
    refreshBackgroundNow,
    applyBackground
  };
}
