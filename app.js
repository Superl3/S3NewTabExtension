import { loadState, saveState } from "./storage.js";
import { widgetRegistry, widgetList } from "./widgets/index.js";

const SNAP = 20;

const FONT_OPTIONS = [
  {
    value: '"IBM Plex Sans", "Segoe UI", sans-serif',
    label: "IBM Plex Sans"
  },
  {
    value: '"Noto Sans KR", "Segoe UI", sans-serif',
    label: "Noto Sans KR"
  },
  {
    value: '"Segoe UI", sans-serif',
    label: "Segoe UI"
  },
  {
    value: '"Georgia", serif',
    label: "Georgia"
  },
  {
    value: '"Consolas", "Courier New", monospace',
    label: "Consolas"
  }
];

const elements = {
  board: document.getElementById("board"),
  modeToggleBtn: document.getElementById("modeToggleBtn"),
  addWidgetBtn: document.getElementById("addWidgetBtn"),
  resetBtn: document.getElementById("resetBtn"),
  autoArrangeBtn: document.getElementById("autoArrangeBtn"),
  tabGlobalBtn: document.getElementById("tabGlobalBtn"),
  tabBackgroundBtn: document.getElementById("tabBackgroundBtn"),
  widgetTypeSelect: document.getElementById("widgetTypeSelect"),
  settingsContent: document.getElementById("settingsContent"),
  template: document.getElementById("widgetTemplate"),
  bgLayer: document.getElementById("bgLayer"),
  bgImage: document.getElementById("bgImage"),
  bgVideo: document.getElementById("bgVideo"),
  bgOverlay: document.getElementById("bgOverlay"),
  widgetModalOverlay: document.getElementById("widgetModalOverlay"),
  widgetModalTitle: document.getElementById("widgetModalTitle"),
  widgetModalBody: document.getElementById("widgetModalBody"),
  widgetModalCloseBtn: document.getElementById("widgetModalCloseBtn"),
  widgetModalCancelBtn: document.getElementById("widgetModalCancelBtn"),
  widgetModalOkBtn: document.getElementById("widgetModalOkBtn")
};

const runtime = new Map();

const modalState = {
  open: false,
  widgetId: "",
  draft: null
};

let state = null;
let saveTimer = null;
let wallpaperTimer = null;
let wallpaperCounter = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function idSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function cloneLayout(layout) {
  return {
    x: Number(layout?.x ?? 40),
    y: Number(layout?.y ?? 40),
    w: Number(layout?.w ?? 340),
    h: Number(layout?.h ?? 220)
  };
}

function defaultTheme() {
  return {
    primary: "#1d6f5f",
    accent: "#1f4f9f",
    secondary: "#6d7568",
    background: "#f3efe6",
    surface: "#fffaf2",
    text: "#1f2226",
    line: "#d0c8b8",
    fontFamily: FONT_OPTIONS[0].value,
    fontScale: 1
  };
}

function defaultBackground() {
  return {
    mode: "wallpaper",
    solidColor: "#1f2937",
    wallpaperProvider: "picsum",
    wallpaperTheme: "nature",
    wallhavenPurity: "100",
    wallhavenCategories: "111",
    wallhavenApiKey: "",
    redditSubreddit: "EarthPorn",
    redditTime: "week",
    rotateMinutes: 15,
    videoUrl: "",
    overlayOpacity: 0.24
  };
}

function defaultUi() {
  return {
    activeTab: "global",
    theme: defaultTheme(),
    background: defaultBackground()
  };
}

function defaultInstances() {
  const order = ["clock", "search", "aiChat", "bookmarks", "todo", "notes", "label"];
  return order
    .filter((type) => widgetRegistry[type])
    .map((type, idx) => {
      const def = widgetRegistry[type];
      return {
        id: `${type}-${idx + 1}`,
        type,
        title: def.title,
        viewMode: "window",
        transparency: 0.94,
        config: structuredClone(def.defaultConfig || {}),
        layout: cloneLayout(def.defaultLayout),
        enabled: true
      };
    });
}

