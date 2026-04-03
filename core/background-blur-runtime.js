export function createBackgroundBlurRuntime(deps) {
  function clearBlurLayer() {
    deps.incrementBlurComputeToken();
    deps.elements.bgBlurImage.classList.remove("visible");
    deps.elements.bgBlurImage.style.filter = "none";
    if (deps.elements.bgBlurImage.getAttribute("src")) {
      deps.elements.bgBlurImage.removeAttribute("src");
    }
    deps.documentObj.documentElement.style.setProperty("--bg-sharp-opacity", "1");
    deps.documentObj.documentElement.style.setProperty("--bg-blur-opacity", "0");
  }

  function loadImageForBlur(url) {
    return new Promise((resolve, reject) => {
      const img = deps.createImage();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function buildPrecomputedBlurData(url, amount) {
    const source = await loadImageForBlur(url);
    const targetMax = 820;
    const scale = Math.min(1, targetMax / Math.max(source.width, source.height));
    const width = Math.max(24, Math.round(source.width * scale));
    const height = Math.max(24, Math.round(source.height * scale));

    const canvas = deps.documentObj.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("canvas-context");
    }

    ctx.filter = `blur(${Math.max(1, Math.round(amount))}px)`;
    ctx.drawImage(source, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", 0.82);
  }

  async function updateBlurFromImage(url) {
    const blur = deps.clamp(Number(deps.getBlurAmount()) || 0, 0, 28);
    if (blur <= 0 || !url) {
      clearBlurLayer();
      return;
    }

    const token = deps.incrementBlurComputeToken();
    deps.documentObj.documentElement.style.setProperty("--bg-sharp-opacity", "0.38");
    deps.documentObj.documentElement.style.setProperty("--bg-blur-opacity", "0.95");

    try {
      const dataUrl = await buildPrecomputedBlurData(url, blur);
      if (token !== deps.getBlurComputeToken()) {
        return;
      }
      deps.elements.bgBlurImage.src = dataUrl;
      deps.elements.bgBlurImage.style.filter = "none";
      deps.elements.bgBlurImage.classList.add("visible");
    } catch {
      if (token !== deps.getBlurComputeToken()) {
        return;
      }
      deps.elements.bgBlurImage.src = url;
      deps.elements.bgBlurImage.style.filter = `blur(${Math.max(1, blur)}px)`;
      deps.elements.bgBlurImage.classList.add("visible");
    }
  }

  return {
    clearBlurLayer,
    loadImageForBlur,
    buildPrecomputedBlurData,
    updateBlurFromImage
  };
}
