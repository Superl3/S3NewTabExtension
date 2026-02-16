function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const labelWidget = {
  type: "label",
  title: "Label",
  defaultConfig: {
    text: "Your Label",
    color: "#ffffff",
    fontSize: 36,
    fontWeight: 700,
    align: "center"
  },
  defaultLayout: {
    x: 580,
    y: 570,
    w: 560,
    h: 150
  },
  settingsSchema: [
    { key: "text", label: "Text", type: "textarea", placeholder: "Type your text" },
    { key: "color", label: "Text color", type: "color" },
    { key: "fontSize", label: "Font size", type: "number", min: 12, max: 128, step: 1 },
    { key: "fontWeight", label: "Font weight", type: "number", min: 200, max: 900, step: 100 },
    {
      key: "align",
      label: "Align",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" }
      ]
    }
  ],
  create({ container, getConfig }) {
    const text = document.createElement("div");
    text.className = "label-widget-text";
    container.append(text);

    function render() {
      const cfg = getConfig();
      const align = ["left", "center", "right"].includes(cfg.align) ? cfg.align : "center";
      text.textContent = cfg.text || "";
      text.style.color = cfg.color || "#ffffff";
      text.style.fontSize = `${clamp(Number(cfg.fontSize) || 36, 12, 128)}px`;
      text.style.fontWeight = String(clamp(Number(cfg.fontWeight) || 700, 200, 900));
      text.style.textAlign = align;
      text.style.justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    }

    render();

    return {
      refresh: render
    };
  }
};