function defaultState() {
  return {
    mode: "use",
    selectedWidgetId: "",
    nextId: 100,
    ui: defaultUi(),
    instances: defaultInstances()
  };
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v)) {
    return v;
  }
  return fallback;
}

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function hydrate(raw) {
  const base = defaultState();
  const instances = Array.isArray(raw.instances) ? raw.instances : base.instances;
  const normalized = [];

  for (const item of instances) {
    const def = widgetRegistry[item.type];
    if (!def) {
      continue;
    }
    normalized.push({
      id: item.id || `${item.type}-${idSuffix()}`,
      type: item.type,
      title: item.title || def.title,
      viewMode: item.viewMode === "headless" ? "headless" : "window",
      transparency: clamp(Number(item.transparency) || 0.94, 0.15, 1),
      enabled: item.enabled !== false,
      layout: cloneLayout(item.layout || def.defaultLayout),
      config: {
        ...(structuredClone(def.defaultConfig || {})),
        ...(item.config || {})
      }
    });
  }

  const rawUi = raw?.ui || {};
  const theme = {
    ...defaultTheme(),
    ...(rawUi.theme || {})
  };
  const background = {
    ...defaultBackground(),
    ...(rawUi.background || {})
  };

  theme.primary = normalizeHexColor(theme.primary, defaultTheme().primary);
  theme.accent = normalizeHexColor(theme.accent, defaultTheme().accent);
  theme.secondary = normalizeHexColor(theme.secondary, defaultTheme().secondary);
  theme.background = normalizeHexColor(theme.background, defaultTheme().background);
  theme.surface = normalizeHexColor(theme.surface, defaultTheme().surface);
  theme.text = normalizeHexColor(theme.text, defaultTheme().text);
  theme.line = normalizeHexColor(theme.line, defaultTheme().line);
  theme.fontScale = clamp(Number(theme.fontScale) || 1, 0.8, 1.4);

  background.solidColor = normalizeHexColor(background.solidColor, defaultBackground().solidColor);
  background.wallpaperProvider = normalizeText(background.wallpaperProvider, "picsum");
  background.wallpaperTheme = normalizeText(background.wallpaperTheme, "nature");
  background.wallhavenPurity = normalizeText(background.wallhavenPurity, "100");
  background.wallhavenCategories = normalizeText(background.wallhavenCategories, "111");
  background.wallhavenApiKey = normalizeText(background.wallhavenApiKey);
  background.redditSubreddit = normalizeText(background.redditSubreddit, "EarthPorn");
  background.redditTime = normalizeText(background.redditTime, "week");
  background.rotateMinutes = clamp(Number(background.rotateMinutes) || 15, 1, 240);
  background.overlayOpacity = clamp(Number(background.overlayOpacity) || 0.24, 0, 0.85);

  return {
    mode: raw.mode === "edit" ? "edit" : "use",
    selectedWidgetId: raw.selectedWidgetId || "",
    nextId: Number(raw.nextId || 100),
    ui: {
      activeTab: rawUi.activeTab === "background" ? "background" : "global",
      theme,
      background
    },
    instances: normalized.length ? normalized : base.instances
  };
}

function queueSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveState(state);
  }, 150);
}

function setBodyMode() {
  const isEdit = state.mode === "edit";
  document.body.classList.toggle("mode-edit", isEdit);

  const label = elements.modeToggleBtn.querySelector(".btn-label");
  if (label) {
    label.textContent = isEdit ? "Use Mode" : "Edit Mode";
  }
  elements.modeToggleBtn.title = isEdit ? "Switch to use mode" : "Switch to edit mode";

  if (!isEdit) {
    closeWidgetModal(false);
  }
}

function syncSettingsTabButtons() {
  const active = state.ui.activeTab === "background" ? "background" : "global";
  if (elements.tabGlobalBtn) {
    const on = active === "global";
    elements.tabGlobalBtn.classList.toggle("active", on);
    elements.tabGlobalBtn.setAttribute("aria-selected", String(on));
  }
  if (elements.tabBackgroundBtn) {
    const on = active === "background";
    elements.tabBackgroundBtn.classList.toggle("active", on);
    elements.tabBackgroundBtn.setAttribute("aria-selected", String(on));
  }
}

function applyCardVisual(card, instance) {
  card.classList.toggle("headless", instance.viewMode === "headless");
  card.style.setProperty("--widget-opacity", String(clamp(Number(instance.transparency) || 0.94, 0.15, 1)));
}

function applyTheme() {
  const root = document.documentElement;
  const theme = state.ui.theme;

  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--surface", theme.surface);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--font-family", theme.fontFamily || defaultTheme().fontFamily);
  root.style.setProperty("--font-scale", String(clamp(Number(theme.fontScale) || 1, 0.8, 1.4)));
}

function clearWallpaperTimer() {
  if (wallpaperTimer) {
    clearInterval(wallpaperTimer);
    wallpaperTimer = null;
  }
}

function hideVideo() {
  elements.bgVideo.classList.remove("visible");
  elements.bgVideo.pause();
  if (elements.bgVideo.getAttribute("src")) {
    elements.bgVideo.removeAttribute("src");
    elements.bgVideo.load();
  }
}

function randomInt(max) {
  return Math.floor(Math.random() * Math.max(1, max));
}

function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) {
    return null;
  }
  return list[randomInt(list.length)] || null;
}

function sanitizeWallhavenCode(value, fallback, allowedRegex, maxLength) {
  const text = normalizeText(value, fallback).slice(0, maxLength);
  if (!allowedRegex.test(text)) {
    return fallback;
  }
  return text;
}

