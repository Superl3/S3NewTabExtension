export function createBackgroundLocalMediaRuntime(deps) {
  function releaseVideoObjectUrl() {
    const currentVideoObjectUrl = deps.getCurrentVideoObjectUrl();
    if (!currentVideoObjectUrl) {
      return;
    }

    try {
      deps.revokeObjectURL(currentVideoObjectUrl);
    } catch {
    }
    deps.setCurrentVideoObjectUrl("");
  }

  function hideVideo() {
    deps.elements.bgVideo.classList.remove("visible");
    deps.elements.bgVideo.pause();
    if (deps.elements.bgVideo.getAttribute("src")) {
      deps.elements.bgVideo.removeAttribute("src");
      deps.elements.bgVideo.load();
    }
    releaseVideoObjectUrl();
  }

  function resetBackgroundMediaFrame(target) {
    target.style.inset = "0";
    target.style.left = "0";
    target.style.top = "0";
    target.style.width = "100%";
    target.style.height = "100%";
    target.style.maxWidth = "none";
    target.style.maxHeight = "none";
    target.style.transform = "none";
    target.style.objectFit = "cover";
  }

  function applyBackgroundLocalFit(target, fitMode) {
    resetBackgroundMediaFrame(target);
    const mode = deps.normalizeLocalMediaFit(fitMode, "stretch");
    if (mode === "stretch") {
      target.style.objectFit = "fill";
      return;
    }

    target.style.objectFit = "contain";

    if (mode === "fit-height") {
      target.style.inset = "auto";
      target.style.left = "50%";
      target.style.top = "0";
      target.style.width = "auto";
      target.style.height = "100%";
      target.style.transform = "translateX(-50%)";
      return;
    }

    if (mode === "fit-width") {
      target.style.inset = "auto";
      target.style.left = "0";
      target.style.top = "50%";
      target.style.width = "100%";
      target.style.height = "auto";
      target.style.transform = "translateY(-50%)";
      return;
    }

    target.style.inset = "auto";
    target.style.left = "50%";
    target.style.top = "50%";
    target.style.width = "auto";
    target.style.height = "auto";
    target.style.objectFit = "none";
    target.style.transform = "translate(-50%, -50%)";
  }

  function applyBackgroundMediaFitStyles(cfg) {
    if (cfg?.mode === "video" && deps.normalizeText(cfg?.localMediaDataUrl)) {
      const fitMode = deps.normalizeLocalMediaFit(cfg.localMediaFit, "stretch");
      applyBackgroundLocalFit(deps.elements.bgImage, fitMode);
      applyBackgroundLocalFit(deps.elements.bgVideo, fitMode);
      return;
    }
    resetBackgroundMediaFrame(deps.elements.bgImage);
    resetBackgroundMediaFrame(deps.elements.bgVideo);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = deps.createFileReader();
      reader.onload = () => {
        resolve(deps.normalizeText(reader.result));
      };
      reader.onerror = () => {
        reject(new Error("local-media-read-failed"));
      };
      reader.readAsDataURL(file);
    });
  }

  async function importLocalBackgroundFile(file) {
    if (!file) {
      return;
    }
    const mimeType = deps.normalizeText(file.type).toLowerCase();
    const mediaType = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "";
    if (!mediaType) {
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const inferredType = deps.normalizeLocalMediaType(mediaType || deps.inferLocalMediaTypeFromDataUrl(dataUrl), "");
      if (!dataUrl || !inferredType) {
        return;
      }
      deps.patchBackground({
        localMediaDataUrl: dataUrl,
        localMediaType: inferredType,
        localMediaName: deps.normalizeText(file.name)
      });
    } catch (error) {
      deps.onImportError(error);
    }
  }

  return {
    releaseVideoObjectUrl,
    hideVideo,
    resetBackgroundMediaFrame,
    applyBackgroundLocalFit,
    applyBackgroundMediaFitStyles,
    readFileAsDataUrl,
    importLocalBackgroundFile
  };
}
