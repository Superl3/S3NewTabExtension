const GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_LOCATION_QUERY = "Seoul";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }
  if (typeof error === "string") {
    return normalizeText(error, "Unknown error");
  }
  if (typeof error.message === "string") {
    return normalizeText(error.message, "Unknown error");
  }
  return "Unknown error";
}

function normalizeRefreshMinutes(value, fallback = 30) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 5, 240);
  }
  return clamp(Math.round(num), 5, 240);
}

function normalizeTemperatureUnit(value, fallback = "celsius") {
  const unit = normalizeText(value, fallback).toLowerCase();
  return unit === "fahrenheit" ? "fahrenheit" : "celsius";
}

function normalizeWindSpeedUnit(value, fallback = "kmh") {
  const unit = normalizeText(value, fallback).toLowerCase();
  if (unit === "ms" || unit === "mph" || unit === "kn") {
    return unit;
  }
  return "kmh";
}

function fallbackWindUnitLabel(unit) {
  if (unit === "ms") {
    return "m/s";
  }
  if (unit === "mph") {
    return "mph";
  }
  if (unit === "kn") {
    return "kn";
  }
  return "km/h";
}

function normalizedConfig(config) {
  return {
    locationQuery: normalizeText(config?.locationQuery, DEFAULT_LOCATION_QUERY),
    temperatureUnit: normalizeTemperatureUnit(config?.temperatureUnit, "celsius"),
    windSpeedUnit: normalizeWindSpeedUnit(config?.windSpeedUnit, "kmh"),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, 30),
    showFeelsLike: config?.showFeelsLike !== false,
    showHumidity: config?.showHumidity !== false,
    showWind: config?.showWind !== false
  };
}

function configSignature(config) {
  return [
    config.locationQuery,
    config.temperatureUnit,
    config.windSpeedUnit,
    config.refreshMinutes,
    config.showFeelsLike ? 1 : 0,
    config.showHumidity ? 1 : 0,
    config.showWind ? 1 : 0
  ].join("|");
}

function asFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const WEATHER_CODE_META = {
  0: { label: "Clear", dayIcon: "☀️", nightIcon: "🌙" },
  1: { label: "Mostly clear", dayIcon: "🌤️", nightIcon: "🌙" },
  2: { label: "Partly cloudy", dayIcon: "⛅", nightIcon: "☁️" },
  3: { label: "Overcast", dayIcon: "☁️", nightIcon: "☁️" },
  45: { label: "Fog", dayIcon: "🌫️", nightIcon: "🌫️" },
  48: { label: "Rime fog", dayIcon: "🌫️", nightIcon: "🌫️" },
  51: { label: "Light drizzle", dayIcon: "🌦️", nightIcon: "🌧️" },
  53: { label: "Drizzle", dayIcon: "🌦️", nightIcon: "🌧️" },
  55: { label: "Heavy drizzle", dayIcon: "🌧️", nightIcon: "🌧️" },
  56: { label: "Freezing drizzle", dayIcon: "🌨️", nightIcon: "🌨️" },
  57: { label: "Heavy freezing drizzle", dayIcon: "🌨️", nightIcon: "🌨️" },
  61: { label: "Light rain", dayIcon: "🌦️", nightIcon: "🌧️" },
  63: { label: "Rain", dayIcon: "🌧️", nightIcon: "🌧️" },
  65: { label: "Heavy rain", dayIcon: "🌧️", nightIcon: "🌧️" },
  66: { label: "Freezing rain", dayIcon: "🌨️", nightIcon: "🌨️" },
  67: { label: "Heavy freezing rain", dayIcon: "🌨️", nightIcon: "🌨️" },
  71: { label: "Light snow", dayIcon: "🌨️", nightIcon: "🌨️" },
  73: { label: "Snow", dayIcon: "❄️", nightIcon: "❄️" },
  75: { label: "Heavy snow", dayIcon: "❄️", nightIcon: "❄️" },
  77: { label: "Snow grains", dayIcon: "🌨️", nightIcon: "🌨️" },
  80: { label: "Rain showers", dayIcon: "🌦️", nightIcon: "🌧️" },
  81: { label: "Rain showers", dayIcon: "🌧️", nightIcon: "🌧️" },
  82: { label: "Heavy showers", dayIcon: "⛈️", nightIcon: "⛈️" },
  85: { label: "Snow showers", dayIcon: "🌨️", nightIcon: "🌨️" },
  86: { label: "Heavy snow showers", dayIcon: "❄️", nightIcon: "❄️" },
  95: { label: "Thunderstorm", dayIcon: "⛈️", nightIcon: "⛈️" },
  96: { label: "Thunderstorm + hail", dayIcon: "⛈️", nightIcon: "⛈️" },
  99: { label: "Severe thunderstorm", dayIcon: "⛈️", nightIcon: "⛈️" }
};