function buildSimpleWallpaperUrl(provider, themeTag) {
  wallpaperCounter += 1;
  const theme = encodeURIComponent(normalizeText(themeTag, "nature"));

  if (provider === "unsplash") {
    return `https://source.unsplash.com/1920x1080/?${theme}&sig=${wallpaperCounter}`;
  }

  const seed = encodeURIComponent(`${theme}-${Date.now()}-${wallpaperCounter}`);
  return `https://picsum.photos/seed/${seed}/1920/1080`;
}

async function fetchWallhavenUrl(cfg) {
  const params = new URLSearchParams();
  params.set("q", normalizeText(cfg.wallpaperTheme, "nature"));
  params.set("sorting", "random");
  params.set("atleast", "1920x1080");
  params.set("page", String(randomInt(8) + 1));
  params.set("purity", sanitizeWallhavenCode(cfg.wallhavenPurity, "100", /^[01]{3}$/, 3));
  params.set("categories", sanitizeWallhavenCode(cfg.wallhavenCategories, "111", /^[01]{3}$/, 3));

  const apiKey = normalizeText(cfg.wallhavenApiKey);
  if (apiKey) {
    params.set("apikey", apiKey);
  }

  const response = await fetch(`https://wallhaven.cc/api/v1/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`wallhaven:${response.status}`);
  }

  const data = await response.json();
  const first = data?.data?.[0];
  if (!first?.path) {
    throw new Error("wallhaven:no-image");
  }
  return String(first.path);
}

function parseRedditImage(post) {
  const raw = post?.url_overridden_by_dest || post?.url || post?.preview?.images?.[0]?.source?.url || "";
  const decoded = String(raw).replaceAll("&amp;", "&");
  const isImage = /\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(decoded);
  const fromImageHost = decoded.includes("i.redd.it") || decoded.includes("i.imgur.com");
  if (!decoded.startsWith("http")) {
    return "";
  }
  if (isImage || fromImageHost) {
    return decoded;
  }
  return "";
}

async function fetchRedditWallpaperUrl(cfg) {
  const subreddit = normalizeText(cfg.redditSubreddit, "EarthPorn").replace(/^r\//i, "");
  const allowedTimes = new Set(["hour", "day", "week", "month", "year", "all"]);
  const t = allowedTimes.has(cfg.redditTime) ? cfg.redditTime : "week";
  const endpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${t}&limit=80`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`reddit:${response.status}`);
  }

  const data = await response.json();
  const items = (data?.data?.children || [])
    .map((entry) => parseRedditImage(entry?.data || {}))
    .filter(Boolean);

  const pick = pickRandom(items);
  if (!pick) {
    throw new Error("reddit:no-image");
  }
  return pick;
}

async function resolveWallpaperUrl(cfg) {
  const provider = normalizeText(cfg.wallpaperProvider, "picsum");

  if (provider === "wallhaven") {
    return fetchWallhavenUrl(cfg);
  }

  if (provider === "reddit") {
    return fetchRedditWallpaperUrl(cfg);
  }

  return buildSimpleWallpaperUrl(provider, cfg.wallpaperTheme);
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = reject;
    img.src = url;
  });
}

async function refreshWallpaper() {
  const cfg = state.ui.background;
  try {
    const url = await resolveWallpaperUrl(cfg);
    await preloadImage(url);
    elements.bgImage.src = url;
    elements.bgImage.classList.add("visible");
    return;
  } catch {
    const fallback = buildSimpleWallpaperUrl("picsum", cfg.wallpaperTheme);
    try {
      await preloadImage(fallback);
      elements.bgImage.src = fallback;
      elements.bgImage.classList.add("visible");
    } catch {
      elements.bgImage.classList.remove("visible");
    }
  }
}

function applyBackground() {
  clearWallpaperTimer();

  const cfg = state.ui.background;
  const theme = state.ui.theme;
  const overlay = clamp(Number(cfg.overlayOpacity) || 0.24, 0, 0.85);

  elements.bgOverlay.style.background = `rgba(8, 11, 16, ${overlay})`;
  elements.bgLayer.style.background = theme.background;
  elements.bgImage.classList.remove("visible");
  hideVideo();

  if (cfg.mode === "solid") {
    elements.bgLayer.style.background = cfg.solidColor || theme.background;
    return;
  }

  if (cfg.mode === "video") {
    elements.bgLayer.style.background = theme.background;
    const src = (cfg.videoUrl || "").trim();
    if (!src) {
      return;
    }
    elements.bgVideo.src = src;
    elements.bgVideo.play().catch(() => {});
    elements.bgVideo.classList.add("visible");
    return;
  }

  if (cfg.mode === "wallpaper") {
    elements.bgLayer.style.background = theme.background;
    void refreshWallpaper();
    wallpaperTimer = setInterval(() => {
      void refreshWallpaper();
    }, clamp(Number(cfg.rotateMinutes) || 15, 1, 240) * 60000);
    return;
  }

  elements.bgLayer.style.background =
    `radial-gradient(circle at 20% 20%, ${theme.surface} 0 20%, transparent 48%), ` +
    `radial-gradient(circle at 80% 82%, ${theme.secondary}33 0 18%, transparent 50%), ` +
    `linear-gradient(145deg, ${theme.background}, ${theme.accent}22)`;
}

