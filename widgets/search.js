export const searchWidget = {
  type: "search",
  title: "Search",
  defaultConfig: {
    engineUrl: "https://www.google.com/search?q={query}",
    placeholder: "Search the web"
  },
  defaultLayout: {
    x: 390,
    y: 40,
    w: 430,
    h: 120
  },
  settingsSchema: [
    {
      key: "engineUrl",
      label: "Search URL",
      type: "text",
      placeholder: "https://www.google.com/search?q={query}"
    },
    { key: "placeholder", label: "Placeholder", type: "text", placeholder: "Search" }
  ],
  create({ container, getConfig }) {
    const form = document.createElement("form");
    const input = document.createElement("input");
    const submit = document.createElement("button");

    form.className = "search-form";
    input.type = "search";
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = "Go";

    form.append(input, submit);
    container.append(form);

    function applyConfig() {
      const cfg = getConfig();
      input.placeholder = cfg.placeholder || "Search";
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) {
        return;
      }
      const cfg = getConfig();
      const template = cfg.engineUrl || "https://www.google.com/search?q={query}";
      const url = template.includes("{query}")
        ? template.replace("{query}", encodeURIComponent(query))
        : `${template}${encodeURIComponent(query)}`;
      window.location.href = url;
    });

    applyConfig();

    return {
      refresh: applyConfig
    };
  }
};
