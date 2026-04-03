function sampleImageBaseLuminanceFromElement(image, deps) {
  if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("backdrop-luminance:image-not-ready");
  }

  const sampleSize = 24;
  const canvas = deps.documentObj.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("backdrop-luminance:no-canvas");
  }

  ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
  const pixels = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
  let luminanceSum = 0;
  let alphaWeight = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha <= 0.01) {
      continue;
    }
    const lum =
      0.2126 * deps.srgbToLinear(pixels[i]) +
      0.7152 * deps.srgbToLinear(pixels[i + 1]) +
      0.0722 * deps.srgbToLinear(pixels[i + 2]);
    luminanceSum += lum * alpha;
    alphaWeight += alpha;
  }

  if (alphaWeight <= 0) {
    throw new Error("backdrop-luminance:no-pixels");
  }

  return deps.clamp(luminanceSum / alphaWeight, 0, 1);
}

export function requestWallpaperLuminanceSample(url, deps) {
  const source = deps.normalizeText(url);
  if (!source || deps.getSampledWallpaperSource() === source) {
    return;
  }

  const token = deps.incrementWallpaperSampleToken();
  void (async () => {
    try {
      let baseLum;
      const bgImage = deps.elements.bgImage;
      const currentSrc = deps.normalizeText(bgImage.currentSrc || bgImage.getAttribute("src"));
      const canSampleCurrentImage =
        currentSrc === source &&
        bgImage.complete &&
        bgImage.naturalWidth > 0 &&
        bgImage.naturalHeight > 0;

      if (canSampleCurrentImage) {
        try {
          baseLum = sampleImageBaseLuminanceFromElement(bgImage, deps);
        } catch {
          baseLum = await deps.sampleImageBaseLuminanceFromUrl(source);
        }
      } else {
        baseLum = await deps.sampleImageBaseLuminanceFromUrl(source);
      }

      if (token !== deps.getWallpaperSampleToken() || deps.getState()?.ui?.background?.mode !== "wallpaper") {
        return;
      }

      deps.setSampledWallpaperBaseLuminance(baseLum);
      deps.setSampledWallpaperSource(source);
    } catch {
      if (token !== deps.getWallpaperSampleToken()) {
        return;
      }
      deps.setSampledWallpaperBaseLuminance(null);
      deps.setSampledWallpaperSource(source);
    }

    deps.refreshAllWidgetCardsVisual();
    deps.refreshWidgetsByType("label");
  })();
}