function refreshAllWidgets() {
  for (const rt of runtime.values()) {
    rt.controller?.refresh?.();
  }
}

function populateTypeSelect() {
  elements.widgetTypeSelect.replaceChildren();
  for (const def of widgetList) {
    const option = document.createElement("option");
    option.value = def.type;
    option.textContent = `${def.title} (${def.type})`;
    elements.widgetTypeSelect.append(option);
  }
}

function applyLayout(card, layout) {
  card.style.left = `${Math.round(layout.x)}px`;
  card.style.top = `${Math.round(layout.y)}px`;
  card.style.width = `${Math.max(1, Math.round(layout.w))}px`;
  card.style.height = `${Math.max(1, Math.round(layout.h))}px`;
}

function updateBoardBounds() {
  const boardW = Math.max(1, Math.floor(elements.board.clientWidth));
  const boardH = Math.max(1, Math.floor(elements.board.clientHeight));

  for (const instance of state.instances) {
    const minW = Math.min(220, boardW);
    const minH = Math.min(120, boardH);

    instance.layout.w = clamp(Number(instance.layout.w) || minW, minW, boardW);
    instance.layout.h = clamp(Number(instance.layout.h) || minH, minH, boardH);
    instance.layout.x = clamp(Number(instance.layout.x) || 0, 0, Math.max(0, boardW - instance.layout.w));
    instance.layout.y = clamp(Number(instance.layout.y) || 0, 0, Math.max(0, boardH - instance.layout.h));

    const rt = runtime.get(instance.id);
    if (rt?.card) {
      applyLayout(rt.card, instance.layout);
    }
  }
}

function autoArrangeWidgets() {
  if (state.mode !== "edit") {
    return;
  }

  const items = state.instances.filter((instance) => instance.enabled !== false);
  if (!items.length) {
    return;
  }

  const boardW = Math.max(1, Math.floor(elements.board.clientWidth));
  const boardH = Math.max(1, Math.floor(elements.board.clientHeight));
  const gap = boardW < 900 ? 10 : 14;

  let best = null;
  for (let columns = 1; columns <= items.length; columns += 1) {
    const rows = Math.ceil(items.length / columns);
    const cellW = Math.floor((boardW - gap * (columns + 1)) / columns);
    const cellH = Math.floor((boardH - gap * (rows + 1)) / rows);
    if (cellW < 90 || cellH < 70) {
      continue;
    }

    const ratioPenalty = Math.abs(columns / rows - boardW / Math.max(1, boardH));
    const score = cellW * cellH - ratioPenalty * 12000;
    if (!best || score > best.score) {
      best = {
        score,
        columns,
        rows,
        cellW,
        cellH
      };
    }
  }

  if (!best) {
    best = {
      columns: 1,
      rows: items.length,
      cellW: Math.max(90, boardW - gap * 2),
      cellH: Math.max(70, Math.floor((boardH - gap * (items.length + 1)) / Math.max(1, items.length)))
    };
  }

  for (let i = 0; i < items.length; i += 1) {
    const row = Math.floor(i / best.columns);
    const col = i % best.columns;
    const x = gap + col * (best.cellW + gap);
    const y = gap + row * (best.cellH + gap);

    const instance = items[i];
    instance.layout.x = x;
    instance.layout.y = y;
    instance.layout.w = best.cellW;
    instance.layout.h = best.cellH;

    const rt = runtime.get(instance.id);
    if (rt?.card) {
      applyLayout(rt.card, instance.layout);
    }
  }

  closeWidgetModal(false);
  setSelected(state.selectedWidgetId);
  updateBoardBounds();
  queueSave();
}

function instanceById(instanceId) {
  return state.instances.find((item) => item.id === instanceId) || null;
}

function setSelected(instanceId) {
  state.selectedWidgetId = instanceId || "";
  for (const [id, rt] of runtime.entries()) {
    rt.card.classList.toggle("selected", id === state.selectedWidgetId);
  }
  renderSettings();
  queueSave();
}

function patchTheme(patch) {
  state.ui.theme = {
    ...state.ui.theme,
    ...patch
  };
  state.ui.theme.fontScale = clamp(Number(state.ui.theme.fontScale) || 1, 0.8, 1.4);

  applyTheme();
  applyBackground();
  renderSettings();
  queueSave();
}

