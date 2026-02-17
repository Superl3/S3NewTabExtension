const SEARCH_PROVIDERS = {
  google: {
    label: "Google",
    template: "https://www.google.com/search?q={query}"
  },
  naver: {
    label: "Naver",
    template: "https://search.naver.com/search.naver?query={query}"
  },
  duckduckgo: {
    label: "DuckDuckGo",
    template: "https://duckduckgo.com/?q={query}"
  },
  brave: {
    label: "Brave",
    template: "https://search.brave.com/search?q={query}"
  }
};

const SEARCH_PROVIDER_OPTIONS = Object.entries(SEARCH_PROVIDERS).map(([value, def]) => ({
  value,
  label: def.label
}));

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeProvider(value, fallback = "google") {
  const key = String(value || "").trim().toLowerCase();
  if (key in SEARCH_PROVIDERS) {
    return key;
  }
  return fallback;
}

function inferProviderFromLegacyEngineUrl(engineUrl) {
  const url = normalizeText(engineUrl).toLowerCase();
  if (!url) {
    return "google";
  }
  if (url.includes("search.naver.com")) {
    return "naver";
  }
  if (url.includes("duckduckgo.com")) {
    return "duckduckgo";
  }
  if (url.includes("search.brave.com")) {
    return "brave";
  }
  return "google";
}

function resolveProvider(cfg) {
  if (cfg && typeof cfg.provider === "string") {
    return normalizeProvider(cfg.provider, "google");
  }
  return inferProviderFromLegacyEngineUrl(cfg?.engineUrl);
}

function providerTemplate(provider) {
  return SEARCH_PROVIDERS[normalizeProvider(provider, "google")].template;
}

export const searchWidget = {
  type: "search",
  title: "Search",
  defaultConfig: {
    provider: "google",
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
      key: "provider",
      label: "Search provider",
      type: "select",
      options: SEARCH_PROVIDER_OPTIONS
    },
    { key: "placeholder", label: "Placeholder", type: "text", placeholder: "Search" }
  ],
  create({ container, getConfig, patchConfig }) {
    const form = document.createElement("form");
    const input = document.createElement("input");
    const submit = document.createElement("button");

    form.className = "search-form";
    input.type = "search";
    submit.type = "submit";
    submit.className = "btn btn-primary search-submit-btn";
    submit.title = "Search";
    submit.setAttribute("aria-label", "Search");
    submit.innerHTML = '<svg class="icon"><use href="#i-search"></use></svg>';

    form.append(input, submit);
    container.append(form);

    function applyConfig() {
      const cfg = getConfig();
      if (!cfg.provider && typeof patchConfig === "function") {
        patchConfig({ provider: inferProviderFromLegacyEngineUrl(cfg.engineUrl) });
      }
      input.placeholder = cfg.placeholder || "Search";
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) {
        return;
      }
      const cfg = getConfig();
      const template = providerTemplate(resolveProvider(cfg));
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
