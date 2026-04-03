export function buildBackgroundSettingFields(background = {}) {
  const modeSchema = {
    key: "mode",
    label: "Mode",
    type: "select",
    options: [
      { value: "gradient", label: "Gradient" },
      { value: "solid", label: "Solid color" },
      { value: "wallpaper", label: "Wallpaper rotation" },
      { value: "video", label: "Local File" }
    ]
  };

  const fields = [];
  if (background.mode !== "video") {
    fields.push(modeSchema);
  }

  if (background.mode === "solid") {
    fields.push({ key: "solidColor", label: "Solid color", type: "color" });
  }

  if (background.mode === "wallpaper") {
    fields.push(
      {
        key: "wallpaperProvider",
        label: "Wallpaper source",
        type: "select",
        options: [
          { value: "picsum", label: "Picsum" },
          { value: "unsplash", label: "Unsplash Source" },
          { value: "reddit", label: "Reddit" }
        ]
      },
      { key: "wallpaperTheme", label: "Wallpaper theme", type: "text", placeholder: "nature, city, sea" }
    );

    if (background.wallpaperProvider === "reddit") {
      fields.push(
        { key: "redditSubreddit", label: "Reddit subreddit", type: "text", placeholder: "EarthPorn" },
        {
          key: "redditTime",
          label: "Reddit time range",
          type: "select",
          options: [
            { value: "hour", label: "hour" },
            { value: "day", label: "day" },
            { value: "week", label: "week" },
            { value: "month", label: "month" },
            { value: "year", label: "year" },
            { value: "all", label: "all" }
          ]
        }
      );
    }

    fields.push(
      { key: "rotateMinutes", label: "Rotate every (minutes)", type: "number", min: 1, max: 240, step: 1 },
      { key: "blurAmount", label: "Background blur", type: "number", min: 0, max: 28, step: 1 }
    );
  }

  if (background.mode === "video") {
    fields.push(
      {
        key: "localMediaBackgroundColor",
        label: "Empty space color",
        type: "color"
      },
      {
        key: "localMediaFit",
        label: "Fit mode",
        type: "select",
        options: [
          { value: "stretch", label: "Stretch" },
          { value: "fit-height", label: "Fit height" },
          { value: "fit-width", label: "Fit width" },
          { value: "original-resolution", label: "Original resolution" }
        ]
      }
    );
  }

  fields.push({ key: "overlayOpacity", label: "Overlay opacity", type: "number", min: 0, max: 0.85, step: 0.05 });

  return {
    modeSchema,
    fields
  };
}