function patchBackground(patch) {
  state.ui.background = {
    ...state.ui.background,
    ...patch
  };
  state.ui.background.wallpaperProvider = normalizeText(state.ui.background.wallpaperProvider, "picsum");
  state.ui.background.wallpaperTheme = normalizeText(state.ui.background.wallpaperTheme, "nature");
  state.ui.background.wallhavenPurity = sanitizeWallhavenCode(
    state.ui.background.wallhavenPurity,
    "100",
    /^[01]{3}$/,
    3
  );
  state.ui.background.wallhavenCategories = sanitizeWallhavenCode(
    state.ui.background.wallhavenCategories,
    "111",
    /^[01]{3}$/,
    3
  );
  state.ui.background.wallhavenApiKey = normalizeText(state.ui.background.wallhavenApiKey);
  state.ui.background.redditSubreddit = normalizeText(state.ui.background.redditSubreddit, "EarthPorn");
  state.ui.background.redditTime = normalizeText(state.ui.background.redditTime, "week");
  state.ui.background.rotateMinutes = clamp(Number(state.ui.background.rotateMinutes) || 15, 1, 240);
  state.ui.background.overlayOpacity = clamp(
    Number(state.ui.background.overlayOpacity) || 0.24,
    0,
    0.85
  );

  applyBackground();
  renderSettings();
  queueSave();
}

function patchWidgetConfig(instanceId, patch) {
  const instance = instanceById(instanceId);
  if (!instance) {
    return;
  }
  instance.config = { ...instance.config, ...patch };
  runtime.get(instanceId)?.controller?.refresh?.();
  renderSettings();
  queueSave();
}

function patchWidgetLayout(instanceId, layoutPatch) {
  const instance = instanceById(instanceId);
  if (!instance) {
    return;
  }
  instance.layout = {
    ...instance.layout,
    ...layoutPatch
  };
  const rt = runtime.get(instanceId);
  if (rt) {
    applyLayout(rt.card, instance.layout);
  }
  updateBoardBounds();
  renderSettings();
  queueSave();
}

function removeWidget(instanceId) {
  const index = state.instances.findIndex((item) => item.id === instanceId);
  if (index < 0) {
    return;
  }
  runtime.get(instanceId)?.controller?.destroy?.();
  runtime.get(instanceId)?.card.remove();
  runtime.delete(instanceId);
  state.instances.splice(index, 1);

  if (state.selectedWidgetId === instanceId) {
    state.selectedWidgetId = "";
  }

  if (modalState.open && modalState.widgetId === instanceId) {
    closeWidgetModal(false);
  }

  renderSettings();
  updateBoardBounds();
  queueSave();
}