function weatherCodeMeta(code) {
  const key = asFiniteNumber(code, -1);
  if (key !== -1 && WEATHER_CODE_META[key]) {
    return WEATHER_CODE_META[key];
  }
  return {
    label: "Weather",
    dayIcon: "🌤️",
    nightIcon: "☁️"
  };
}

function buildLocationLabel(result, fallback = DEFAULT_LOCATION_QUERY) {
  const name = normalizeText(result?.name);
  const admin = normalizeText(result?.admin1);
  const country = normalizeText(result?.country);
  const parts = [name, admin, country].filter(Boolean);
  if (!parts.length) {
    return fallback;
  }
  const unique = [];
  for (const part of parts) {
    if (!unique.includes(part)) {
      unique.push(part);
    }
  }
  return unique.join(", ");
}

function formatTemperature(value, unit = "°C") {
  const num = asFiniteNumber(value, null);
  if (num === null) {
    return "--";
  }
  return `${Math.round(num)}${unit}`;
}

function formatObservedTime(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function fetchWeatherSnapshot(config) {
  const geocodingUrl = new URL(GEOCODING_API_URL);
  geocodingUrl.searchParams.set("name", config.locationQuery);
  geocodingUrl.searchParams.set("count", "1");
  geocodingUrl.searchParams.set("language", "en");
  geocodingUrl.searchParams.set("format", "json");

  const geocodingResponse = await fetch(geocodingUrl.href, {
    cache: "no-store"
  });
  if (!geocodingResponse.ok) {
    throw new Error(`Location lookup failed: HTTP ${geocodingResponse.status}`);
  }

  let geocodingPayload = null;
  try {
    geocodingPayload = await geocodingResponse.json();
  } catch {
    throw new Error("Location lookup parse failed.");
  }

  const place = Array.isArray(geocodingPayload?.results) ? geocodingPayload.results[0] : null;
  if (!place) {
    throw new Error(`Location "${config.locationQuery}" not found.`);
  }

  const latitude = asFiniteNumber(place?.latitude, null);
  const longitude = asFiniteNumber(place?.longitude, null);
  if (latitude === null || longitude === null) {
    throw new Error("Location coordinates are unavailable.");
  }

  const forecastUrl = new URL(FORECAST_API_URL);
  forecastUrl.searchParams.set("latitude", String(latitude));
  forecastUrl.searchParams.set("longitude", String(longitude));
  forecastUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day"
  );
  forecastUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  forecastUrl.searchParams.set("temperature_unit", config.temperatureUnit);
  forecastUrl.searchParams.set("wind_speed_unit", config.windSpeedUnit);
  forecastUrl.searchParams.set("timezone", "auto");

  const forecastResponse = await fetch(forecastUrl.href, {
    cache: "no-store"
  });
  if (!forecastResponse.ok) {
    throw new Error(`Weather request failed: HTTP ${forecastResponse.status}`);
  }

  let forecastPayload = null;
  try {
    forecastPayload = await forecastResponse.json();
  } catch {
    throw new Error("Weather response parse failed.");
  }

  const current = forecastPayload?.current || {};
  const daily = forecastPayload?.daily || {};
  const isDay = asFiniteNumber(current?.is_day, 1) === 1;
  const weatherMeta = weatherCodeMeta(current?.weather_code);
  const temperatureUnit = normalizeText(
    forecastPayload?.current_units?.temperature_2m,
    config.temperatureUnit === "fahrenheit" ? "°F" : "°C"
  );
  const windUnit = normalizeText(
    forecastPayload?.current_units?.wind_speed_10m,
    fallbackWindUnitLabel(config.windSpeedUnit)
  );

  const dailyHighRaw = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max[0] : null;
  const dailyLowRaw = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min[0] : null;

  return {
    locationLabel: buildLocationLabel(place, config.locationQuery),
    conditionLabel: weatherMeta.label,
    conditionIcon: isDay ? weatherMeta.dayIcon : weatherMeta.nightIcon,
    weatherCode: asFiniteNumber(current?.weather_code, null),
    temperature: asFiniteNumber(current?.temperature_2m, null),
    apparentTemperature: asFiniteNumber(current?.apparent_temperature, null),
    humidity: asFiniteNumber(current?.relative_humidity_2m, null),
    windSpeed: asFiniteNumber(current?.wind_speed_10m, null),
    high: asFiniteNumber(dailyHighRaw, null),
    low: asFiniteNumber(dailyLowRaw, null),
    observedAt: normalizeText(current?.time),
    temperatureUnit,
    windUnit
  };
}

