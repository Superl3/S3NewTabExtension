export const notesWidget = {
  type: "notes",
  title: "Notes",
  defaultConfig: {
    content: "",
    placeholder: "Write your notes here",
    textAlign: "left"
  },
  defaultLayout: {
    x: 430,
    y: 240,
    w: 390,
    h: 290
  },
  settingsSchema: [
    { key: "placeholder", label: "Placeholder", type: "text", placeholder: "Write notes" },
    {
      key: "textAlign",
      label: "Text align",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" }
      ]
    }
  ],
  create({ container, getConfig, patchConfig }) {
    const textarea = document.createElement("textarea");
    textarea.className = "notes-area";
    container.append(textarea);

    let timer = null;

    function render() {
      const cfg = getConfig();
      const align = cfg.textAlign === "center" || cfg.textAlign === "right" ? cfg.textAlign : "left";
      textarea.placeholder = cfg.placeholder || "Write notes";
      textarea.style.textAlign = align;
      if (textarea.value !== (cfg.content || "")) {
        textarea.value = cfg.content || "";
      }
    }

    textarea.addEventListener("input", () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        patchConfig({ content: textarea.value });
      }, 120);
    });

    render();

    return {
      refresh: render,
      destroy() {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };
  }
};