function createWidgetCard(instance) {
  const def = widgetRegistry[instance.type];
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".widget-card");
  const head = fragment.querySelector(".widget-head");
  const title = fragment.querySelector(".widget-title");
  const body = fragment.querySelector(".widget-body");
  const selectBtn = fragment.querySelector(".widget-select-btn");
  const removeBtn = fragment.querySelector(".widget-remove-btn");
  const floatSelectBtn = fragment.querySelector(".widget-float-select");
  const floatRemoveBtn = fragment.querySelector(".widget-float-remove");
  const dragBtn = fragment.querySelector(".widget-drag-btn");
  const resizeHandle = fragment.querySelector(".widget-resize-handle");

  title.textContent = instance.title || def.title;
  applyLayout(card, instance.layout);
  applyCardVisual(card, instance);

  const controller = def.create({
    container: body,
    getConfig: () => instance.config,
    patchConfig: (patch) => patchWidgetConfig(instance.id, patch),
    isEditMode: () => state.mode === "edit"
  });

  const openSettings = () => {
    if (state.mode !== "edit") {
      return;
    }
    setSelected(instance.id);
    openWidgetModal(instance.id);
  };

  selectBtn.addEventListener("click", openSettings);
  floatSelectBtn?.addEventListener("click", openSettings);

  const removeCurrent = () => {
    if (state.mode !== "edit") {
      return;
    }
    removeWidget(instance.id);
  };

  removeBtn.addEventListener("click", removeCurrent);
  floatRemoveBtn?.addEventListener("click", removeCurrent);

  card.addEventListener("click", () => {
    if (state.mode === "edit") {
      setSelected(instance.id);
    }
  });

  const startDrag = (event, fromHandleButton = false) => {
    if (state.mode !== "edit") {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (!fromHandleButton && event.target.closest("button, input, textarea, select, a")) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    setSelected(instance.id);

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = instance.layout.x;
    const startTop = instance.layout.y;
    const boardRect = elements.board.getBoundingClientRect();

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const maxX = Math.max(0, boardRect.width - instance.layout.w);
      const maxY = Math.max(0, boardRect.height - instance.layout.h);

      const nextX = Math.max(0, Math.min(maxX, startLeft + dx));
      const nextY = Math.max(0, Math.min(maxY, startTop + dy));

      patchWidgetLayout(instance.id, {
        x: nextX,
        y: nextY
      });
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      patchWidgetLayout(instance.id, {
        x: Math.round(instance.layout.x / SNAP) * SNAP,
        y: Math.round(instance.layout.y / SNAP) * SNAP
      });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  head.addEventListener("pointerdown", (event) => {
    if (instance.viewMode === "headless") {
      return;
    }
    startDrag(event);
  });

  dragBtn?.addEventListener("pointerdown", (event) => {
    startDrag(event, true);
  });

  if (resizeHandle) {
    resizeHandle.addEventListener("pointerdown", (event) => {
      if (state.mode !== "edit") {
        return;
      }
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      event.preventDefault();
      setSelected(instance.id);

      const startX = event.clientX;
      const startY = event.clientY;
      const startW = instance.layout.w;
      const startH = instance.layout.h;

      const move = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const boardRect = elements.board.getBoundingClientRect();
        const maxW = Math.max(1, Math.floor(boardRect.width - instance.layout.x));
        const maxH = Math.max(1, Math.floor(boardRect.height - instance.layout.y));
        const minW = Math.min(220, maxW);
        const minH = Math.min(120, maxH);

        patchWidgetLayout(instance.id, {
          w: clamp(startW + dx, minW, maxW),
          h: clamp(startH + dy, minH, maxH)
        });
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        patchWidgetLayout(instance.id, {
          w: Math.round(instance.layout.w / SNAP) * SNAP,
          h: Math.round(instance.layout.h / SNAP) * SNAP
        });
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  elements.board.append(card);
  runtime.set(instance.id, { card, controller });
}

function renderBoard() {
  for (const rt of runtime.values()) {
    rt.controller?.destroy?.();
  }
  runtime.clear();
  elements.board.replaceChildren();

  for (const instance of state.instances) {
    if (instance.enabled !== false) {
      createWidgetCard(instance);
    }
  }

  setSelected(state.selectedWidgetId);
  setBodyMode();
  updateBoardBounds();
}

function createFormRow(labelText) {
  const row = document.createElement("label");
  row.className = "form-row";
  const text = document.createElement("span");
  text.textContent = labelText;
  row.append(text);
  return row;
}

function createSectionChip(text) {
  const chip = document.createElement("p");
  chip.className = "section-chip";
  chip.textContent = text;
  return chip;
}

function settingsEventName(schema) {
  if (schema.type === "checkbox" || schema.type === "select") {
    return "change";
  }
  if (schema.type === "color") {
    return "input";
  }
  return "change";
}

function createInputBySchema(schema, value) {
  if (schema.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.value = value ?? "";
    if (schema.placeholder) {
      textarea.placeholder = schema.placeholder;
    }
    return textarea;
  }

  if (schema.type === "select") {
    const select = document.createElement("select");
    const options = Array.isArray(schema.options) ? schema.options : [];
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = String(opt.value);
      option.textContent = opt.label;
      select.append(option);
    }
    select.value = String(value ?? "");
    return select;
  }

  const input = document.createElement("input");
  input.type = schema.type === "checkbox" ? "checkbox" : schema.type || "text";
  if (schema.type === "checkbox") {
    input.checked = Boolean(value);
  } else {
    input.value = value ?? "";
  }

  if (schema.placeholder) {
    input.placeholder = schema.placeholder;
  }
  if (schema.min !== undefined) {
    input.min = String(schema.min);
  }
  if (schema.max !== undefined) {
    input.max = String(schema.max);
  }
  if (schema.step !== undefined) {
    input.step = String(schema.step);
  }
  return input;
}

function readFieldValue(field, schema) {
  if (schema.type === "checkbox") {
    return field.checked;
  }
  if (schema.type === "number") {
    const num = Number(field.value);
    return Number.isFinite(num) ? num : 0;
  }
  return field.value;
}

function appendDivider() {
  const div = document.createElement("div");
  div.className = "settings-divider";
  elements.settingsContent.append(div);
}

function renderGlobalSettings() {
  elements.settingsContent.append(createSectionChip("Global Theme"));

  const themeFields = [
    { key: "primary", label: "Primary", type: "color" },
    { key: "accent", label: "Accent", type: "color" },
    { key: "secondary", label: "Secondary", type: "color" },
    { key: "background", label: "Background", type: "color" },
    { key: "surface", label: "Surface", type: "color" },
    { key: "text", label: "Text", type: "color" },
    { key: "line", label: "Line", type: "color" },
    { key: "fontFamily", label: "Font family", type: "select", options: FONT_OPTIONS },
    { key: "fontScale", label: "Font scale", type: "number", min: 0.8, max: 1.4, step: 0.05 }
  ];

  for (const schema of themeFields) {
    const row = createFormRow(schema.label);
    const value = state.ui.theme[schema.key];
    const input = createInputBySchema(schema, value);
    input.addEventListener(settingsEventName(schema), () => {
      const next = readFieldValue(input, schema);
      patchTheme({ [schema.key]: next });
    });
    row.append(input);
    elements.settingsContent.append(row);
  }
}

function renderBackgroundSettings() {
  elements.settingsContent.append(createSectionChip("Background"));

  const bgFields = [
    {
      key: "mode",
      label: "Mode",
      type: "select",
      options: [
        { value: "gradient", label: "Gradient" },
        { value: "solid", label: "Solid color" },
        { value: "wallpaper", label: "Wallpaper rotation" },
        { value: "video", label: "Loop video" }
      ]
    },
    { key: "solidColor", label: "Solid color", type: "color" },
    {
      key: "wallpaperProvider",
      label: "Wallpaper source",
      type: "select",
      options: [
        { value: "picsum", label: "Picsum" },
        { value: "unsplash", label: "Unsplash Source" },
        { value: "wallhaven", label: "Wallhaven" },
        { value: "reddit", label: "Reddit" }
      ]
    },
    { key: "wallpaperTheme", label: "Wallpaper theme", type: "text", placeholder: "nature, city, sea" },
    {
      key: "wallhavenPurity",
      label: "Wallhaven purity (SFW=100)",
      type: "text",
      placeholder: "100"
    },
    {
      key: "wallhavenCategories",
      label: "Wallhaven categories",
      type: "text",
      placeholder: "111"
    },
    {
      key: "wallhavenApiKey",
      label: "Wallhaven API key",
      type: "password",
      placeholder: "optional"
    },
    {
      key: "redditSubreddit",
      label: "Reddit subreddit",
      type: "text",
      placeholder: "EarthPorn"
    },
    {
      key: "redditTime",
      label: "Reddit time range",
      type: "select",
      options: [
        { value: "hour", label: "hour" },
        { value: "day", label: "day" },
        { value: "week", label: "week" },
        { value: "month", label: "month" },
        { value: "year", label: "year" },
        { value: "all", label: "all" }
      ]
    },
    { key: "rotateMinutes", label: "Rotate every (minutes)", type: "number", min: 1, max: 240, step: 1 },
    {
      key: "videoUrl",
      label: "Video URL (mp4/webm)",
      type: "text",
      placeholder: "https://.../loop.mp4"
    },
    { key: "overlayOpacity", label: "Overlay opacity", type: "number", min: 0, max: 0.85, step: 0.05 }
  ];

  for (const schema of bgFields) {
    const row = createFormRow(schema.label);
    const value = state.ui.background[schema.key];
    const input = createInputBySchema(schema, value);
    input.addEventListener(settingsEventName(schema), () => {
      const next = readFieldValue(input, schema);
      patchBackground({ [schema.key]: next });
    });
    row.append(input);
    elements.settingsContent.append(row);
  }
}

function getWidgetModalFields(def) {
  const baseFields = [
    { key: "title", label: "Title", type: "text", group: "base" },
    {
      key: "viewMode",
      label: "Display mode",
      type: "select",
      group: "base",
      options: [
        { value: "window", label: "Window" },
        { value: "headless", label: "Headless" }
      ]
    },
    {
      key: "transparency",
      label: "Transparency",
      type: "number",
      group: "base",
      min: 0.15,
      max: 1,
      step: 0.05
    },
    { key: "x", label: "X", type: "number", group: "layout" },
    { key: "y", label: "Y", type: "number", group: "layout" },
    { key: "w", label: "Width", type: "number", group: "layout" },
    { key: "h", label: "Height", type: "number", group: "layout" }
  ];

  return [...baseFields, ...(def.settingsSchema || [])];
}

function modalFieldValue(field) {
  const draft = modalState.draft;
  if (!draft) {
    return "";
  }
  if (field.group === "layout") {
    return draft.layout[field.key];
  }
  if (field.group === "base") {
    return draft[field.key];
  }
  return draft.config[field.key];
}

function setModalFieldValue(field, value) {
  const draft = modalState.draft;
  if (!draft) {
    return;
  }
  if (field.group === "layout") {
    draft.layout[field.key] = Number(value);
    return;
  }
  if (field.group === "base") {
    draft[field.key] = value;
    return;
  }
  draft.config[field.key] = value;
}

function closeWidgetModal(rerender = true) {
  modalState.open = false;
  modalState.widgetId = "";
  modalState.draft = null;
  elements.widgetModalOverlay?.classList.remove("open");
  elements.widgetModalOverlay?.setAttribute("aria-hidden", "true");
  elements.widgetModalBody?.replaceChildren();

  if (rerender) {
    renderSettings();
  }
}

function renderWidgetModal() {
  if (!modalState.open || !modalState.widgetId || !modalState.draft) {
    return;
  }
  const instance = instanceById(modalState.widgetId);
  if (!instance) {
    closeWidgetModal(false);
    return;
  }

  const def = widgetRegistry[instance.type];
  elements.widgetModalTitle.textContent = `${def.title} Settings`;
  elements.widgetModalBody.replaceChildren();

  const fields = getWidgetModalFields(def);
  for (const field of fields) {
    const row = createFormRow(field.label);
    const input = createInputBySchema(field, modalFieldValue(field));
    input.addEventListener(settingsEventName(field), () => {
      setModalFieldValue(field, readFieldValue(input, field));
    });
    row.append(input);
    elements.widgetModalBody.append(row);
  }

  elements.widgetModalOverlay.classList.add("open");
  elements.widgetModalOverlay.setAttribute("aria-hidden", "false");
}

function openWidgetModal(instanceId) {
  const instance = instanceById(instanceId);
  if (!instance) {
    return;
  }

  modalState.open = true;
  modalState.widgetId = instance.id;
  modalState.draft = {
    title: instance.title,
    viewMode: instance.viewMode || "window",
    transparency: clamp(Number(instance.transparency) || 0.94, 0.15, 1),
    layout: {
      ...instance.layout
    },
    config: {
      ...instance.config
    }
  };

  renderWidgetModal();
}

function applyWidgetModal() {
  if (!modalState.open || !modalState.widgetId || !modalState.draft) {
    return;
  }

  const instance = instanceById(modalState.widgetId);
  if (!instance) {
    closeWidgetModal(false);
    return;
  }

  const def = widgetRegistry[instance.type];
  const draft = modalState.draft;

  instance.title = normalizeText(draft.title, def.title);
  instance.viewMode = draft.viewMode === "headless" ? "headless" : "window";
  instance.transparency = clamp(Number(draft.transparency) || 0.94, 0.15, 1);
  instance.layout = cloneLayout(draft.layout);
  instance.config = {
    ...instance.config,
    ...draft.config
  };

  const rt = runtime.get(instance.id);
  if (rt) {
    const titleEl = rt.card.querySelector(".widget-title");
    if (titleEl) {
      titleEl.textContent = instance.title || def.title;
    }
    applyLayout(rt.card, instance.layout);
    applyCardVisual(rt.card, instance);
    rt.controller?.refresh?.();
  }

  updateBoardBounds();
  queueSave();
  closeWidgetModal(true);
}

function renderSettings() {
  elements.settingsContent.replaceChildren();
  syncSettingsTabButtons();

  if (state.mode !== "edit") {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Use Mode에서는 설정 편집이 잠깁니다. 상단 가장자리에 커서를 올려 Edit Mode로 전환하세요.";
    elements.settingsContent.append(p);
    return;
  }

  if (state.ui.activeTab === "background") {
    renderBackgroundSettings();
    return;
  }

  renderGlobalSettings();
}

function addWidget(type) {
  if (state.mode !== "edit") {
    return;
  }

  const def = widgetRegistry[type];
  if (!def) {
    return;
  }

  const instance = {
    id: `${type}-${state.nextId}`,
    type,
    title: def.title,
    viewMode: "window",
    transparency: 0.94,
    enabled: true,
    config: structuredClone(def.defaultConfig || {}),
    layout: cloneLayout(def.defaultLayout)
  };

  state.nextId += 1;
  instance.layout.x += (state.instances.length % 6) * 24;
  instance.layout.y += (state.instances.length % 4) * 24;

  state.instances.push(instance);
  createWidgetCard(instance);
  setSelected(instance.id);
  updateBoardBounds();
  queueSave();
}

function resetState() {
  state = defaultState();
  applyTheme();
  applyBackground();
  renderBoard();
  queueSave();
}

function wireEvents() {
  elements.modeToggleBtn.addEventListener("click", () => {
    state.mode = state.mode === "edit" ? "use" : "edit";
    if (state.mode === "use") {
      state.selectedWidgetId = "";
    }
    setBodyMode();
    setSelected(state.selectedWidgetId);
    refreshAllWidgets();
    updateBoardBounds();
    requestAnimationFrame(() => {
      updateBoardBounds();
    });
    queueSave();
  });

  elements.tabGlobalBtn?.addEventListener("click", () => {
    state.ui.activeTab = "global";
    renderSettings();
    queueSave();
  });

  elements.tabBackgroundBtn?.addEventListener("click", () => {
    state.ui.activeTab = "background";
    renderSettings();
    queueSave();
  });

  elements.addWidgetBtn.addEventListener("click", () => {
    addWidget(elements.widgetTypeSelect.value);
  });

  elements.resetBtn.addEventListener("click", () => {
    if (state.mode !== "edit") {
      return;
    }
    const confirmed = window.confirm("Reset layout, widget settings, and global theme/background to defaults?");
    if (!confirmed) {
      return;
    }
    resetState();
  });

  elements.autoArrangeBtn?.addEventListener("click", () => {
    autoArrangeWidgets();
  });

  window.addEventListener("resize", () => {
    updateBoardBounds();
  });

  elements.widgetModalCloseBtn?.addEventListener("click", () => {
    closeWidgetModal(false);
  });

  elements.widgetModalCancelBtn?.addEventListener("click", () => {
    closeWidgetModal(false);
  });

  elements.widgetModalOkBtn?.addEventListener("click", () => {
    applyWidgetModal();
  });

  elements.widgetModalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.widgetModalOverlay) {
      closeWidgetModal(false);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalState.open) {
      closeWidgetModal(false);
    }
  });
}

async function init() {
  populateTypeSelect();
  const loaded = await loadState(defaultState());
  state = hydrate(loaded);

  applyTheme();
  applyBackground();
  wireEvents();
  renderBoard();
}

void init();
