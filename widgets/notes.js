export const notesWidget = {
  type: "notes",
  title: "Notes",
  defaultConfig: {
    content: "",
    placeholder: "Write your notes here"
  },
  defaultLayout: {
    x: 430,
    y: 240,
    w: 390,
    h: 290
  },
  settingsSchema: [
    { key: "placeholder", label: "Placeholder", type: "text", placeholder: "Write notes" }
  ],
  create({ container, getConfig, patchConfig }) {
    const textarea = document.createElement("textarea");
    textarea.className = "notes-area";
    container.append(textarea);

    let timer = null;

    function render() {
      const cfg = getConfig();
      textarea.placeholder = cfg.placeholder || "Write notes";
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
