import { createBackgroundBlurRuntime } from "../background-blur-runtime.js";
import { createBackgroundLocalMediaRuntime } from "../background-local-media-runtime.js";
import { createBackgroundRuntime } from "../background-runtime.js";
import { createBackgroundVideoCacheRuntime } from "../background-video-cache-runtime.js";
import { createBackgroundWallpaperRuntime } from "../background-wallpaper-runtime.js";
import { requestWallpaperLuminanceSample as requestWallpaperLuminanceSampleRuntime } from "../wallpaper-luminance-runtime.js";

export function createAppBackgroundSubsystem(deps) {
  const backgroundBlurRuntime = createBackgroundBlurRuntime({
    elements: deps.elements,
    documentObj: deps.documentObj,
    createImage: deps.createImage,
    clamp: deps.clamp,
    getBlurAmount: deps.getBlurAmount,
    incrementBlurComputeToken: deps.incrementBlurComputeToken,
    getBlurComputeToken: deps.getBlurComputeToken
  });

  function clearBlurLayer() {
    return backgroundBlurRuntime.clearBlurLayer();
  }

  function loadImageForBlur(url) {
    return backgroundBlurRuntime.loadImageForBlur(url);
  }

  function updateBlurFromImage(url) {
    return backgroundBlurRuntime.updateBlurFromImage(url);
  }

  function requestWallpaperLuminanceSample(url) {
    return requestWallpaperLuminanceSampleRuntime(url, {
      normalizeText: deps.normalizeText,
      getSampledWallpaperSource: deps.getSampledWallpaperSource,
      incrementWallpaperSampleToken: deps.incrementWallpaperSampleToken,
      getWallpaperSampleToken: deps.getWallpaperSampleToken,
      elements: deps.elements,
      sampleImageBaseLuminanceFromUrl: deps.sampleImageBaseLuminanceFromUrl,
      getState: deps.getState,
      setSampledWallpaperBaseLuminance: deps.setSampledWallpaperBaseLuminance,
      setSampledWallpaperSource: deps.setSampledWallpaperSource,
      refreshAllWidgetCardsVisual: deps.refreshAllWidgetCardsVisual,
      refreshWidgetsByType: deps.refreshWidgetsByType,
      documentObj: deps.documentObj,
      srgbToLinear: deps.srgbToLinear,
      clamp: deps.clamp
    });
  }

  const backgroundLocalMediaRuntime = createBackgroundLocalMediaRuntime({
    elements: deps.elements,
    normalizeText: deps.normalizeText,
    normalizeLocalMediaFit: deps.normalizeLocalMediaFit,
    normalizeLocalMediaType: deps.normalizeLocalMediaType,
    inferLocalMediaTypeFromDataUrl: deps.inferLocalMediaTypeFromDataUrl,
    createFileReader: deps.createFileReader,
    patchBackground: deps.patchBackground,
    onImportError: deps.onLocalMediaImportError,
    getCurrentVideoObjectUrl: deps.getCurrentVideoObjectUrl,
    setCurrentVideoObjectUrl: deps.setCurrentVideoObjectUrl,
    revokeObjectURL: deps.revokeObjectURL
  });

  function hideVideo() {
    return backgroundLocalMediaRuntime.hideVideo();
  }

  function applyBackgroundMediaFitStyles(cfg) {
    return backgroundLocalMediaRuntime.applyBackgroundMediaFitStyles(cfg);
  }

  function importLocalBackgroundFile(file) {
    return backgroundLocalMediaRuntime.importLocalBackgroundFile(file);
  }

  function releaseVideoObjectUrl() {
    return backgroundLocalMediaRuntime.releaseVideoObjectUrl();
  }

  const backgroundVideoCacheRuntime = createBackgroundVideoCacheRuntime({
    getState: deps.getState,
    elements: deps.elements,
    normalizeText: deps.normalizeText,
    normalizeVideoSource: deps.normalizeVideoSource,
    pickRandom: deps.pickRandom,
    fetch: deps.fetch,
    videoCacheName: deps.videoCacheName,
    videoCacheKeyPrefix: deps.videoCacheKeyPrefix,
    videoCacheMaxEntries: deps.videoCacheMaxEntries,
    clamp: deps.clamp,
    hasCaches: deps.hasCaches,
    openCache: deps.openCache,
    buildVideoCacheKey: deps.buildVideoCacheKey,
    videoConfigSignature: deps.videoConfigSignature,
    incrementVideoLoadToken: deps.incrementVideoLoadToken,
    getVideoLoadToken: deps.getVideoLoadToken,
    hideVideo,
    releaseVideoObjectUrl,
    createObjectURL: deps.createObjectURL,
    revokeObjectURL: deps.revokeObjectURL,
    setCurrentVideoObjectUrl: deps.setCurrentVideoObjectUrl,
    queueSave: deps.queueSave,
    now: deps.now,
    onLoadError: deps.onVideoLoadError
  });

  function loadVideoLoop({ force = false } = {}) {
    return backgroundVideoCacheRuntime.loadVideoLoop({ force });
  }

  const backgroundWallpaperRuntime = createBackgroundWallpaperRuntime({
    getState: deps.getState,
    elements: deps.elements,
    normalizeText: deps.normalizeText,
    clamp: deps.clamp,
    now: deps.now,
    fetch: deps.fetch,
    pickRandom: deps.pickRandom,
    createImage: deps.createImage,
    incrementWallpaperCounter: deps.incrementWallpaperCounter,
    incrementWallpaperLoadToken: deps.incrementWallpaperLoadToken,
    getWallpaperLoadToken: deps.getWallpaperLoadToken,
    setWallpaperSourceSignature: deps.setWallpaperSourceSignature,
    queueSave: deps.queueSave,
    clearBlurLayer,
    updateBlurFromImage,
    requestWallpaperLuminanceSample,
    clearWallpaperTimer: deps.clearWallpaperTimer,
    setWallpaperTimer: deps.setWallpaperTimer,
    setTimeout: deps.setTimeout
  });

  function wallpaperSignature(cfg) {
    return backgroundWallpaperRuntime.wallpaperSignature(cfg);
  }

  function refreshWallpaper({ signature = null, force = false } = {}) {
    return backgroundWallpaperRuntime.refreshWallpaper({ signature, force });
  }

  function scheduleWallpaperRefresh(signature) {
    return backgroundWallpaperRuntime.scheduleWallpaperRefresh(signature);
  }

  const backgroundRuntime = createBackgroundRuntime({
    getState: deps.getState,
    elements: deps.elements,
    clamp: deps.clamp,
    normalizeText: deps.normalizeText,
    normalizeHexColor: deps.normalizeHexColor,
    defaultBackground: deps.defaultBackground,
    normalizeLocalMediaType: deps.normalizeLocalMediaType,
    inferLocalMediaTypeFromDataUrl: deps.inferLocalMediaTypeFromDataUrl,
    clearWallpaperTimer: deps.clearWallpaperTimer,
    hideVideo,
    applyBackgroundMediaFitStyles,
    setWallpaperSourceSignature: deps.setWallpaperSourceSignature,
    incrementWallpaperLoadToken: deps.incrementWallpaperLoadToken,
    incrementVideoLoadToken: deps.incrementVideoLoadToken,
    clearBlurLayer,
    loadVideoLoop,
    wallpaperSignature,
    refreshWallpaper,
    scheduleWallpaperRefresh
  });

  return {
    loadImageForBlur,
    importLocalBackgroundFile,
    syncBackgroundRefreshButton: () => backgroundRuntime.syncBackgroundRefreshButton(),
    refreshBackgroundNow: () => backgroundRuntime.refreshBackgroundNow(),
    applyBackground: () => backgroundRuntime.applyBackground()
  };
}
