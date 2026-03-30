const GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_LOCATION_QUERY = "Seoul";
const WEATHER_CACHE_PREFIX = "s3newtab:weather-cache:v1";
const WEATHER_CACHE_MAX_ENTRIES = 12;
const WEATHER_CACHE_INDEX_KEY = `${WEATHER_CACHE_PREFIX}:__index__`;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function tryParseJson(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function normalizeDetailMode(value, fallback = "simple") {
  const mode = normalizeText(value, fallback).toLowerCase();
  return mode === "advanced" ? "advanced" : "simple";
}

function normalizedConfig(config) {
  return {
    locationQuery: normalizeText(config?.locationQuery, DEFAULT_LOCATION_QUERY),
    temperatureUnit: normalizeTemperatureUnit(config?.temperatureUnit, "celsius"),
    detailMode: normalizeDetailMode(config?.detailMode, "simple"),
    refreshMinutes: normalizeRefreshMinutes(config?.refreshMinutes, 30)
  };
}

function configSignature(config) {
  return [normalizeText(config.locationQuery).toLowerCase(), config.temperatureUnit].join("|");
}

function weatherCacheStorageKey(config) {
  return `${WEATHER_CACHE_PREFIX}:${encodeURIComponent(configSignature(config))}`;
}

function refreshIntervalMs(refreshMinutes) {
  return normalizeRefreshMinutes(refreshMinutes, 30) * 60000;
}

function computeNextRefreshDelayMs(refreshMinutes, fetchedAt = 0) {
  const intervalMs = refreshIntervalMs(refreshMinutes);
  const timestamp = Number(fetchedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return intervalMs;
  }
  const elapsed = Date.now() - timestamp;
  return clamp(Math.round(intervalMs - elapsed), 1000, intervalMs);
}

function isFreshCache(fetchedAt, refreshMinutes) {
  const timestamp = Number(fetchedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return false;
  }
  return Date.now() - timestamp < refreshIntervalMs(refreshMinutes);
}

function readWeatherCache(config) {
  if (typeof localStorage === "undefined") {
    return null;
  }
  let raw = "";
  try {
    raw = localStorage.getItem(weatherCacheStorageKey(config)) || "";
  } catch {
    return null;
  }
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const snapshot = parsed.snapshot;
  const fetchedAt = Number(parsed.fetchedAt);
  if (!snapshot || typeof snapshot !== "object" || !Number.isFinite(fetchedAt) || fetchedAt <= 0) {
    return null;
  }
  return {
    snapshot,
    fetchedAt: Math.round(fetchedAt)
  };
}

function writeWeatherCache(config, snapshot, fetchedAt) {
  if (typeof localStorage === "undefined") {
    return;
  }
  const timestamp = Number.isFinite(Number(fetchedAt)) ? Math.round(Number(fetchedAt)) : Date.now();
  const payload = {
    fetchedAt: Math.max(1, timestamp),
    snapshot
  };
  try {
    const cacheKey = weatherCacheStorageKey(config);
    localStorage.setItem(cacheKey, JSON.stringify(payload));
    touchWeatherCacheIndex(cacheKey, payload.fetchedAt, WEATHER_CACHE_MAX_ENTRIES);
  } catch {
    // noop
  }
}

function readWeatherCacheIndex() {
  const parsed = tryParseJson(localStorage.getItem(WEATHER_CACHE_INDEX_KEY) || "");
  if (!Array.isArray(parsed)) {
    return scanWeatherCacheEntries();
  }
  return parsed
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const key = normalizeText(entry.key);
      const fetchedAt = Number(entry.fetchedAt);
      if (!key || !key.startsWith(`${WEATHER_CACHE_PREFIX}:`) || key === WEATHER_CACHE_INDEX_KEY) {
        return null;
      }
      return {
        key,
        fetchedAt: Number.isFinite(fetchedAt) ? Math.max(0, Math.floor(fetchedAt)) : 0
      };
    })
    .filter(Boolean);
}

function scanWeatherCacheEntries() {
  const entries = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(`${WEATHER_CACHE_PREFIX}:`) || key === WEATHER_CACHE_INDEX_KEY) {
      continue;
    }
    const parsed = tryParseJson(localStorage.getItem(key) || "");
    const fetchedAt = Number(parsed?.fetchedAt);
    entries.push({
      key,
      fetchedAt: Number.isFinite(fetchedAt) ? Math.max(0, Math.floor(fetchedAt)) : 0
    });
  }
  entries.sort((left, right) => right.fetchedAt - left.fetchedAt);
  return entries;
}

function writeWeatherCacheIndex(entries) {
  localStorage.setItem(WEATHER_CACHE_INDEX_KEY, JSON.stringify(entries));
}

function touchWeatherCacheIndex(key, fetchedAt, limit) {
  const entries = readWeatherCacheIndex().filter((entry) => entry.key !== key);
  entries.push({ key, fetchedAt: Math.max(0, Number(fetchedAt) || 0) });
  entries.sort((left, right) => right.fetchedAt - left.fetchedAt);

  const maxEntries = Math.max(1, Number(limit) || WEATHER_CACHE_MAX_ENTRIES);
  const trimmed = entries.slice(0, maxEntries);
  for (const entry of entries.slice(maxEntries)) {
    try {
      localStorage.removeItem(entry.key);
    } catch {
      // noop
    }
  }

  writeWeatherCacheIndex(trimmed);
}

