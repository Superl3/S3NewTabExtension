function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
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

export const shortcutWidget = {
  type: "shortcut",
  title: "Shortcut",
  defaultConfig: {
    label: "Shortcut",
    url: "https://www.google.com",
    icon: "",
    faviconMode: "site",
    openInNewTab: false
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
      key: "faviconMode",
      label: "Icon source",
      type: "select",
      options: [
        { value: "site", label: "Website favicon" },
        { value: "none", label: "No favicon" }
      ]
    },
    { key: "openInNewTab", label: "Open in new tab", type: "checkbox" }
  ],
  create({ container, getConfig }) {
    const tile = document.createElement("a");
    tile.className = "shortcut-tile";

    const inner = document.createElement("div");
    inner.className = "shortcut-inner";

    const icon = document.createElement("span");
    icon.className = "shortcut-icon";

    const label = document.createElement("span");
    label.className = "shortcut-label";

    inner.append(icon, label);
    tile.append(inner);
    container.append(tile);

    function render() {
      const cfg = getConfig();
      const url = normalizeText(cfg.url, "https://www.google.com");
      const text = normalizeText(cfg.label, "Shortcut");
      const iconValue = normalizeText(cfg.icon);

      tile.href = url;
      tile.target = cfg.openInNewTab ? "_blank" : "_self";
      tile.rel = cfg.openInNewTab ? "noreferrer" : "";
      label.textContent = text;

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
        const img = document.createElement("img");
        img.src = bookmarkFavicon(url);
        img.alt = "";
        icon.append(img);
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
