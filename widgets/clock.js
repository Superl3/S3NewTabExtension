export const clockWidget = {
  type: "clock",
  title: "Clock",
  defaultConfig: {
    locale: "ko-KR",
    hour12: false,
    showSeconds: true,
    timeZone: ""
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
    { key: "hour12", label: "12-hour", type: "checkbox" },
    { key: "showSeconds", label: "Show seconds", type: "checkbox" }
  ],
  create({ container, getConfig }) {
    const timeEl = document.createElement("div");
    const dateEl = document.createElement("div");
    timeEl.className = "clock-time";
    dateEl.className = "clock-date";
    container.append(timeEl, dateEl);

    let timer = null;

    function render() {
      const cfg = getConfig();
      const now = new Date();
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