function pruneWeatherCacheEntries(maxEntries = WEATHER_CACHE_MAX_ENTRIES) {
  if (typeof localStorage === "undefined") {
    return;
  }

  const limit = Math.max(1, Number(maxEntries) || WEATHER_CACHE_MAX_ENTRIES);
  const entries = readWeatherCacheIndex();

  if (entries.length <= limit) {
    writeWeatherCacheIndex(entries);
    return;
  }

  entries.sort((left, right) => right.fetchedAt - left.fetchedAt);
  const kept = entries.slice(0, limit);
  for (const entry of entries.slice(limit)) {
    try {
      localStorage.removeItem(entry.key);
    } catch {
      // noop
    }
  }
  writeWeatherCacheIndex(kept);
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
  forecastUrl.searchParams.set("wind_speed_unit", "kmh");
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
  const windUnit = normalizeText(forecastPayload?.current_units?.wind_speed_10m, "km/h");

  const dailyHighRaw = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max[0] : null;
  const dailyLowRaw = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min[0] : null;

  return {
    locationLabel: buildLocationLabel(place, config.locationQuery),
    conditionLabel: weatherMeta.label,
    conditionIcon: isDay ? weatherMeta.dayIcon : weatherMeta.nightIcon,
    temperature: asFiniteNumber(current?.temperature_2m, null),
    apparentTemperature: asFiniteNumber(current?.apparent_temperature, null),
    humidity: asFiniteNumber(current?.relative_humidity_2m, null),
    windSpeed: asFiniteNumber(current?.wind_speed_10m, null),
    high: asFiniteNumber(dailyHighRaw, null),
    low: asFiniteNumber(dailyLowRaw, null),
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
    detailMode: "simple",
    refreshMinutes: 30
  },
  defaultLayout: {
    x: 180,
    y: 180,
    w: 360,
    h: 220
  },
  defaultGridSize: {
    w: 2,
    h: 1
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
      key: "detailMode",
      label: "Layout",
      type: "select",
      options: [
        { value: "simple", label: "Simple (height 1)" },
        { value: "advanced", label: "Advanced (height 2)" }
      ],
      helpText: "Advanced shows Feels like, Humidity, and Wind details."
    },
    {
      key: "refreshMinutes",
      label: "Refresh every (minutes)",
      type: "number",
      min: 5,
      max: 240,
      step: 1
    }
  ],
  create({ container, getConfig, getUi, getWidget, getWidgetRuntimeCard }) {
    container.classList.add("weather-widget");

    const shell = document.createElement("div");
    shell.className = "weather-widget-shell";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "icon-btn weather-refresh-btn";
    refreshBtn.title = "Refresh weather";
    refreshBtn.setAttribute("aria-label", "Refresh weather");
    refreshBtn.innerHTML = '<svg class="icon"><use href="#i-reset"></use></svg>';

    const headline = document.createElement("div");
    headline.className = "weather-headline-row";

    const temperatureCol = document.createElement("div");
    temperatureCol.className = "weather-temperature-col";

    const temperature = document.createElement("p");
    temperature.className = "weather-temperature";
    temperature.textContent = "--";

    const rangeText = document.createElement("p");
    rangeText.className = "weather-range";
    rangeText.textContent = "";
    rangeText.style.display = "none";

    temperatureCol.append(temperature, rangeText);

    const conditionCol = document.createElement("div");
    conditionCol.className = "weather-condition-col";

    const conditionIcon = document.createElement("span");
    conditionIcon.className = "weather-condition-icon";
    conditionIcon.textContent = "🌤️";
    conditionIcon.setAttribute("aria-hidden", "true");

    const conditionText = document.createElement("p");
    conditionText.className = "weather-condition";
    conditionText.textContent = "Weather";

    conditionCol.append(conditionIcon, conditionText);
    headline.append(temperatureCol, conditionCol);

    const location = document.createElement("p");
    location.className = "weather-location";
    location.textContent = DEFAULT_LOCATION_QUERY;

    const metaList = document.createElement("ul");
    metaList.className = "weather-meta";

    shell.append(refreshBtn, headline, location, metaList);
    container.append(shell);

    let weather = null;
    let loading = false;
    let errorMessage = "";
    let lastSignature = "";
    let weatherFetchedAt = 0;
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
      const delayMs = computeNextRefreshDelayMs(cfg.refreshMinutes, weatherFetchedAt);
      timer = setTimeout(() => {
        void loadWeather();
      }, delayMs);
    }

    function syncWidgetHeightByMode(cfg) {
      const widget = typeof getWidget === "function" ? getWidget() : null;
      if (!widget || !widget.layout || !widget.gridLayout) {
        return;
      }

      const advanced = cfg.detailMode === "advanced";
      const ui = typeof getUi === "function" ? getUi() : null;
      const isGrid = ui?.home?.mode === "grid";
      const card = typeof getWidgetRuntimeCard === "function" ? getWidgetRuntimeCard(widget.id) : null;
      let changed = false;

      if (isGrid) {
        const targetRowSpan = advanced ? 2 : 1;
        const currentRowSpan = Math.max(1, Number(widget.gridLayout.rowSpan) || 1);
        if (currentRowSpan !== targetRowSpan) {
          widget.gridLayout.rowSpan = targetRowSpan;
          changed = true;
        }
      } else {
        const targetHeight = advanced ? 300 : 220;
        const currentHeight = Math.max(1, Number(widget.layout.h) || 0);
        if (Math.abs(currentHeight - targetHeight) > 1) {
          widget.layout.h = targetHeight;
          if (card) {
            card.style.height = `${Math.max(1, Math.round(targetHeight))}px`;
          }
          changed = true;
        }
      }

      if (changed) {
        window.dispatchEvent(new Event("resize"));
      }
    }

    function renderSummary(cfg) {
      const advanced = cfg.detailMode === "advanced";
      const fallbackTemperatureUnit = cfg.temperatureUnit === "fahrenheit" ? "°F" : "°C";
      location.textContent = weather?.locationLabel || cfg.locationQuery || DEFAULT_LOCATION_QUERY;
      temperature.textContent = formatTemperature(
        weather?.temperature,
        weather?.temperatureUnit || fallbackTemperatureUnit
      );

      if (weather) {
        conditionIcon.textContent = weather.conditionIcon || "🌤️";
        conditionText.textContent = weather.conditionLabel || "Weather";
      } else if (errorMessage) {
        conditionIcon.textContent = "⚠️";
        conditionText.textContent = "Unavailable";
      } else if (loading) {
        conditionIcon.textContent = "🌤️";
        conditionText.textContent = "Loading";
      } else {
        conditionIcon.textContent = "🌤️";
        conditionText.textContent = "Weather";
      }

      const hasRange =
        advanced && asFiniteNumber(weather?.high, null) !== null && asFiniteNumber(weather?.low, null) !== null;
      if (hasRange) {
        rangeText.style.display = "block";
        rangeText.textContent = `H ${formatTemperature(weather.high, weather.temperatureUnit)} / L ${formatTemperature(weather.low, weather.temperatureUnit)}`;
      } else {
        rangeText.style.display = "none";
        rangeText.textContent = "";
      }
    }

    function renderMeta(cfg) {
      const advanced = cfg.detailMode === "advanced";
      shell.classList.toggle("weather-mode-advanced", advanced);
      shell.classList.toggle("weather-mode-simple", !advanced);
      metaList.replaceChildren();

      if (!advanced) {
        return;
      }

      const temperatureUnit = weather?.temperatureUnit || (cfg.temperatureUnit === "fahrenheit" ? "°F" : "°C");
      const feelsLike = formatTemperature(weather?.apparentTemperature, temperatureUnit);
      const humidity = asFiniteNumber(weather?.humidity, null);
      const humidityText = humidity === null ? "--" : `${Math.round(humidity)}%`;
      const windSpeed = asFiniteNumber(weather?.windSpeed, null);
      const windText = windSpeed === null ? "--" : `${Math.round(windSpeed)} ${weather?.windUnit || "km/h"}`;

      metaList.append(
        createMetaItem("Feels like", feelsLike),
        createMetaItem("Humidity", humidityText),
        createMetaItem("Wind", windText)
      );
    }

    function render() {
      const cfg = normalizedConfig(getConfig());
      syncWidgetHeightByMode(cfg);
      renderSummary(cfg);
      renderMeta(cfg);
      refreshBtn.disabled = loading;
    }

    async function loadWeather({ force = false } = {}) {
      const requestId = ++requestSerial;
      const cfg = normalizedConfig(getConfig());
      const cached = readWeatherCache(cfg);

      loading = true;
      errorMessage = "";
      render();

      try {
        if (!force && cached && isFreshCache(cached.fetchedAt, cfg.refreshMinutes)) {
          if (requestId !== requestSerial) {
            return;
          }
          weather = cached.snapshot;
          weatherFetchedAt = cached.fetchedAt;
          lastSignature = configSignature(cfg);
          return;
        }

        const snapshot = await fetchWeatherSnapshot(cfg);
        if (requestId !== requestSerial) {
          return;
        }

        weather = snapshot;
        weatherFetchedAt = Date.now();
        writeWeatherCache(cfg, snapshot, weatherFetchedAt);
        lastSignature = configSignature(cfg);
      } catch (error) {
        if (requestId !== requestSerial) {
          return;
        }
        if (cached?.snapshot) {
          weather = cached.snapshot;
          weatherFetchedAt = cached.fetchedAt;
          lastSignature = configSignature(cfg);
        } else {
          weather = null;
          weatherFetchedAt = 0;
          errorMessage = normalizeErrorMessage(error);
        }
      } finally {
        if (requestId !== requestSerial) {
          return;
        }
        loading = false;
        render();
        scheduleRefresh();
      }
    }

    refreshBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (loading) {
        return;
      }
      void loadWeather({ force: true });
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