function createMetaItem(labelText, valueText) {
  const item = document.createElement("li");
  item.className = "weather-meta-item";

  const label = document.createElement("span");
  label.className = "weather-meta-label";
  label.textContent = labelText;

  const value = document.createElement("strong");
  value.className = "weather-meta-value";
  value.textContent = valueText;

  item.append(label, value);
  return item;
}

export const weatherWidget = {
  type: "weather",
  title: "Weather",
  defaultConfig: {
    locationQuery: DEFAULT_LOCATION_QUERY,
    temperatureUnit: "celsius",
    windSpeedUnit: "kmh",
    refreshMinutes: 30,
    showFeelsLike: true,
    showHumidity: true,
    showWind: true
  },
  defaultLayout: {
    x: 180,
    y: 180,
    w: 360,
    h: 300
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [
    {
      key: "locationQuery",
      label: "Location",
      type: "text",
      placeholder: "Seoul",
      helpText: "City name used for weather lookup."
    },
    {
      key: "temperatureUnit",
      label: "Temperature unit",
      type: "select",
      options: [
        { value: "celsius", label: "Celsius (°C)" },
        { value: "fahrenheit", label: "Fahrenheit (°F)" }
      ]
    },
    {
      key: "windSpeedUnit",
      label: "Wind speed unit",
      type: "select",
      options: [
        { value: "kmh", label: "km/h" },
        { value: "ms", label: "m/s" },
        { value: "mph", label: "mph" },
        { value: "kn", label: "kn" }
      ]
    },
    {
      key: "refreshMinutes",
      label: "Refresh every (minutes)",
      type: "number",
      min: 5,
      max: 240,
      step: 1
    },
    { key: "showFeelsLike", label: "Show feels like", type: "checkbox" },
    { key: "showHumidity", label: "Show humidity", type: "checkbox" },
    { key: "showWind", label: "Show wind", type: "checkbox" }
  ],
  create({ container, getConfig }) {
    container.classList.add("weather-widget");

    const shell = document.createElement("div");
    shell.className = "weather-widget-shell";

    const body = document.createElement("section");
    body.className = "weather-widget-body";

    const top = document.createElement("div");
    top.className = "weather-top";

    const codeBadge = document.createElement("span");
    codeBadge.className = "weather-code-badge";
    codeBadge.textContent = "🌤️ Live";

    const temperature = document.createElement("p");
    temperature.className = "weather-temperature";
    temperature.textContent = "--";

    top.append(codeBadge, temperature);

    const conditionText = document.createElement("p");
    conditionText.className = "weather-condition";
    conditionText.textContent = "Weather";

    const location = document.createElement("p");
    location.className = "weather-location";
    location.textContent = DEFAULT_LOCATION_QUERY;

    const rangeText = document.createElement("p");
    rangeText.className = "weather-range";
    rangeText.textContent = "";
    rangeText.style.display = "none";

    const metaList = document.createElement("ul");
    metaList.className = "weather-meta";

    const emptyText = document.createElement("p");
    emptyText.className = "weather-empty";
    emptyText.textContent = "No weather details yet.";
    emptyText.style.display = "none";

    body.append(top, conditionText, location, rangeText, metaList, emptyText);

    const toolbar = document.createElement("div");
    toolbar.className = "weather-widget-toolbar";

    const status = document.createElement("p");
    status.className = "weather-widget-status";
    status.textContent = "Weather";

    const actions = document.createElement("div");
    actions.className = "weather-widget-actions";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "btn";
    refreshBtn.textContent = "Refresh";

    actions.append(refreshBtn);
    toolbar.append(status, actions);
    shell.append(body, toolbar);
    container.append(shell);

    let weather = null;
    let loading = false;
    let errorMessage = "";
    let lastSignature = "";
    let timer = null;
    let requestSerial = 0;

    function clearRefreshTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function scheduleRefresh() {
      clearRefreshTimer();
      const cfg = normalizedConfig(getConfig());
      const delayMs = normalizeRefreshMinutes(cfg.refreshMinutes, 30) * 60000;
      timer = setTimeout(() => {
        void loadWeather();
      }, delayMs);
    }

    function renderMeta(cfg) {
      metaList.replaceChildren();

      const showEmpty = (text) => {
        emptyText.textContent = text;
        emptyText.style.display = "block";
      };

      if (!weather) {
        showEmpty(loading ? "Loading details..." : "No weather details yet.");
        return;
      }

      const items = [];
      if (cfg.showFeelsLike) {
        items.push(createMetaItem("Feels like", formatTemperature(weather.apparentTemperature, weather.temperatureUnit)));
      }
      if (cfg.showHumidity) {
        const humidityValue = asFiniteNumber(weather.humidity, null);
        items.push(createMetaItem("Humidity", humidityValue === null ? "--" : `${Math.round(humidityValue)}%`));
      }
      if (cfg.showWind) {
        const windValue = asFiniteNumber(weather.windSpeed, null);
        const windText = windValue === null ? "--" : `${Math.round(windValue)} ${weather.windUnit}`;
        items.push(createMetaItem("Wind", windText));
      }

      if (!items.length) {
        showEmpty("All detail chips are disabled.");
        return;
      }

      emptyText.style.display = "none";
      metaList.append(...items);
    }

    function renderStatus() {
      status.classList.toggle("is-error", Boolean(errorMessage));
      status.classList.toggle("is-warning", !loading && !errorMessage && !weather);
      if (loading) {
        status.textContent = "Refreshing weather...";
      } else if (errorMessage) {
        status.textContent = errorMessage;
      } else {
        const observedLabel = weather ? formatObservedTime(weather.observedAt) : "";
        status.textContent = observedLabel ? `Updated ${observedLabel}` : "Weather is up to date.";
      }
      refreshBtn.disabled = loading;
    }

    function renderSummary(cfg) {
      const fallbackTemperatureUnit = cfg.temperatureUnit === "fahrenheit" ? "°F" : "°C";
      location.textContent = weather?.locationLabel || cfg.locationQuery || DEFAULT_LOCATION_QUERY;
      temperature.textContent = formatTemperature(
        weather?.temperature,
        weather?.temperatureUnit || fallbackTemperatureUnit
      );

      if (weather) {
        const weatherCode = asFiniteNumber(weather.weatherCode, null);
        if (weatherCode === null) {
          codeBadge.textContent = `${weather.conditionIcon} Live`;
        } else {
          codeBadge.textContent = `${weather.conditionIcon} WMO ${weatherCode}`;
        }

        conditionText.textContent = weather.conditionLabel;
      } else if (loading) {
        codeBadge.textContent = "🌤️ Loading";
        conditionText.textContent = "Loading weather...";
      } else if (errorMessage) {
        codeBadge.textContent = "⚠️ Error";
        conditionText.textContent = "Weather is unavailable.";
      } else {
        codeBadge.textContent = "🌤️ Live";
        conditionText.textContent = "Weather";
      }

      const hasRange = asFiniteNumber(weather?.high, null) !== null && asFiniteNumber(weather?.low, null) !== null;
      if (hasRange) {
        rangeText.style.display = "block";
        rangeText.textContent = `H ${formatTemperature(weather.high, weather.temperatureUnit)} / L ${formatTemperature(weather.low, weather.temperatureUnit)}`;
      } else {
        rangeText.style.display = "none";
        rangeText.textContent = "";
      }
    }

    function render() {
      const cfg = normalizedConfig(getConfig());
      renderSummary(cfg);
      renderMeta(cfg);
      renderStatus();
    }

    async function loadWeather() {
      const requestId = ++requestSerial;
      loading = true;
      errorMessage = "";
      render();

      try {
        const cfg = normalizedConfig(getConfig());
        const snapshot = await fetchWeatherSnapshot(cfg);
        if (requestId !== requestSerial) {
          return;
        }
        weather = snapshot;
        lastSignature = configSignature(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }
        weather = null;
        errorMessage = normalizeErrorMessage(error);
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
        scheduleRefresh();
      }
    }

    refreshBtn.addEventListener("click", () => {
      void loadWeather();
    });

    render();
    void loadWeather();

    return {
      refresh() {
        render();
        const signature = configSignature(normalizedConfig(getConfig()));
        if (!loading && (!weather || signature !== lastSignature)) {
          void loadWeather();
          return;
        }
        scheduleRefresh();
      },
      destroy() {
        requestSerial += 1;
        clearRefreshTimer();
      }
    };
  }
};
