import { clampTruthyNumberOrFallback } from "./utils/number.js";

export function patchBackgroundRuntime(patch, deps) {
  const state = deps.getState();

  deps.recordHistorySnapshot("Update background settings");
  state.ui.background = {
    ...state.ui.background,
    ...patch
  };

  state.ui.background.wallpaperProvider = deps.normalizeWallpaperProvider(state.ui.background.wallpaperProvider, "picsum");
  state.ui.background.wallpaperTheme = deps.normalizeText(state.ui.background.wallpaperTheme, "nature");
  state.ui.background.redditSubreddit = deps.normalizeText(state.ui.background.redditSubreddit, "EarthPorn");
  state.ui.background.redditTime = deps.normalizeText(state.ui.background.redditTime, "week");
  state.ui.background.rotateMinutes = clampTruthyNumberOrFallback(state.ui.background.rotateMinutes, 15, 1, 240);
  state.ui.background.videoSource = deps.normalizeVideoSource(state.ui.background.videoSource, "manual");
  state.ui.background.videoUrl = deps.normalizeText(state.ui.background.videoUrl);
  state.ui.background.redditVideoSubreddit = deps.normalizeText(state.ui.background.redditVideoSubreddit, "loopingvideos");
  state.ui.background.redditVideoTime = deps.normalizeText(state.ui.background.redditVideoTime, "week");
  state.ui.background.localMediaDataUrl = deps.normalizeText(state.ui.background.localMediaDataUrl);
  state.ui.background.localMediaType = deps.normalizeLocalMediaType(state.ui.background.localMediaType, "");
  if (!state.ui.background.localMediaType && state.ui.background.localMediaDataUrl) {
    state.ui.background.localMediaType = deps.inferLocalMediaTypeFromDataUrl(state.ui.background.localMediaDataUrl);
  }
  state.ui.background.localMediaName = deps.normalizeText(state.ui.background.localMediaName);
  state.ui.background.localMediaBackgroundColor = deps.normalizeHexColor(
    state.ui.background.localMediaBackgroundColor,
    deps.defaultBackground().localMediaBackgroundColor
  );
  state.ui.background.localMediaFit = deps.normalizeLocalMediaFit(state.ui.background.localMediaFit, "stretch");

  const videoFieldsTouched =
    patch && typeof patch === "object"
      ? [
          "videoSource",
          "videoUrl",
          "redditVideoSubreddit",
          "redditVideoTime",
          "localMediaDataUrl",
          "localMediaType",
          "localMediaName"
        ].some((key) => key in patch)
      : false;

  if (videoFieldsTouched) {
    state.ui.background.videoCacheSignature = "";
    state.ui.background.videoCacheStoredAt = 0;
  }

  state.ui.background.blurAmount = clampTruthyNumberOrFallback(state.ui.background.blurAmount, 0, 0, 28);
  state.ui.background.overlayOpacity = clampTruthyNumberOrFallback(state.ui.background.overlayOpacity, 0.24, 0, 0.85);

  deps.applyBackground();
  deps.refreshAllWidgetCardsVisual();
  deps.refreshWidgetsByType("label");
  deps.renderSettings();
  deps.queueSave();
}
