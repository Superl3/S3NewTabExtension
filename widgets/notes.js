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
    let lastSavedContent = "";

    function flushPendingSave() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      const nextContent = textarea.value;
      const currentContent = String(getConfig().content || "");
      if (nextContent === currentContent || nextContent === lastSavedContent) {
        return;
      }

      lastSavedContent = nextContent;
      patchConfig({ content: nextContent });
    }

    function render() {
      const cfg = getConfig();
      const align = cfg.textAlign === "center" || cfg.textAlign === "right" ? cfg.textAlign : "left";
      const configContent = String(cfg.content || "");
      textarea.placeholder = cfg.placeholder || "Write notes";
      textarea.style.textAlign = align;

      if (document.activeElement === textarea) {
        if (timer && textarea.value !== configContent) {
          flushPendingSave();
        }
        return;
      }

      lastSavedContent = configContent;
      if (textarea.value !== configContent) {
        textarea.value = configContent;
      }
    }

    textarea.addEventListener("input", () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        flushPendingSave();
      }, 120);
    });

    textarea.addEventListener("blur", () => {
      flushPendingSave();
    });

    render();

    return {
      refresh: render,
      destroy() {
        flushPendingSave();
      }
    };
  }
};
