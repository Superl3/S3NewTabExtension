export const clockWidget = {
  type: "clock",
  title: "Clock",
  defaultConfig: {
    locale: "ko-KR",
    hour12: false,
    showSeconds: true,
    timeZone: "",
    fontFamily: "mono",
    styleVariant: "minimal",
    textAlign: "center"
  },
  defaultLayout: {
    x: 40,
    y: 40,
    w: 320,
    h: 170
  },
  settingsSchema: [
    { key: "locale", label: "Locale", type: "text", placeholder: "ko-KR" },
    { key: "timeZone", label: "Time zone", type: "text", placeholder: "Asia/Seoul" },
    {
      key: "fontFamily",
      label: "Clock font",
      type: "select",
      options: [
        { value: "mono", label: "Mono" },
        { value: "display", label: "Display" },
        { value: "digital", label: "Digital" }
      ]
    },
    {
      key: "styleVariant",
      label: "Clock style",
      type: "select",
      options: [
        { value: "minimal", label: "Minimal" },
        { value: "tile", label: "Tile" },
        { value: "glow", label: "Glow" }
      ]
    },
    {
      key: "textAlign",
      label: "Text align",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" }
      ]
    },
    { key: "hour12", label: "12-hour", type: "checkbox" },
    { key: "showSeconds", label: "Show seconds", type: "checkbox" }
  ],
  create({ container, getConfig }) {
    const wrap = document.createElement("div");
    wrap.className = "clock-wrap";
    wrap.style.width = "100%";
    const timeEl = document.createElement("div");
    const dateEl = document.createElement("div");
    timeEl.className = "clock-time";
    dateEl.className = "clock-date";
    wrap.append(timeEl, dateEl);
    container.append(wrap);

    let timer = null;

    function applyStyleClasses(cfg) {
      container.classList.remove(
        "clock-font-mono",
        "clock-font-display",
        "clock-font-digital",
        "clock-variant-minimal",
        "clock-variant-tile",
        "clock-variant-glow"
      );

      const font = cfg.fontFamily === "display" || cfg.fontFamily === "digital" ? cfg.fontFamily : "mono";
      const variant = cfg.styleVariant === "tile" || cfg.styleVariant === "glow" ? cfg.styleVariant : "minimal";
      const align = cfg.textAlign === "left" || cfg.textAlign === "right" ? cfg.textAlign : "center";

      container.classList.add(`clock-font-${font}`);
      container.classList.add(`clock-variant-${variant}`);
      wrap.style.justifyItems = align === "left" ? "start" : align === "right" ? "end" : "center";
      timeEl.style.textAlign = align;
      dateEl.style.textAlign = align;
    }

    function render() {
      const cfg = getConfig();
      const now = new Date();
      applyStyleClasses(cfg);
      const locale = cfg.locale || "ko-KR";
      const options = {
        hour: "2-digit",
        minute: "2-digit",
        second: cfg.showSeconds ? "2-digit" : undefined,
        hour12: Boolean(cfg.hour12)
      };
      if (cfg.timeZone) {
        options.timeZone = cfg.timeZone;
      }

      const dateOptions = {
        weekday: "short",
        year: "numeric",
        month: "long",
        day: "numeric"
      };
      if (cfg.timeZone) {
        dateOptions.timeZone = cfg.timeZone;
      }

      timeEl.textContent = now.toLocaleTimeString(locale, options);
      dateEl.textContent = now.toLocaleDateString(locale, dateOptions);
    }

    function start() {
      stop();
      render();
      timer = setInterval(render, 1000);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
      }
      timer = null;
    }

    start();

    return {
      refresh: render,
      destroy: stop
    };
  }
};
