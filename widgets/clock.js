export const clockWidget = {
  type: "clock",
  title: "Clock",
  defaultConfig: {
    locale: "ko-KR",
    hour12: false,
    showSeconds: true,
    showWeekday: true,
    dateFormat: "yyyy-MM-dd",
    timeZone: "",
    fontFamily: "mono",
    styleVariant: "minimal",
    textAlign: "center",
    timeFontSize: 2.4,
    weekdayFontSize: 0.88,
    shadowed: false
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
    {
      key: "dateFormat",
      label: "Date format",
      type: "select",
      options: [
        { value: "yyyy-MM-dd", label: "yyyy-MM-dd" },
        { value: "yyyy.MM.dd", label: "yyyy.MM.dd" },
        { value: "dd-MM-yyyy", label: "dd-MM-yyyy" },
        { value: "MM/dd/yyyy", label: "MM/dd/yyyy" }
      ]
    },
    { key: "timeFontSize", label: "Time font size (em)", type: "number", min: 1, max: 6, step: 0.1 },
    {
      key: "weekdayFontSize",
      label: "Weekday font size (em)",
      type: "number",
      min: 0.5,
      max: 2.4,
      step: 0.05
    },
    { key: "hour12", label: "12-hour", type: "checkbox" },
    { key: "showSeconds", label: "Show seconds", type: "checkbox" },
    { key: "showWeekday", label: "Show weekday", type: "checkbox" },
    { key: "shadowed", label: "Shadowed", type: "checkbox" }
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
        "clock-variant-glow",
        "clock-shadowed"
      );

      const font = cfg.fontFamily === "display" || cfg.fontFamily === "digital" ? cfg.fontFamily : "mono";
      const variant = cfg.styleVariant === "tile" || cfg.styleVariant === "glow" ? cfg.styleVariant : "minimal";
      const align = cfg.textAlign === "left" || cfg.textAlign === "right" ? cfg.textAlign : "center";
      const timeFontSize = Number.isFinite(Number(cfg.timeFontSize)) ? Number(cfg.timeFontSize) : 2.4;
      const weekdayFontSize = Number.isFinite(Number(cfg.weekdayFontSize)) ? Number(cfg.weekdayFontSize) : 0.88;

      container.classList.add(`clock-font-${font}`);
      container.classList.add(`clock-variant-${variant}`);
      if (cfg.shadowed) {
        container.classList.add("clock-shadowed");
      }
      wrap.style.justifyItems = align === "left" ? "start" : align === "right" ? "end" : "center";
      timeEl.style.textAlign = align;
      dateEl.style.textAlign = align;
      timeEl.style.fontSize = `${Math.min(6, Math.max(1, timeFontSize))}em`;
      dateEl.style.fontSize = `${Math.min(2.4, Math.max(0.5, weekdayFontSize))}em`;
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

      timeEl.textContent = now.toLocaleTimeString(locale, options);
      if (cfg.showWeekday === false) {
        dateEl.style.display = "none";
      } else {
        const weekdayOptions = { weekday: "short" };
        if (cfg.timeZone) {
          weekdayOptions.timeZone = cfg.timeZone;
        }

        const year = now.getFullYear();
        const month = `${now.getMonth() + 1}`.padStart(2, "0");
        const day = `${now.getDate()}`.padStart(2, "0");
        const format = cfg.dateFormat || "yyyy-MM-dd";
        let dateText = format;
        dateText = dateText.replaceAll("yyyy", String(year));
        dateText = dateText.replaceAll("MM", month);
        dateText = dateText.replaceAll("dd", day);

        const weekday = now.toLocaleDateString(locale, weekdayOptions);
        dateEl.style.display = "block";
        dateEl.textContent = `${dateText} ${weekday}`;
      }
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
