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

    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = null;
    }

    function resolveDateParts(now, timeZone) {
      const options = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      };
      if (timeZone) {
        options.timeZone = timeZone;
      }
      let parts = [];
      try {
        parts = new Intl.DateTimeFormat("en-CA", options).formatToParts(now);
      } catch {
        try {
          parts = new Intl.DateTimeFormat("en-CA", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
          }).formatToParts(now);
        } catch {
          const year = String(now.getFullYear());
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const day = String(now.getDate()).padStart(2, "0");
          return { year, month, day };
        }
      }
      let year = "0000";
      let month = "01";
      let day = "01";

      for (const part of parts) {
        if (part.type === "year") {
          year = part.value;
        } else if (part.type === "month") {
          month = part.value;
        } else if (part.type === "day") {
          day = part.value;
        }
      }

      return { year, month, day };
    }

    function formatTimeSafe(now, locale, options) {
      try {
        return now.toLocaleTimeString(locale, options);
      } catch {
        const fallbackOptions = {
          hour: options.hour,
          minute: options.minute,
          second: options.second,
          hour12: options.hour12
        };
        try {
          return now.toLocaleTimeString(locale || "ko-KR", fallbackOptions);
        } catch {
          try {
            return now.toLocaleTimeString("ko-KR", fallbackOptions);
          } catch {
            const hours = String(now.getHours()).padStart(2, "0");
            const minutes = String(now.getMinutes()).padStart(2, "0");
            if (!options.second) {
              return `${hours}:${minutes}`;
            }
            const seconds = String(now.getSeconds()).padStart(2, "0");
            return `${hours}:${minutes}:${seconds}`;
          }
        }
      }
    }

    function formatWeekdaySafe(now, locale, timeZone) {
      const weekdayOptions = { weekday: "short" };
      if (timeZone) {
        weekdayOptions.timeZone = timeZone;
      }
      try {
        return now.toLocaleDateString(locale, weekdayOptions);
      } catch {
        try {
          return now.toLocaleDateString(locale || "ko-KR", { weekday: "short" });
        } catch {
          try {
            return now.toLocaleDateString("ko-KR", { weekday: "short" });
          } catch {
            return now.toDateString().split(" ")[0] || "";
          }
        }
      }
    }

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
      const timeZone = cfg.timeZone || undefined;
      const options = {
        hour: "2-digit",
        minute: "2-digit",
        second: cfg.showSeconds ? "2-digit" : undefined,
        hour12: Boolean(cfg.hour12),
        timeZone
      };

      timeEl.textContent = formatTimeSafe(now, locale, options);
      if (cfg.showWeekday === false) {
        dateEl.style.display = "none";
      } else {
        const { year, month, day } = resolveDateParts(now, timeZone);

        const format = cfg.dateFormat || "yyyy-MM-dd";
        let dateText = format;
        dateText = dateText.replaceAll("yyyy", year);
        dateText = dateText.replaceAll("MM", month);
        dateText = dateText.replaceAll("dd", day);

        const weekday = formatWeekdaySafe(now, locale, timeZone);
        dateEl.style.display = "block";
        dateEl.textContent = `${dateText} ${weekday}`;
      }
    }

    function scheduleNextTick() {
      clearTimer();
      const cfg = getConfig();
      const intervalMs = cfg.showSeconds ? 1000 : 60000;
      const minDelayMs = cfg.showSeconds ? 25 : 250;
      const delayMs = Math.max(minDelayMs, intervalMs - (Date.now() % intervalMs));
      timer = setTimeout(() => {
        render();
        scheduleNextTick();
      }, delayMs);
    }

    function start() {
      clearTimer();
      render();
      scheduleNextTick();
    }

    function stop() {
      clearTimer();
    }

    start();

    return {
      refresh: start,
      destroy: stop
    };
  }
};
