import { STORAGE_KEY, loadState, saveState } from "./storage.js";
import { widgetRegistry, widgetList } from "./widgets/index.js";

const SNAP = 20;
const LONG_PRESS_DRAG_DELAY_MS = 340;
const SHORTCUT_LONG_PRESS_DRAG_DELAY_MS = 220;
const LONG_PRESS_DRAG_MOVE_TOLERANCE = 18;
const GRID_MAX_ROW_SPAN = 24;
const GRID_MAX_COLUMNS = 16;
const GRID_MAX_ROWS = 16;
const MAX_LAUNCHER_PAGES = 12;
const WIDGET_COMMON_MASTER_KEYS = [
  "viewMode",
  "surfaceMode",
  "transparentAutoContrast",
  "transparentGhostStrength",
  "backdropBlur",
  "edgeRoundness",
  "transparency",
  "contentAlignY",
  "contentFillParent",
  "contentPadding",
  "contentFontScale",
  "widgetThemeMode",
  "useCustomColors",
  "customTextColor",
  "customAccentColor",
  "customSurfaceColor"
];

const FONT_OPTIONS = [
  {
    value: '"Pretendard Std", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif',
    label: "Pretendard Std"
  },
  {
    value: '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif',
    label: "Noto Sans KR"
  },
  {
    value: '"IBM Plex Sans", "Segoe UI", sans-serif',
    label: "IBM Plex Sans"
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

const VIDEO_CACHE_NAME = "s3newtab-loop-video-cache-v1";
const VIDEO_CACHE_KEY_PREFIX = "https://s3newtab.local/loop-video/";

const elements = {
  appRoot: document.getElementById("app"),
  board: document.getElementById("board"),
  bgRefreshBtn: document.getElementById("bgRefreshBtn"),
  modeToggleBtn: document.getElementById("modeToggleBtn"),
  addWidgetBtn: document.getElementById("addWidgetBtn"),
  resetBtn: document.getElementById("resetBtn"),
  autoArrangeBtn: document.getElementById("autoArrangeBtn"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  tabGlobalBtn: document.getElementById("tabGlobalBtn"),
  tabBackgroundBtn: document.getElementById("tabBackgroundBtn"),
  tabProfileBtn: document.getElementById("tabProfileBtn"),
  settingsRailToggleBtn: document.getElementById("settingsRailToggleBtn"),
  settingsPanelBackdrop: document.getElementById("settingsPanelBackdrop"),
  settingsPanel: document.getElementById("settingsPanel"),
  widgetTypeSelect: document.getElementById("widgetTypeSelect"),
  addWidgetModalOverlay: document.getElementById("addWidgetModalOverlay"),
  addWidgetModalCloseBtn: document.getElementById("addWidgetModalCloseBtn"),
  addWidgetModalCancelBtn: document.getElementById("addWidgetModalCancelBtn"),
  addWidgetModalOkBtn: document.getElementById("addWidgetModalOkBtn"),
  addWidgetTitleInput: document.getElementById("addWidgetTitleInput"),
  addWidgetColSpanInput: document.getElementById("addWidgetColSpanInput"),
  addWidgetRowSpanInput: document.getElementById("addWidgetRowSpanInput"),
  settingsContent: document.getElementById("settingsContent"),
  template: document.getElementById("widgetTemplate"),
  bgLayer: document.getElementById("bgLayer"),
  bgImage: document.getElementById("bgImage"),
  bgBlurImage: document.getElementById("bgBlurImage"),
  bgVideo: document.getElementById("bgVideo"),
  bgOverlay: document.getElementById("bgOverlay"),
  widgetModalOverlay: document.getElementById("widgetModalOverlay"),
  widgetModalTitle: document.getElementById("widgetModalTitle"),
  widgetModalTabs: document.getElementById("widgetModalTabs"),
  widgetModalBody: document.getElementById("widgetModalBody"),
  widgetModalDefaultBtn: document.getElementById("widgetModalDefaultBtn"),
  widgetModalCloseBtn: document.getElementById("widgetModalCloseBtn"),
  widgetModalCancelBtn: document.getElementById("widgetModalCancelBtn"),
  widgetModalOkBtn: document.getElementById("widgetModalOkBtn"),
  shortcutIconEditorOverlay: document.getElementById("shortcutIconEditorOverlay"),
  shortcutIconEditorCanvas: document.getElementById("shortcutIconEditorCanvas"),
  shortcutIconEditorShape: document.getElementById("shortcutIconEditorShape"),
  shortcutIconEditorScale: document.getElementById("shortcutIconEditorScale"),
  shortcutIconEditorText: document.getElementById("shortcutIconEditorText"),
  shortcutIconEditorFontSize: document.getElementById("shortcutIconEditorFontSize"),
  shortcutIconEditorPresetGrid: document.getElementById("shortcutIconEditorPresetGrid"),
  shortcutIconEditorCachedGrid: document.getElementById("shortcutIconEditorCachedGrid"),
  shortcutIconEditorImportBtn: document.getElementById("shortcutIconEditorImportBtn"),
  shortcutIconEditorClearBtn: document.getElementById("shortcutIconEditorClearBtn"),
  shortcutIconEditorFile: document.getElementById("shortcutIconEditorFile"),
  shortcutIconEditorCloseBtn: document.getElementById("shortcutIconEditorCloseBtn"),
  shortcutIconEditorCancelBtn: document.getElementById("shortcutIconEditorCancelBtn"),
  shortcutIconEditorApplyBtn: document.getElementById("shortcutIconEditorApplyBtn"),
  persistentDock: document.getElementById("persistentDock"),
  dockWidgetStrip: document.getElementById("dockWidgetStrip"),
  dockPageState: document.getElementById("dockPageState"),
  dockPrevBtn: document.getElementById("dockPrevBtn"),
  dockNextBtn: document.getElementById("dockNextBtn"),
  dockSettingsBtn: document.getElementById("dockSettingsBtn"),
  dockSettingsModalOverlay: document.getElementById("dockSettingsModalOverlay"),
  dockSettingsModalBody: document.getElementById("dockSettingsModalBody"),
  dockSettingsModalCloseBtn: document.getElementById("dockSettingsModalCloseBtn"),
  dockSettingsModalCancelBtn: document.getElementById("dockSettingsModalCancelBtn"),
  dockSettingsModalOkBtn: document.getElementById("dockSettingsModalOkBtn"),
  dockSettingsModalDefaultBtn: document.getElementById("dockSettingsModalDefaultBtn"),
  workspace: document.querySelector(".workspace"),
  editDock: document.querySelector(".edit-dock"),
  editDockGrip: document.getElementById("editDockGrip"),
  pageIndicator: document.getElementById("pageIndicator")
};

const runtime = new Map();

const modalState = {
  open: false,
  widgetId: "",
  draft: null,
  dismissPointerId: null,
  dismissStartX: 0,
  dismissStartY: 0,
  dismissMoved: false,
  dismissStartedOnOverlay: false,
  activeTab: "widget"
};

let state = null;
let saveTimer = null;
let lastSavedFingerprint = "";
let lastSavedUserMutationAt = 0;
let saveInFlightFingerprint = "";
let wallpaperTimer = null;
let wallpaperCounter = 0;
let lastDragEndAt = 0;
let blurComputeToken = 0;
let wallpaperSourceSignature = "";
let zCounter = 1;
let addWidgetModalOpen = false;
let dockSettingsModalOpen = false;
let wallpaperLoadToken = 0;
let videoLoadToken = 0;
let sampledWallpaperBaseLuminance = null;
let sampledWallpaperSource = "";
let wallpaperSampleToken = 0;
let currentVideoObjectUrl = "";
const dockDragState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0
};
const boardSwipeState = {
  active: false,
  pointerId: null,
  captureTarget: null,
  startX: 0,
  startY: 0,
  startAt: 0,
  dragOffsetX: 0,
  dragging: false
};
const widgetLongPressState = {
  pending: false,
  pointerId: null
};
const dockModalState = {
  draft: null
};
const dockUiState = {
  activeId: ""
};
const containerDropUiState = {
  targets: new Map(),
  activeId: ""
};
const shortcutIconEditorState = {
  open: false,
  shape: "roundSquared",
  scale: 100,
  text: "",
  textSize: 58,
  source: "none",
  selectedPreset: "search",
  selectedCache: "",
  importedDataUrl: "",
  cacheEntries: [],
  previewDataUrl: "",
  onApply: null
};
const HISTORY_LIMIT = 80;
const undoState = {
  undoStack: [],
  redoStack: [],
  isRestoring: false
};

const SHORTCUT_ICON_CACHE_KEY = "s3newtab-shortcut-favicon-cache-v1";
const SHORTCUT_ICON_PRESETS = [
  { id: "search", label: "Search", viewBox: "0 0 24 24", markup: '<circle cx="10.5" cy="10.5" r="5.8" /><path d="M15 15 20.2 20.2" />' },
  {
    id: "settings",
    label: "Settings",
    viewBox: "0 0 24 24",
    markup:
      '<circle cx="12" cy="12" r="2.6" /><circle cx="12" cy="12" r="6.1" /><path d="M12 3.8v2.1" /><path d="M12 18.1v2.1" /><path d="M5.9 5.9l1.5 1.5" /><path d="M16.6 16.6l1.5 1.5" /><path d="M3.8 12h2.1" /><path d="M18.1 12h2.1" /><path d="M5.9 18.1l1.5-1.5" /><path d="M16.6 7.4l1.5-1.5" />'
  },
  { id: "grid", label: "Grid", viewBox: "0 0 24 24", markup: '<rect x="3" y="4" width="8" height="6" rx="1.2" /><rect x="13" y="4" width="8" height="6" rx="1.2" /><rect x="3" y="12" width="8" height="8" rx="1.2" /><rect x="13" y="12" width="8" height="8" rx="1.2" />' },
  { id: "folder", label: "Folder", viewBox: "0 0 24 24", markup: '<path d="M3.5 7h6.8l1.7 2H20a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V8.5A1.5 1.5 0 0 1 4 7z" />' },
  { id: "clock", label: "Clock", viewBox: "0 0 24 24", markup: '<circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.8 1.8" />' },
  { id: "bookmark", label: "Bookmark", viewBox: "0 0 24 24", markup: '<path d="M6 4.5h12a1 1 0 0 1 1 1V20l-7-4.3L5 20V5.5a1 1 0 0 1 1-1z" />' },
  { id: "check", label: "Check", viewBox: "0 0 24 24", markup: '<path d="m5 12 4.1 4.1L19 6.2" />' },
  { id: "note", label: "Note", viewBox: "0 0 24 24", markup: '<rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8" /><path d="M8 13h8" /><path d="M8 17h5" />' },
  { id: "chat", label: "Chat", viewBox: "0 0 24 24", markup: '<path d="M4.5 6.5h15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8l-4.5 3V17h-2a2 2 0 0 1-2-2v-6.5a2 2 0 0 1 2-2z" />' },
  { id: "star", label: "Star", viewBox: "0 0 24 24", markup: '<path d="m12 4.5 2.3 4.7 5.2.8-3.8 3.7.9 5.2L12 16.5l-4.6 2.4.9-5.2-3.8-3.7 5.2-.8z" />' },
  { id: "bolt", label: "Bolt", viewBox: "0 0 24 24", markup: '<path d="M13.8 3.8 6.5 13h4.8l-1.1 7.2 7.3-9.1h-4.8z" />' },
  { id: "link", label: "Link", viewBox: "0 0 24 24", markup: '<path d="M10 14 8.2 15.8a3.2 3.2 0 0 1-4.6-4.6L6 8.8a3.2 3.2 0 0 1 4.6 0" /><path d="M14 10l1.8-1.8a3.2 3.2 0 0 1 4.6 4.6L18 15.2a3.2 3.2 0 0 1-4.6 0" /><path d="M8.8 15.2 15.2 8.8" />' }
];

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

function widgetDefaultGridSize(type, def) {
  const rawW = Number(def?.defaultGridSize?.w);
  const rawH = Number(def?.defaultGridSize?.h);
  if (Number.isFinite(rawW) && Number.isFinite(rawH) && rawW >= 1 && rawH >= 1) {
    return {
      colSpan: Math.max(1, Math.floor(rawW)),
      rowSpan: Math.max(1, Math.floor(rawH))
    };
  }
  if (type === "container") {
    return { colSpan: 1, rowSpan: 1 };
  }
  if (type === "shortcut") {
    return { colSpan: 1, rowSpan: 1 };
  }
  return { colSpan: 2, rowSpan: 2 };
}

function normalizeContainerExpandedCols(value, fallback = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, GRID_MAX_COLUMNS);
  }
  return clamp(Math.round(num), 1, GRID_MAX_COLUMNS);
}

function normalizeContainerExpandedRows(value, fallback = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 1, GRID_MAX_ROWS);
  }
  return clamp(Math.round(num), 1, GRID_MAX_ROWS);
}

function normalizeGridLayout(layout, fallback) {
  const rawCol = Number(layout?.col);
  const rawRow = Number(layout?.row);
  const rawColSpan = Number(layout?.colSpan);
  const rawRowSpan = Number(layout?.rowSpan);
  const fallbackCol = Number(fallback?.col) || 0;
  const fallbackRow = Number(fallback?.row) || 0;
  const fallbackColSpan = Number(fallback?.colSpan) || 1;
  const fallbackRowSpan = Number(fallback?.rowSpan) || 1;

  return {
    col: Math.max(0, Math.floor(Number.isFinite(rawCol) ? rawCol : fallbackCol)),
    row: Math.max(0, Math.floor(Number.isFinite(rawRow) ? rawRow : fallbackRow)),
    colSpan: Math.max(1, Math.floor(Number.isFinite(rawColSpan) ? rawColSpan : fallbackColSpan)),
    rowSpan: Math.max(1, Math.floor(Number.isFinite(rawRowSpan) ? rawRowSpan : fallbackRowSpan))
  };
}

function gridMetrics(instances = state.instances) {
  const home = normalizeHomeLayout(state.ui.home);
  state.ui.home = home;

  const boardW = Math.max(1, Math.floor(elements.board.clientWidth));
  const boardH = Math.max(1, Math.floor(elements.board.clientHeight));
  const cols = clamp(Number(home.gridColumns) || 4, 1, GRID_MAX_COLUMNS);
  const rows = clamp(Number(home.gridRows) || 3, 1, GRID_MAX_ROWS);
  const marginX = marginPresetToPx(home.marginHorizontal);
  const marginY = marginPresetToPx(home.marginVertical);
  const gap = gapPresetToPx(home.itemGap);
  const gapX = gap;
  const gapY = gap;

  const availableW = Math.max(1, boardW - marginX * 2 - gapX * (cols - 1));
  const availableH = Math.max(1, boardH - marginY * 2 - gapY * (rows - 1));
  const cellW = Math.max(1, Math.floor(availableW / cols));
  const cellH = Math.max(1, Math.floor(availableH / rows));

  return {
    boardW,
    boardH,
    cols,
    rows,
    marginX,
    marginY,
    gapX,
    gapY,
    cellW,
    cellH
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
    redditSubreddit: "EarthPorn",
    redditTime: "week",
    rotateMinutes: 15,
    wallpaperCachedUrl: "",
    wallpaperCachedAt: 0,
    wallpaperCachedSignature: "",
    videoSource: "manual",
    videoUrl: "",
    redditVideoSubreddit: "loopingvideos",
    redditVideoTime: "week",
    videoCacheSignature: "",
    videoCacheStoredAt: 0,
    blurAmount: 0,
    overlayOpacity: 0.24
  };
}

function defaultUi() {
  return {
    activeTab: "global",
    settingsOpen: false,
    theme: defaultTheme(),
    background: defaultBackground(),
    home: defaultHomeLayout(),
    widgetCommonMaster: defaultWidgetCommonMaster(),
    shortcuts: {
      iconSizePercent: 100
    },
    defaultProfileSnapshot: null,
    defaultProfileUpdatedAt: 0
  };
}

function defaultHomeLayout() {
  return {
    mode: "grid",
    gridColumns: 4,
    gridRows: 3,
    marginHorizontal: "medium",
    marginVertical: "medium",
    itemGap: "narrow",
    pageCount: 1,
    activePage: 0,
    dockEnabled: true,
    dockShape: "raised",
    dockVisibility: "always",
    dockPosition: "bottom",
    dockLength: 6,
    widgetBackdropBlur: true,
    legacyHeadlessSurfaceMigrated: false
  };
}

function defaultWidgetCommonMaster() {
  return {
    viewMode: "window",
    surfaceMode: "normal",
    transparentAutoContrast: true,
    transparentGhostStrength: 100,
    backdropBlur: true,
    edgeRoundness: 12,
    transparency: 0.94,
    contentAlignY: "top",
    contentFillParent: false,
    contentPadding: 10,
    contentFontScale: 1,
    widgetThemeMode: "inherit",
    useCustomColors: false,
    customTextColor: "#1F2226",
    customAccentColor: "#1F4F9F",
    customSurfaceColor: "#FFFAF2"
  };
}

function defaultPresets() {
  return [];
}

function normalizeTransparency(value, fallback = 0.94) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(fallback, 0, 1);
  }
  return clamp(num, 0, 1);
}

function normalizeContentPadding(value, fallback = 10) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 0, 48);
  }
  return clamp(Math.round(num), 0, 48);
}

function normalizeWidgetContentFontScale(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Number(fallback) || 1, 0.5, 2);
  }
  return clamp(num, 0.5, 2);
}

function normalizeEdgeRoundness(value, fallback = 12) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 0, 40);
  }
  return clamp(Math.round(num), 0, 40);
}

function widgetPaddingFallback(type) {
  return type === "shortcut" || type === "aiChat" || type === "container" ? 8 : 10;
}

function isHeadlessTransparentDefaultType(type) {
  return type === "shortcut" || type === "clock" || type === "search" || type === "container";
}

function defaultWidgetContentAlign(type) {
  return isHeadlessTransparentDefaultType(type) ? "center" : "top";
}

function defaultWidgetBackdropBlur(type) {
  return !isHeadlessTransparentDefaultType(type);
}

function resolveWidgetPadding(instance) {
  const fallback = widgetPaddingFallback(instance?.type);
  const uniform = normalizeContentPadding(instance?.contentPadding, fallback);

  const legacyTopRight = normalizeContentPadding(instance?.contentPaddingTopRight, uniform);
  const legacyBottomLeft = normalizeContentPadding(instance?.contentPaddingBottomLeft, uniform);

  const top = normalizeContentPadding(instance?.contentPaddingTop, legacyTopRight);
  const right = normalizeContentPadding(instance?.contentPaddingRight, legacyTopRight);
  const bottom = normalizeContentPadding(instance?.contentPaddingBottom, legacyBottomLeft);
  const left = normalizeContentPadding(instance?.contentPaddingLeft, legacyBottomLeft);

  return { top, right, bottom, left, uniform };
}

function normalizeAlign(value, fallback = "top") {
  if (value === "top" || value === "center" || value === "bottom") {
    return value;
  }
  return fallback;
}

function normalizeSurfaceMode(value, fallback = "normal") {
  if (value === "normal" || value === "transparent") {
    return value;
  }
  return fallback;
}

function normalizeWidgetThemeMode(value, fallback = "inherit") {
  if (value === "inherit" || value === "light" || value === "dark") {
    return value;
  }
  return fallback;
}

function normalizeWidgetColor(value, fallback) {
  const normalized = normalizeHexColor(value, fallback);
  return typeof normalized === "string" ? normalized.toUpperCase() : fallback;
}

function normalizeTransparentGhostStrength(value, fallback = 100) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 40, 180);
  }
  return clamp(Math.round(num), 40, 180);
}

const AUTO_LIGHT_WIDGET_TEXT = "#F3F7FF";
const AUTO_DARK_WIDGET_TEXT = "#151A23";

function hexToRgb(hex, fallback = "#000000") {
  const value = normalizeHexColor(hex, fallback).slice(1);
  if (value.length === 3) {
    return {
      r: Number.parseInt(value[0] + value[0], 16),
      g: Number.parseInt(value[1] + value[1], 16),
      b: Number.parseInt(value[2] + value[2], 16)
    };
  }
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function srgbToLinear(channel) {
  const c = clamp(channel, 0, 255) / 255;
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return ((c + 0.055) / 1.055) ** 2.4;
}

function luminanceFromHex(hex, fallback = "#000000") {
  const rgb = hexToRgb(hex, fallback);
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

function contrastRatio(lumA, lumB) {
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function applyBackdropOverlayLuminance(baseLum, ui) {
  const overlay = clamp(Number(ui?.background?.overlayOpacity) || 0.24, 0, 0.85);
  const overlayLum = luminanceFromHex("#080B10");
  return clamp(baseLum, 0, 1) * (1 - overlay) + overlayLum * overlay;
}

function pickBestAutoTextColor(backdropLum) {
  const lightContrast = contrastRatio(luminanceFromHex(AUTO_LIGHT_WIDGET_TEXT), backdropLum);
  const darkContrast = contrastRatio(luminanceFromHex(AUTO_DARK_WIDGET_TEXT), backdropLum);
  return lightContrast >= darkContrast ? AUTO_LIGHT_WIDGET_TEXT : AUTO_DARK_WIDGET_TEXT;
}

function estimateTransparentBackdropLuminance(ui) {
  const mode = String(ui?.background?.mode || "gradient");

  const themeBackgroundLum = luminanceFromHex(normalizeHexColor(ui?.theme?.background, "#F3EFE6"));
  const themeSurfaceLum = luminanceFromHex(normalizeHexColor(ui?.theme?.surface, "#FFFAF2"));
  const themeAccentLum = luminanceFromHex(normalizeHexColor(ui?.theme?.accent, "#1F4F9F"));

  let baseLum = themeBackgroundLum;
  if (mode === "solid") {
    baseLum = luminanceFromHex(normalizeHexColor(ui?.background?.solidColor, "#1F2937"));
  } else if (mode === "gradient") {
    baseLum = (themeBackgroundLum + themeSurfaceLum + themeAccentLum) / 3;
  } else if (mode === "wallpaper" || mode === "video") {
    baseLum = clamp((themeBackgroundLum + 0.58) / 2, 0, 1);
  }

  return applyBackdropOverlayLuminance(baseLum, ui);
}

function resolveTransparentWidgetText(instance, ui) {
  const mode = String(ui?.background?.mode || "gradient");
  const autoContrastEnabled = instance?.transparentAutoContrast !== false;
  const themeText = normalizeWidgetColor(ui?.theme?.text, "#1F2226");
  const manualText = instance.useCustomColors
    ? normalizeWidgetColor(instance.customTextColor, themeText)
    : themeText;

  if (!autoContrastEnabled) {
    return manualText;
  }

  const sampledBackdropLum =
    mode === "wallpaper" && Number.isFinite(sampledWallpaperBaseLuminance)
      ? applyBackdropOverlayLuminance(sampledWallpaperBaseLuminance, ui)
      : null;
  const backdropLum = Number.isFinite(sampledBackdropLum)
    ? sampledBackdropLum
    : estimateTransparentBackdropLuminance(ui);
  const manualLum = luminanceFromHex(manualText);
  const manualContrast = contrastRatio(manualLum, backdropLum);
  const minimumContrast = mode === "wallpaper" || mode === "video" ? 4.1 : 3.4;

  if (manualContrast >= minimumContrast) {
    return manualText;
  }

  return pickBestAutoTextColor(backdropLum);
}

function resolveTransparentGhostOpacity(ui, strengthPercent = 100) {
  const mode = String(ui?.background?.mode || "gradient");
  const overlay = clamp(Number(ui?.background?.overlayOpacity) || 0.24, 0, 0.85);
  const base = mode === "wallpaper" || mode === "video" ? 0.16 : 0.08;
  const compensation = overlay < 0.16 ? (0.16 - overlay) * 0.35 : 0;
  const strength = normalizeTransparentGhostStrength(strengthPercent, 100) / 100;
  return clamp((base + compensation) * strength, 0.04, 0.32);
}

function normalizeWidgetCommonMaster(value) {
  const base = {
    ...defaultWidgetCommonMaster(),
    ...(value && typeof value === "object" ? value : {})
  };

  return {
    viewMode: base.viewMode === "headless" ? "headless" : "window",
    surfaceMode: normalizeSurfaceMode(base.surfaceMode, "normal"),
    transparentAutoContrast: base.transparentAutoContrast !== false,
    transparentGhostStrength: normalizeTransparentGhostStrength(base.transparentGhostStrength, 100),
    backdropBlur: base.backdropBlur !== false,
    edgeRoundness: normalizeEdgeRoundness(base.edgeRoundness, 12),
    transparency: normalizeTransparency(base.transparency, 0.94),
    contentAlignY: normalizeAlign(base.contentAlignY, "top"),
    contentFillParent: Boolean(base.contentFillParent),
    contentPadding: normalizeContentPadding(base.contentPadding, 10),
    contentFontScale: normalizeWidgetContentFontScale(base.contentFontScale, 1),
    widgetThemeMode: normalizeWidgetThemeMode(base.widgetThemeMode, "inherit"),
    useCustomColors: Boolean(base.useCustomColors),
    customTextColor: normalizeWidgetColor(base.customTextColor, "#1F2226"),
    customAccentColor: normalizeWidgetColor(base.customAccentColor, "#1F4F9F"),
    customSurfaceColor: normalizeWidgetColor(base.customSurfaceColor, "#FFFAF2")
  };
}

function normalizeCommonOverrides(value) {
  const out = {};
  const raw = value && typeof value === "object" ? value : {};
  for (const key of WIDGET_COMMON_MASTER_KEYS) {
    out[key] = Boolean(raw[key]);
  }
  return out;
}

function instanceCommonValue(instance, key) {
  if (key === "contentPadding") {
    const padding = resolveWidgetPadding(instance);
    return normalizeContentPadding((padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform);
  }
  if (key === "contentFontScale") {
    return normalizeWidgetContentFontScale(instance.contentFontScale, 1);
  }
  if (key === "transparency") {
    return normalizeTransparency(instance.transparency, 0.94);
  }
  if (key === "backdropBlur") {
    return instance.backdropBlur !== false;
  }
  if (key === "edgeRoundness") {
    return normalizeEdgeRoundness(instance.edgeRoundness, 12);
  }
  if (key === "contentAlignY") {
    return instance.type === "aiChat" ? "top" : normalizeAlign(instance.contentAlignY, defaultWidgetContentAlign(instance.type));
  }
  if (key === "contentFillParent") {
    return instance.type === "aiChat" ? true : Boolean(instance.contentFillParent);
  }
  if (key === "viewMode") {
    return instance.viewMode === "headless" ? "headless" : "window";
  }
  if (key === "surfaceMode") {
    return normalizeSurfaceMode(instance.surfaceMode, "normal");
  }
  if (key === "transparentAutoContrast") {
    return instance.transparentAutoContrast !== false;
  }
  if (key === "transparentGhostStrength") {
    return normalizeTransparentGhostStrength(instance.transparentGhostStrength, 100);
  }
  if (key === "widgetThemeMode") {
    return normalizeWidgetThemeMode(instance.widgetThemeMode, "inherit");
  }
  if (key === "useCustomColors") {
    return Boolean(instance.useCustomColors);
  }
  if (key === "customTextColor") {
    return normalizeWidgetColor(instance.customTextColor, "#1F2226");
  }
  if (key === "customAccentColor") {
    return normalizeWidgetColor(instance.customAccentColor, "#1F4F9F");
  }
  if (key === "customSurfaceColor") {
    return normalizeWidgetColor(instance.customSurfaceColor, "#FFFAF2");
  }
  return instance[key];
}

function setInstanceCommonValue(instance, key, value) {
  if (key === "contentPadding") {
    const fallback = widgetPaddingFallback(instance.type);
    const padding = normalizeContentPadding(value, fallback);
    instance.contentPadding = padding;
    instance.contentPaddingTop = padding;
    instance.contentPaddingRight = padding;
    instance.contentPaddingBottom = padding;
    instance.contentPaddingLeft = padding;
    instance.contentPaddingTopRight = padding;
    instance.contentPaddingBottomLeft = padding;
    return;
  }

  if (key === "contentFontScale") {
    instance.contentFontScale = normalizeWidgetContentFontScale(value, 1);
    return;
  }

  if (key === "contentAlignY") {
    instance.contentAlignY = instance.type === "aiChat" ? "top" : normalizeAlign(value, defaultWidgetContentAlign(instance.type));
    return;
  }

  if (key === "contentFillParent") {
    instance.contentFillParent = instance.type === "aiChat" ? true : Boolean(value);
    return;
  }

  if (key === "backdropBlur") {
    instance.backdropBlur = value !== false;
    return;
  }

  if (key === "edgeRoundness") {
    instance.edgeRoundness = normalizeEdgeRoundness(value, 12);
    return;
  }

  if (key === "viewMode") {
    instance.viewMode = value === "headless" ? "headless" : "window";
    return;
  }

  if (key === "surfaceMode") {
    instance.surfaceMode = normalizeSurfaceMode(value, "normal");
    return;
  }

  if (key === "transparentAutoContrast") {
    instance.transparentAutoContrast = value !== false;
    return;
  }

  if (key === "transparentGhostStrength") {
    instance.transparentGhostStrength = normalizeTransparentGhostStrength(value, 100);
    return;
  }

  if (key === "transparency") {
    instance.transparency = normalizeTransparency(value, 0.94);
    return;
  }

  if (key === "widgetThemeMode") {
    instance.widgetThemeMode = normalizeWidgetThemeMode(value, "inherit");
    return;
  }

  if (key === "useCustomColors") {
    instance.useCustomColors = Boolean(value);
    return;
  }

  if (key === "customTextColor") {
    instance.customTextColor = normalizeWidgetColor(value, "#1F2226");
    return;
  }

  if (key === "customAccentColor") {
    instance.customAccentColor = normalizeWidgetColor(value, "#1F4F9F");
    return;
  }

  if (key === "customSurfaceColor") {
    instance.customSurfaceColor = normalizeWidgetColor(value, "#FFFAF2");
  }
}

function inferCommonOverrides(instance, master) {
  const out = {};
  for (const key of WIDGET_COMMON_MASTER_KEYS) {
    out[key] = instanceCommonValue(instance, key) !== master[key];
  }
  return out;
}

function applyWidgetCommonMaster(instance, master, force = false) {
  const overrides = normalizeCommonOverrides(instance.commonOverrides);
  for (const key of WIDGET_COMMON_MASTER_KEYS) {
    if (!force && overrides[key]) {
      continue;
    }
    setInstanceCommonValue(instance, key, master[key]);
  }
  instance.commonOverrides = normalizeCommonOverrides(instance.commonOverrides);
}

function normalizeHomeMode(value, fallback = "grid") {
  if (value === "grid" || value === "free") {
    return value;
  }
  return fallback;
}

function normalizeMarginPreset(value, fallback = "medium") {
  if (value === "wide" || value === "medium" || value === "narrow" || value === "none") {
    return value;
  }
  return fallback;
}

function normalizeGapPreset(value, fallback = "narrow") {
  if (value === "wide" || value === "narrow" || value === "none") {
    return value;
  }
  return fallback;
}

function normalizeDockShape(value, fallback = "raised") {
  if (value === "raised" || value === "flat") {
    return value;
  }
  return fallback;
}

function normalizeDockVisibility(value, fallback = "always") {
  if (value === "always" || value === "hover") {
    return value;
  }
  return fallback;
}

function normalizeDockPosition(value, fallback = "bottom") {
  if (value === "top" || value === "bottom" || value === "left" || value === "right") {
    return value;
  }
  return fallback;
}

function normalizeDockLength(value, fallback = 6) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.floor(fallback), 5, 14);
  }
  return clamp(Math.floor(num), 5, 14);
}

/**
 * @typedef {Object} DockItem
 * @property {string} id
 * @property {string} label
 * @property {string} iconText
 * @property {number | null} badge
 * @property {number} page
 */

/**
 * @typedef {Object} DockConfig
 * @property {boolean} enabled
 * @property {"raised" | "flat"} shape
 * @property {"always" | "hover"} visibility
 * @property {number} lengthUnits
 * @property {number} heightPx
 * @property {"bottom"} position
 */

function normalizeDockOrder(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(0, Math.floor(num));
}

function isWidgetDocked(instance) {
  return normalizeDockOrder(instance?.dockOrder, null) !== null;
}

function normalizeDockedWidgetOrders(instances) {
  if (!Array.isArray(instances) || !instances.length) {
    return;
  }
  const docked = instances
    .filter((instance) => isWidgetDocked(instance))
    .sort((a, b) => {
      const orderA = normalizeDockOrder(a.dockOrder, Number.MAX_SAFE_INTEGER);
      const orderB = normalizeDockOrder(b.dockOrder, Number.MAX_SAFE_INTEGER);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return String(a.id).localeCompare(String(b.id));
    });

  for (let i = 0; i < docked.length; i += 1) {
    docked[i].dockOrder = i;
  }
}

function normalizeContainerId(value) {
  return normalizeText(value);
}

function isWidgetInContainer(instance) {
  return normalizeContainerId(instance?.containerId) !== "";
}

function normalizeContainerAssignments(instances) {
  if (!Array.isArray(instances) || !instances.length) {
    return;
  }

  const validContainers = new Set(
    instances
      .filter((instance) => instance && instance.type === "container")
      .map((instance) => String(instance.id))
  );

  for (const instance of instances) {
    if (!instance || instance.type === "container") {
      if (instance) {
        instance.containerId = "";
      }
      continue;
    }

    const containerId = normalizeContainerId(instance.containerId);
    if (!containerId || !validContainers.has(containerId) || containerId === String(instance.id)) {
      instance.containerId = "";
      continue;
    }

    instance.containerId = containerId;
    instance.dockOrder = null;
  }
}

function containerUnitLayoutSize() {
  if (!elements.board || !state?.ui?.home || !Array.isArray(state?.instances)) {
    return { w: 120, h: 120 };
  }

  if (!isGridLayoutMode()) {
    const shortcutDefault = widgetRegistry?.shortcut?.defaultLayout || {};
    const shortcutW = Number(shortcutDefault.w);
    const shortcutH = Number(shortcutDefault.h);
    return {
      w: clamp(Math.round(Number.isFinite(shortcutW) ? shortcutW : 120), 80, 360),
      h: clamp(Math.round(Number.isFinite(shortcutH) ? shortcutH : 120), 80, 360)
    };
  }

  const metrics = gridMetrics();
  return {
    w: Math.max(80, Math.round(metrics.cellW)),
    h: Math.max(80, Math.round(metrics.cellH))
  };
}

function enforceContainerWidgetSize(instance) {
  if (!instance || instance.type !== "container") {
    return;
  }

  const unit = containerUnitLayoutSize();
  instance.layout.w = unit.w;
  instance.layout.h = unit.h;

  if (instance.gridLayout && typeof instance.gridLayout === "object") {
    instance.gridLayout.colSpan = 1;
    instance.gridLayout.rowSpan = 1;
  }
}

function dockedInstances(instances = state?.instances) {
  if (!Array.isArray(instances)) {
    return [];
  }
  return instances
    .filter((instance) => instance.enabled !== false && isWidgetDocked(instance) && !isWidgetInContainer(instance))
    .sort((a, b) => {
      const orderA = normalizeDockOrder(a.dockOrder, Number.MAX_SAFE_INTEGER);
      const orderB = normalizeDockOrder(b.dockOrder, Number.MAX_SAFE_INTEGER);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return String(a.id).localeCompare(String(b.id));
    });
}

function nextDockOrder() {
  let maxOrder = -1;
  for (const instance of state?.instances || []) {
    const order = normalizeDockOrder(instance?.dockOrder, null);
    if (order === null) {
      continue;
    }
    maxOrder = Math.max(maxOrder, order);
  }
  return maxOrder + 1;
}

function dockIconTextFromLabel(label) {
  const compact = normalizeText(label, "W").replace(/\s+/g, "").slice(0, 2);
  return compact || "W";
}

function normalizeDockActiveId(items, candidate = dockUiState.activeId) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }
  const candidateId = normalizeText(candidate);
  if (candidateId && items.some((item) => item.id === candidateId)) {
    return candidateId;
  }
  const selected = normalizeText(state?.selectedWidgetId);
  if (selected && items.some((item) => item.id === selected)) {
    return selected;
  }
  return items[0].id;
}

function setDockActiveId(nextId, { rerender = true } = {}) {
  const normalized = normalizeText(nextId);
  if (dockUiState.activeId === normalized) {
    return;
  }
  dockUiState.activeId = normalized;
  if (rerender) {
    renderDockWidgets();
  }
}

/** @returns {DockConfig} */
function buildDockConfig(home = state?.ui?.home) {
  const normalizedHome = normalizeHomeLayout(home || defaultHomeLayout());
  return {
    enabled: normalizedHome.dockEnabled !== false,
    shape: normalizeDockShape(normalizedHome.dockShape, "raised"),
    visibility: normalizeDockVisibility(normalizedHome.dockVisibility, "always"),
    lengthUnits: normalizeDockLength(normalizedHome.dockLength, 6),
    heightPx: 44,
    position: "bottom"
  };
}

/** @returns {DockItem[]} */
function buildDockItems(instances = state?.instances) {
  const activePage = currentLauncherActivePage();
  return dockedInstances(instances).map((instance) => {
    const label = normalizeText(instance.title, widgetRegistry[instance.type]?.title || "Widget");
    const page = normalizeWidgetPage(instance.page, currentLauncherPageCount(), 0);
    return {
      id: instance.id,
      label,
      iconText: dockIconTextFromLabel(label),
      badge: page === activePage ? null : page + 1,
      page
    };
  });
}

function normalizePageCount(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.floor(fallback), 1, MAX_LAUNCHER_PAGES);
  }
  return clamp(Math.floor(num), 1, MAX_LAUNCHER_PAGES);
}

function normalizeActivePage(value, pageCount = 1, fallback = 0) {
  const maxPage = Math.max(0, normalizePageCount(pageCount, 1) - 1);
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.floor(fallback), 0, maxPage);
  }
  return clamp(Math.floor(num), 0, maxPage);
}

function normalizeWidgetPage(value, pageCount = MAX_LAUNCHER_PAGES, fallback = 0) {
  const num = Number(value);
  const maxPage = Math.max(0, normalizePageCount(pageCount, 1) - 1);
  if (!Number.isFinite(num)) {
    return clamp(Math.floor(fallback), 0, maxPage);
  }
  return clamp(Math.floor(num), 0, maxPage);
}

function marginPresetToPx(value) {
  if (value === "wide") {
    return 40;
  }
  if (value === "narrow") {
    return 14;
  }
  if (value === "none") {
    return 0;
  }
  return 26;
}

function gapPresetToPx(value) {
  if (value === "wide") {
    return 16;
  }
  if (value === "none") {
    return 0;
  }
  return 8;
}

function normalizeHomeLayout(layout) {
  const base = {
    ...defaultHomeLayout(),
    ...(layout || {})
  };
  const pageCount = normalizePageCount(base.pageCount, 1);

  return {
    mode: normalizeHomeMode(base.mode, "grid"),
    gridColumns: clamp(Number(base.gridColumns) || 4, 1, GRID_MAX_COLUMNS),
    gridRows: clamp(Number(base.gridRows) || 3, 1, GRID_MAX_ROWS),
    marginHorizontal: normalizeMarginPreset(base.marginHorizontal, "medium"),
    marginVertical: normalizeMarginPreset(base.marginVertical, "medium"),
    itemGap: normalizeGapPreset(base.itemGap, "narrow"),
    pageCount,
    activePage: normalizeActivePage(base.activePage, pageCount, 0),
    dockEnabled: base.dockEnabled !== false,
    dockShape: normalizeDockShape(base.dockShape, "raised"),
    dockVisibility: normalizeDockVisibility(base.dockVisibility, "always"),
    dockPosition: normalizeDockPosition(base.dockPosition, "bottom"),
    dockLength: normalizeDockLength(base.dockLength, 6),
    widgetBackdropBlur: base.widgetBackdropBlur !== false,
    legacyHeadlessSurfaceMigrated: base.legacyHeadlessSurfaceMigrated === true
  };
}

function defaultInstances() {
  const order = ["clock", "search", "aiChat", "bookmarks", "shortcut", "todo", "notes", "label"];
  return order
    .filter((type) => widgetRegistry[type])
    .map((type, idx) => {
      const def = widgetRegistry[type];
      const defaultSize = widgetDefaultGridSize(type, def);
      const defaultPadding = widgetPaddingFallback(type);
      return {
        id: `${type}-${idx + 1}`,
        type,
        title: def.title,
        zIndex: idx + 1,
        viewMode: isHeadlessTransparentDefaultType(type) ? "headless" : "window",
        surfaceMode: isHeadlessTransparentDefaultType(type) ? "transparent" : "normal",
        transparentAutoContrast: true,
        transparentGhostStrength: 100,
        backdropBlur: defaultWidgetBackdropBlur(type),
        edgeRoundness: 12,
        transparency: 0.94,
        contentAlignY: defaultWidgetContentAlign(type),
        contentFillParent: type === "aiChat",
        contentPadding: defaultPadding,
        contentPaddingTop: defaultPadding,
        contentPaddingRight: defaultPadding,
        contentPaddingBottom: defaultPadding,
        contentPaddingLeft: defaultPadding,
        contentPaddingTopRight: defaultPadding,
        contentPaddingBottomLeft: defaultPadding,
        contentFontScale: 1,
        widgetThemeMode: "inherit",
        useCustomColors: false,
        customTextColor: "#1F2226",
        customAccentColor: "#1F4F9F",
        customSurfaceColor: "#FFFAF2",
        commonOverrides: normalizeCommonOverrides({}),
        page: 0,
        dockOrder: null,
        containerId: "",
        config: structuredClone(def.defaultConfig || {}),
        gridLayout: {
          col: idx % 4,
          row: Math.floor(idx / 4),
          colSpan: defaultSize.colSpan,
          rowSpan: defaultSize.rowSpan
        },
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
    meta: {
      lastUserMutationAt: 0
    },
    ui: defaultUi(),
    presets: defaultPresets(),
    instances: defaultInstances()
  };
}

function clonePresetSnapshot(snapshot) {
  return {
    ui: {
      theme: { ...(snapshot?.ui?.theme || {}) },
      background: { ...(snapshot?.ui?.background || {}) },
      home: { ...(snapshot?.ui?.home || {}) },
      widgetCommonMaster: { ...(snapshot?.ui?.widgetCommonMaster || {}) },
      shortcuts: { ...(snapshot?.ui?.shortcuts || {}) }
    },
    instances: Array.isArray(snapshot?.instances)
      ? snapshot.instances.map((instance) => ({ ...instance, config: { ...(instance.config || {}) } }))
      : []
  };
}

function createStateSnapshot() {
  return {
    ui: {
      theme: structuredClone(state.ui.theme),
      background: structuredClone(state.ui.background),
      home: structuredClone(state.ui.home),
      widgetCommonMaster: structuredClone(state.ui.widgetCommonMaster),
      shortcuts: structuredClone(state.ui.shortcuts)
    },
    instances: state.instances.map((instance) => ({
      ...structuredClone(instance),
      zIndex: Math.max(1, Number(instance.zIndex) || 1),
      surfaceMode: normalizeSurfaceMode(instance.surfaceMode, "normal"),
      edgeRoundness: normalizeEdgeRoundness(instance.edgeRoundness, 12),
      contentAlignY: normalizeAlign(instance.contentAlignY, defaultWidgetContentAlign(instance.type)),
      transparency: normalizeTransparency(instance.transparency, 0.94)
    }))
  };
}

function inferNextId(instances, fallback) {
  let maxId = Number(fallback) || 100;
  for (const instance of instances || []) {
    const id = String(instance?.id || "");
    const match = id.match(/-(\d+)$/);
    if (!match) {
      continue;
    }
    const num = Number(match[1]);
    if (Number.isFinite(num)) {
      maxId = Math.max(maxId, num + 1);
    }
  }
  return maxId;
}

function savePreset(nameInput) {
  recordHistorySnapshot("Save preset");
  const name = normalizeText(nameInput, "Preset");
  const now = Date.now();
  const snapshot = createStateSnapshot();
  const byName = state.presets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());

  if (byName) {
    byName.snapshot = clonePresetSnapshot(snapshot);
    byName.updatedAt = now;
  } else {
    state.presets.push({
      id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
      name,
      createdAt: now,
      updatedAt: now,
      snapshot: clonePresetSnapshot(snapshot)
    });
  }

  state.presets.sort((a, b) => b.updatedAt - a.updatedAt);
  renderSettings();
  queueSave();
}

function applyProfileSnapshot(snapshotInput, scope = "all") {
  const applyGlobal = scope === "all" || scope === "global";
  const applyBackgroundOnly = scope === "all" || scope === "background";
  const applyWidgets = scope === "all" || scope === "widgets";

  const snapshot = clonePresetSnapshot(snapshotInput);
  const hydrated = hydrate({
    ...state,
    ui: {
      activeTab: state.ui.activeTab,
      theme: {
        ...state.ui.theme,
        ...(applyGlobal ? snapshot.ui?.theme || {} : {})
      },
      background: {
        ...state.ui.background,
        ...(applyBackgroundOnly ? snapshot.ui?.background || {} : {})
      },
      home: {
        ...state.ui.home,
        ...(applyGlobal ? snapshot.ui?.home || {} : {})
      },
      widgetCommonMaster: {
        ...state.ui.widgetCommonMaster,
        ...(applyGlobal ? snapshot.ui?.widgetCommonMaster || {} : {})
      },
      shortcuts: {
        ...state.ui.shortcuts,
        ...(applyGlobal ? snapshot.ui?.shortcuts || {} : {})
      },
      defaultProfileSnapshot: state.ui.defaultProfileSnapshot,
      defaultProfileUpdatedAt: state.ui.defaultProfileUpdatedAt
    },
    instances:
      applyWidgets && Array.isArray(snapshot.instances) && snapshot.instances.length
        ? snapshot.instances
        : state.instances,
    presets: state.presets
  });

  state.ui.theme = hydrated.ui.theme;
  state.ui.background = hydrated.ui.background;
  state.ui.home = normalizeHomeLayout(hydrated.ui.home);
  state.ui.widgetCommonMaster = normalizeWidgetCommonMaster(hydrated.ui.widgetCommonMaster);
  state.ui.shortcuts = {
    iconSizePercent: clamp(Number(hydrated.ui.shortcuts?.iconSizePercent) || 100, 40, 220)
  };

  if (applyWidgets) {
    state.instances = hydrated.instances;
    state.selectedWidgetId = "";
    state.nextId = inferNextId(state.instances, hydrated.nextId);
    for (const instance of state.instances) {
      applyWidgetCommonMaster(instance, state.ui.widgetCommonMaster, false);
      if (!instance.commonOverrides || !Object.keys(instance.commonOverrides).length) {
        instance.commonOverrides = inferCommonOverrides(instance, state.ui.widgetCommonMaster);
      }
    }
  }

  syncLauncherPagingState({ expandToFitInstances: true });

  closeWidgetModal(false);

  applyTheme();
  setBodyMode();
  applyBackground();

  if (applyWidgets) {
    renderBoard();
  } else {
    for (const instance of state.instances) {
      applyWidgetCommonMaster(instance, state.ui.widgetCommonMaster, false);
      instance.commonOverrides = inferCommonOverrides(instance, state.ui.widgetCommonMaster);
      const rt = runtime.get(instance.id);
      if (rt?.card) {
        applyCardVisual(rt.card, instance);
      }
    }
    refreshAllWidgets();
    if (state.ui.home.mode === "grid") {
      applyGridLayout({ commitFreeLayout: false });
    } else {
      updateBoardBounds();
    }
  }

  renderSettings();
  queueSave();
}

function loadPresetById(presetId, scope = "all") {
  recordHistorySnapshot("Load preset");
  const preset = state.presets.find((entry) => entry.id === presetId);
  if (!preset) {
    return;
  }
  applyProfileSnapshot(preset.snapshot, scope);
}

function saveCurrentAsDefaultProfile() {
  recordHistorySnapshot("Set default profile");
  state.ui.defaultProfileSnapshot = clonePresetSnapshot(createStateSnapshot());
  state.ui.defaultProfileUpdatedAt = Date.now();
  renderSettings();
  queueSave();
}

function loadDefaultProfile(scope = "all") {
  const snapshot = state?.ui?.defaultProfileSnapshot;
  if (!snapshot || typeof snapshot !== "object") {
    return;
  }
  recordHistorySnapshot("Load default profile");
  applyProfileSnapshot(snapshot, scope);
}

function clearDefaultProfile() {
  if (!state?.ui?.defaultProfileSnapshot) {
    return;
  }
  recordHistorySnapshot("Clear default profile");
  state.ui.defaultProfileSnapshot = null;
  state.ui.defaultProfileUpdatedAt = 0;
  renderSettings();
  queueSave();
}

function deletePresetById(presetId) {
  recordHistorySnapshot("Delete preset");
  const index = state.presets.findIndex((entry) => entry.id === presetId);
  if (index < 0) {
    return;
  }
  state.presets.splice(index, 1);
  renderSettings();
  queueSave();
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
  const legacyHeadlessSurfaceMigrated = raw?.ui?.home?.legacyHeadlessSurfaceMigrated === true;
  let didLegacyHeadlessSurfaceMigration = false;
  const normalized = [];

  for (const item of instances) {
    const def = widgetRegistry[item.type];
    if (!def) {
      continue;
    }

    const isShortcut = item.type === "shortcut";
    const headlessTransparentByDefault = isHeadlessTransparentDefaultType(item.type);
    const isAiChat = item.type === "aiChat";
    const isContainerWidget = item.type === "container";
    const viewMode =
      item.viewMode === "headless" || item.viewMode === "window"
        ? item.viewMode
        : headlessTransparentByDefault
          ? "headless"
          : "window";
    const legacySurfaceFallback = viewMode === "headless" || headlessTransparentByDefault ? "transparent" : "normal";
    let surfaceMode = normalizeSurfaceMode(item.surfaceMode, legacySurfaceFallback);
    if (!legacyHeadlessSurfaceMigrated && viewMode === "headless" && item.surfaceMode === "normal") {
      surfaceMode = "transparent";
      didLegacyHeadlessSurfaceMigration = true;
    }
    const padding = resolveWidgetPadding({ type: item.type, ...item });
    const mergedConfig = {
      ...(structuredClone(def.defaultConfig || {})),
      ...(item.config || {})
    };

    if (isContainerWidget) {
      const legacyWidth = Number(mergedConfig.expandedWidth);
      const legacyHeight = Number(mergedConfig.expandedHeight);
      const fallbackCols = Number.isFinite(legacyWidth) ? Math.max(1, Math.round(legacyWidth / 220)) : 4;
      const fallbackRows = Number.isFinite(legacyHeight) ? Math.max(1, Math.round(legacyHeight / 180)) : 3;
      mergedConfig.expanded = mergedConfig.expanded === true;
      mergedConfig.expandedCols = normalizeContainerExpandedCols(mergedConfig.expandedCols, fallbackCols);
      mergedConfig.expandedRows = normalizeContainerExpandedRows(mergedConfig.expandedRows, fallbackRows);
      delete mergedConfig.expandedWidth;
      delete mergedConfig.expandedHeight;
    }

    if (isShortcut) {
      if (typeof mergedConfig.useGlobalIconSize !== "boolean") {
        mergedConfig.useGlobalIconSize = true;
      }
      const iconSize = Number(mergedConfig.iconSizePercent);
      mergedConfig.iconSizePercent = clamp(Number.isFinite(iconSize) ? iconSize : 100, 40, 220);
    }

    if (isAiChat) {
      mergedConfig.providerMode = mergedConfig.providerMode === "browser" ? "browser" : "chatgpt";
      if (!normalizeText(mergedConfig.endpoint)) {
        mergedConfig.endpoint =
          mergedConfig.providerMode === "browser"
            ? "https://api.openai.com/v1/responses"
            : "https://api.openai.com/v1/chat/completions";
      }
      mergedConfig.model = normalizeText(mergedConfig.model, mergedConfig.providerMode === "browser" ? "gpt-4.1-mini" : "gpt-4o-mini");
    }

    const normalizedGrid = normalizeGridLayout(item.gridLayout, {
      col: normalized.length % 4,
      row: Math.floor(normalized.length / 4),
      ...widgetDefaultGridSize(item.type, def)
    });
    if (isContainerWidget) {
      normalizedGrid.colSpan = 1;
      normalizedGrid.rowSpan = 1;
    }

    normalized.push({
      id: item.id || `${item.type}-${idSuffix()}`,
      type: item.type,
      title: item.title || def.title,
      zIndex: Math.max(1, Number(item.zIndex) || normalized.length + 1),
      viewMode,
      surfaceMode,
      transparentAutoContrast: item.transparentAutoContrast !== false,
      transparentGhostStrength: normalizeTransparentGhostStrength(item.transparentGhostStrength, 100),
      backdropBlur: typeof item.backdropBlur === "boolean" ? item.backdropBlur : defaultWidgetBackdropBlur(item.type),
      edgeRoundness: normalizeEdgeRoundness(item.edgeRoundness, 12),
      transparency: normalizeTransparency(item.transparency, 0.94),
      contentAlignY:
        isAiChat
          ? "top"
          : headlessTransparentByDefault &&
        (item.contentAlignY === undefined || item.contentAlignY === null || item.contentAlignY === "" || item.contentAlignY === "top")
            ? "center"
            : normalizeAlign(item.contentAlignY, defaultWidgetContentAlign(item.type)),
      contentFillParent: isShortcut ? false : isAiChat ? true : Boolean(item.contentFillParent),
      contentPadding: normalizeContentPadding((padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform),
      contentPaddingTop: padding.top,
      contentPaddingRight: padding.right,
      contentPaddingBottom: padding.bottom,
      contentPaddingLeft: padding.left,
      contentPaddingTopRight: normalizeContentPadding((padding.top + padding.right) / 2, padding.uniform),
      contentPaddingBottomLeft: normalizeContentPadding((padding.bottom + padding.left) / 2, padding.uniform),
      contentFontScale: normalizeWidgetContentFontScale(item.contentFontScale, 1),
      widgetThemeMode: normalizeWidgetThemeMode(item.widgetThemeMode, "inherit"),
      useCustomColors: Boolean(item.useCustomColors),
      customTextColor: normalizeWidgetColor(item.customTextColor, "#1F2226"),
      customAccentColor: normalizeWidgetColor(item.customAccentColor, "#1F4F9F"),
      customSurfaceColor: normalizeWidgetColor(item.customSurfaceColor, "#FFFAF2"),
      commonOverrides: normalizeCommonOverrides(item.commonOverrides),
      page: normalizeWidgetPage(item.page, MAX_LAUNCHER_PAGES, 0),
      dockOrder: normalizeDockOrder(item.dockOrder, null),
      containerId: isContainerWidget ? "" : normalizeContainerId(item.containerId),
      enabled: item.enabled !== false,
      gridLayout: normalizedGrid,
      layout: cloneLayout(item.layout || def.defaultLayout),
      config: mergedConfig
    });
  }

  normalizeDockedWidgetOrders(normalized);
  normalizeContainerAssignments(normalized);

  const rawUi = raw?.ui || {};
  const theme = {
    ...defaultTheme(),
    ...(rawUi.theme || {})
  };
  const background = {
    ...defaultBackground(),
    ...(rawUi.background || {})
  };
  const maxInstancePage = normalized.reduce((max, instance) => {
    if (isWidgetDocked(instance) || isWidgetInContainer(instance)) {
      return max;
    }
    return Math.max(max, normalizeWidgetPage(instance.page, MAX_LAUNCHER_PAGES, 0));
  }, 0);
  const home = normalizeHomeLayout({
    ...(rawUi.home || {}),
    pageCount: Math.max(Number(rawUi?.home?.pageCount) || 1, maxInstancePage + 1)
  });
  for (const instance of normalized) {
    instance.page = normalizeWidgetPage(instance.page, home.pageCount, 0);
  }
  if (didLegacyHeadlessSurfaceMigration) {
    home.legacyHeadlessSurfaceMigrated = true;
  }
  const widgetCommonMaster = normalizeWidgetCommonMaster(rawUi.widgetCommonMaster || {});
  const shortcuts = {
    iconSizePercent: clamp(Number(rawUi.shortcuts?.iconSizePercent) || 100, 40, 220)
  };
  const defaultProfileSnapshot =
    rawUi.defaultProfileSnapshot && typeof rawUi.defaultProfileSnapshot === "object" && !Array.isArray(rawUi.defaultProfileSnapshot)
      ? clonePresetSnapshot(rawUi.defaultProfileSnapshot)
      : null;
  const defaultProfileUpdatedAt = Math.max(0, Number(rawUi.defaultProfileUpdatedAt) || 0);
  const rawPresets = Array.isArray(raw?.presets) ? raw.presets : [];
  const presets = rawPresets
    .map((preset) => {
      if (!preset || typeof preset !== "object") {
        return null;
      }
      const snapshot = preset.snapshot;
      if (!snapshot || typeof snapshot !== "object") {
        return null;
      }
      return {
        id: normalizeText(preset.id, `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
        name: normalizeText(preset.name, "Preset"),
        createdAt: Number(preset.createdAt) || Date.now(),
        updatedAt: Number(preset.updatedAt) || Date.now(),
        snapshot: {
          ui: {
            theme: { ...(snapshot.ui?.theme || {}) },
            background: { ...(snapshot.ui?.background || {}) },
            home: { ...(snapshot.ui?.home || {}) },
            widgetCommonMaster: { ...(snapshot.ui?.widgetCommonMaster || {}) },
            shortcuts: { ...(snapshot.ui?.shortcuts || {}) }
          },
          instances: Array.isArray(snapshot.instances)
            ? snapshot.instances.map((instance) => ({ ...instance }))
            : []
        }
      };
    })
    .filter(Boolean);

  theme.primary = normalizeHexColor(theme.primary, defaultTheme().primary);
  theme.accent = normalizeHexColor(theme.accent, defaultTheme().accent);
  theme.secondary = normalizeHexColor(theme.secondary, defaultTheme().secondary);
  theme.background = normalizeHexColor(theme.background, defaultTheme().background);
  theme.surface = normalizeHexColor(theme.surface, defaultTheme().surface);
  theme.text = normalizeHexColor(theme.text, defaultTheme().text);
  theme.line = normalizeHexColor(theme.line, defaultTheme().line);
  theme.fontScale = clamp(Number(theme.fontScale) || 1, 0.5, 2);

  background.solidColor = normalizeHexColor(background.solidColor, defaultBackground().solidColor);
  background.wallpaperProvider = normalizeWallpaperProvider(background.wallpaperProvider, "picsum");
  background.wallpaperTheme = normalizeText(background.wallpaperTheme, "nature");
  background.redditSubreddit = normalizeText(background.redditSubreddit, "EarthPorn");
  background.redditTime = normalizeText(background.redditTime, "week");
  background.rotateMinutes = clamp(Number(background.rotateMinutes) || 15, 1, 240);
  background.wallpaperCachedUrl = normalizeText(background.wallpaperCachedUrl);
  background.wallpaperCachedSignature = normalizeText(background.wallpaperCachedSignature);
  background.wallpaperCachedAt = Math.max(0, Number(background.wallpaperCachedAt) || 0);
  background.videoSource = normalizeVideoSource(background.videoSource, "manual");
  background.videoUrl = normalizeText(background.videoUrl);
  background.redditVideoSubreddit = normalizeText(background.redditVideoSubreddit, "loopingvideos");
  background.redditVideoTime = normalizeText(background.redditVideoTime, "week");
  background.videoCacheSignature = normalizeText(background.videoCacheSignature);
  background.videoCacheStoredAt = Math.max(0, Number(background.videoCacheStoredAt) || 0);
  background.blurAmount = clamp(Number(background.blurAmount) || 0, 0, 28);
  background.overlayOpacity = clamp(Number(background.overlayOpacity) || 0.24, 0, 0.85);

  for (const instance of normalized) {
    const hasSavedOverrides = Boolean(instance.commonOverrides && Object.values(instance.commonOverrides).some(Boolean));
    if (!hasSavedOverrides) {
      instance.commonOverrides = inferCommonOverrides(instance, widgetCommonMaster);
    }
    applyWidgetCommonMaster(instance, widgetCommonMaster, false);
  }

  return {
    mode: raw.mode === "edit" ? "edit" : "use",
    selectedWidgetId: raw.selectedWidgetId || "",
    nextId: Number(raw.nextId || 100),
    meta: {
      lastUserMutationAt: Math.max(0, Number(raw?.meta?.lastUserMutationAt) || 0)
    },
    ui: {
      activeTab:
        rawUi.activeTab === "background"
          ? "background"
          : rawUi.activeTab === "profile"
            ? "profile"
            : "global",
      settingsOpen: Boolean(rawUi.settingsOpen),
      theme,
      background,
      home,
      widgetCommonMaster,
      shortcuts,
      defaultProfileSnapshot,
      defaultProfileUpdatedAt
    },
    presets,
    instances: normalized.length ? normalized : base.instances
  };
}

function queueSave() {
  if (!state) {
    return;
  }

  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    saveTimer = null;
    const snapshot = buildPersistSnapshot();
    const userMutationAt = readUserMutationClock(snapshot);
    if (userMutationAt <= lastSavedUserMutationAt) {
      return;
    }
    const fingerprint = snapshotFingerprint(snapshot);
    if (!fingerprint) {
      return;
    }
    if (fingerprint === lastSavedFingerprint || fingerprint === saveInFlightFingerprint) {
      return;
    }

    saveInFlightFingerprint = fingerprint;
    void saveSnapshotIfNotStale(snapshot, fingerprint, userMutationAt)
      .catch(() => {
      })
      .finally(() => {
        if (saveInFlightFingerprint === fingerprint) {
          saveInFlightFingerprint = "";
        }
      });
  }, 150);
}

function buildPersistSnapshot() {
  return structuredClone({
    mode: state.mode,
    selectedWidgetId: state.selectedWidgetId,
    nextId: state.nextId,
    meta: state.meta,
    ui: state.ui,
    presets: state.presets,
    instances: state.instances
  });
}

function buildHistoryBackgroundSnapshot(background) {
  const source = isStateObject(background) ? background : {};
  return {
    mode: source.mode,
    solidColor: source.solidColor,
    wallpaperProvider: source.wallpaperProvider,
    wallpaperTheme: source.wallpaperTheme,
    redditSubreddit: source.redditSubreddit,
    redditTime: source.redditTime,
    rotateMinutes: source.rotateMinutes,
    videoSource: source.videoSource,
    videoUrl: source.videoUrl,
    redditVideoSubreddit: source.redditVideoSubreddit,
    redditVideoTime: source.redditVideoTime,
    blurAmount: source.blurAmount,
    overlayOpacity: source.overlayOpacity
  };
}

function buildHistoryHomeSnapshot(home) {
  const source = isStateObject(home) ? home : {};
  return {
    mode: source.mode,
    gridColumns: source.gridColumns,
    gridRows: source.gridRows,
    marginHorizontal: source.marginHorizontal,
    marginVertical: source.marginVertical,
    itemGap: source.itemGap,
    pageCount: source.pageCount,
    dockEnabled: source.dockEnabled,
    dockShape: source.dockShape,
    dockVisibility: source.dockVisibility,
    dockPosition: source.dockPosition,
    dockLength: source.dockLength,
    widgetBackdropBlur: source.widgetBackdropBlur,
    legacyHeadlessSurfaceMigrated: source.legacyHeadlessSurfaceMigrated
  };
}

function buildHistorySnapshot() {
  return structuredClone({
    nextId: state.nextId,
    ui: {
      theme: state.ui.theme,
      background: buildHistoryBackgroundSnapshot(state.ui.background),
      home: buildHistoryHomeSnapshot(state.ui.home),
      widgetCommonMaster: state.ui.widgetCommonMaster,
      shortcuts: state.ui.shortcuts,
      defaultProfileSnapshot: state.ui.defaultProfileSnapshot,
      defaultProfileUpdatedAt: state.ui.defaultProfileUpdatedAt
    },
    presets: state.presets,
    instances: state.instances
  });
}

function materializeHistorySnapshot(historySnapshotInput) {
  const base = buildPersistSnapshot();
  if (!isStateObject(historySnapshotInput)) {
    return base;
  }

  const historySnapshot = historySnapshotInput;
  const merged = structuredClone(base);
  const nextId = Number(historySnapshot.nextId);
  if (Number.isFinite(nextId)) {
    merged.nextId = Math.max(1, Math.floor(nextId));
  }

  const historyUi = isStateObject(historySnapshot.ui) ? historySnapshot.ui : {};

  if (isStateObject(historyUi.theme)) {
    merged.ui.theme = structuredClone(historyUi.theme);
  }

  if (isStateObject(historyUi.background)) {
    merged.ui.background = {
      ...merged.ui.background,
      ...structuredClone(buildHistoryBackgroundSnapshot(historyUi.background))
    };
  }

  if (isStateObject(historyUi.home)) {
    merged.ui.home = normalizeHomeLayout({
      ...merged.ui.home,
      ...buildHistoryHomeSnapshot(historyUi.home)
    });
    merged.ui.home.activePage = normalizeActivePage(base.ui?.home?.activePage, merged.ui.home.pageCount, 0);
  }

  if (isStateObject(historyUi.widgetCommonMaster)) {
    merged.ui.widgetCommonMaster = structuredClone(historyUi.widgetCommonMaster);
  }

  if (isStateObject(historyUi.shortcuts)) {
    merged.ui.shortcuts = structuredClone(historyUi.shortcuts);
  }

  if (Object.prototype.hasOwnProperty.call(historyUi, "defaultProfileSnapshot")) {
    merged.ui.defaultProfileSnapshot =
      historyUi.defaultProfileSnapshot === null ? null : structuredClone(historyUi.defaultProfileSnapshot);
  }

  if (Object.prototype.hasOwnProperty.call(historyUi, "defaultProfileUpdatedAt")) {
    merged.ui.defaultProfileUpdatedAt = Math.max(0, Number(historyUi.defaultProfileUpdatedAt) || 0);
  }

  if (Array.isArray(historySnapshot.presets)) {
    merged.presets = structuredClone(historySnapshot.presets);
  }

  if (Array.isArray(historySnapshot.instances)) {
    merged.instances = structuredClone(historySnapshot.instances);
  }

  if (
    merged.selectedWidgetId &&
    !merged.instances.some((instance) => String(instance?.id || "") === merged.selectedWidgetId)
  ) {
    merged.selectedWidgetId = "";
  }

  return merged;
}

function snapshotFingerprint(snapshot) {
  try {
    return JSON.stringify(snapshot);
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
}

function isStateObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeStoredSnapshot(value) {
  return isStateObject(value) ? value : null;
}

async function readStoredSnapshot() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeStoredSnapshot(stored?.[STORAGE_KEY]);
  } catch {
    return null;
  }
}

async function saveSnapshotIfNotStale(snapshot, fingerprint, userMutationAt) {
  const storedSnapshot = await readStoredSnapshot();
  const storedMutationAt = readUserMutationClock(storedSnapshot);

  if (storedMutationAt > userMutationAt) {
    lastSavedUserMutationAt = Math.max(lastSavedUserMutationAt, storedMutationAt);
    syncFromExternalSnapshot(storedSnapshot);
    return false;
  }

  await saveState(snapshot);
  lastSavedFingerprint = fingerprint;
  lastSavedUserMutationAt = Math.max(lastSavedUserMutationAt, userMutationAt);
  return true;
}

function syncFromExternalSnapshot(snapshotInput) {
  const snapshot = normalizeStoredSnapshot(snapshotInput);
  if (!snapshot || !state) {
    return false;
  }

  const incomingFingerprint = snapshotFingerprint(snapshot);
  const incomingMutationAt = readUserMutationClock(snapshot);
  const localMutationAt = readUserMutationClock(state);

  lastSavedUserMutationAt = Math.max(lastSavedUserMutationAt, incomingMutationAt);

  if (incomingFingerprint === lastSavedFingerprint || incomingMutationAt <= localMutationAt) {
    return false;
  }

  lastSavedFingerprint = incomingFingerprint;
  saveInFlightFingerprint = "";
  undoState.undoStack.length = 0;
  undoState.redoStack.length = 0;
  restoreFromSnapshot(snapshot, { shouldSave: false });
  return true;
}

function wireStorageSync() {
  if (!chrome?.storage?.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    const changed = changes?.[STORAGE_KEY];
    if (!changed || !Object.prototype.hasOwnProperty.call(changed, "newValue")) {
      return;
    }
    syncFromExternalSnapshot(changed.newValue);
  });
}

function readUserMutationClock(source = state) {
  const raw = Number(source?.meta?.lastUserMutationAt);
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.floor(raw));
}

function touchUserMutationClock() {
  if (!state) {
    return 0;
  }
  if (!state.meta || typeof state.meta !== "object") {
    state.meta = {
      lastUserMutationAt: 0
    };
  }

  const baseline = Math.max(readUserMutationClock(state), lastSavedUserMutationAt);
  const next = Math.max(Date.now(), baseline + 1);
  state.meta.lastUserMutationAt = next;
  return next;
}

function recordHistorySnapshot(label = "Update") {
  if (undoState.isRestoring || !state) {
    return;
  }

  const snapshot = buildHistorySnapshot();
  const fingerprint = snapshotFingerprint(snapshot);
  const last = undoState.undoStack[undoState.undoStack.length - 1];
  if (last?.fingerprint === fingerprint) {
    return;
  }

  touchUserMutationClock();

  undoState.undoStack.push({
    label,
    snapshot,
    fingerprint
  });

  if (undoState.undoStack.length > HISTORY_LIMIT) {
    undoState.undoStack.shift();
  }

  undoState.redoStack.length = 0;
}

function restoreFromSnapshot(snapshot, options = {}) {
  state = hydrate(snapshot);
  if (options.markAsUserMutation) {
    touchUserMutationClock();
  }
  closeDockSettingsModal(false);
  closeWidgetModal(false);
  closeAddWidgetModal();
  applyTheme();
  setBodyMode();
  applyBackground();
  renderBoard();
  renderSettings();
  if (options.shouldSave !== false) {
    queueSave();
  }
}

function undoLastChange() {
  if (!undoState.undoStack.length || !state) {
    return;
  }

  const current = buildHistorySnapshot();
  undoState.redoStack.push({
    label: "Redo",
    snapshot: current,
    fingerprint: snapshotFingerprint(current)
  });
  if (undoState.redoStack.length > HISTORY_LIMIT) {
    undoState.redoStack.shift();
  }

  const target = undoState.undoStack.pop();
  if (!target?.snapshot) {
    return;
  }

  const snapshot = materializeHistorySnapshot(target.snapshot);

  undoState.isRestoring = true;
  try {
    restoreFromSnapshot(snapshot, { markAsUserMutation: true });
  } finally {
    undoState.isRestoring = false;
  }
}

function redoLastChange() {
  if (!undoState.redoStack.length || !state) {
    return;
  }

  const current = buildHistorySnapshot();
  undoState.undoStack.push({
    label: "Undo",
    snapshot: current,
    fingerprint: snapshotFingerprint(current)
  });
  if (undoState.undoStack.length > HISTORY_LIMIT) {
    undoState.undoStack.shift();
  }

  const target = undoState.redoStack.pop();
  if (!target?.snapshot) {
    return;
  }

  const snapshot = materializeHistorySnapshot(target.snapshot);

  undoState.isRestoring = true;
  try {
    restoreFromSnapshot(snapshot, { markAsUserMutation: true });
  } finally {
    undoState.isRestoring = false;
  }
}

function setBodyMode() {
  const isEdit = state.mode === "edit";
  document.body.classList.toggle("mode-edit", isEdit);
  document.body.classList.toggle("layout-grid", state.ui.home.mode === "grid");
  document.body.classList.toggle("layout-free", state.ui.home.mode === "free");

  const label = elements.modeToggleBtn.querySelector(".btn-label");
  if (label) {
    label.textContent = isEdit ? "Use Mode" : "Edit Mode";
  }
  const modeTitle = isEdit ? "Switch to Use Mode" : "Switch to Edit Mode";
  elements.modeToggleBtn.title = modeTitle;
  elements.modeToggleBtn.setAttribute("aria-label", modeTitle);

  if (!isEdit) {
    closeWidgetModal(false);
    closeAddWidgetModal();
    if (state?.ui) {
      state.ui.settingsOpen = false;
    }
  }

  syncSettingsPanelVisibility();
  syncPageIndicator();
  syncPersistentDock();
}

function clampEditDockPosition(left, top) {
  const dock = elements.editDock;
  if (!dock) {
    return { left: 0, top: 0 };
  }

  const rect = dock.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

  return {
    left: clamp(Math.round(left), margin, maxLeft),
    top: clamp(Math.round(top), margin, maxTop)
  };
}

function applyEditDockPosition(left, top) {
  const dock = elements.editDock;
  if (!dock) {
    return;
  }
  const next = clampEditDockPosition(left, top);
  dock.style.left = `${next.left}px`;
  dock.style.top = `${next.top}px`;
  dock.style.transform = "none";
  dock.classList.add("is-positioned");
}

function syncSettingsPanelVisibility() {
  const open = Boolean(state?.mode === "edit" && state?.ui?.settingsOpen);
  document.body.classList.toggle("settings-open", open);
  elements.settingsRailToggleBtn?.setAttribute("aria-expanded", String(open));
  elements.settingsPanel?.setAttribute("aria-hidden", String(!open));
  if (elements.settingsRailToggleBtn) {
    elements.settingsRailToggleBtn.title = open ? "Close settings" : "Open settings";
  }
  syncPersistentDock();
}

function syncSettingsTabButtons() {
  const active =
    state.ui.activeTab === "background" ? "background" : state.ui.activeTab === "profile" ? "profile" : "global";
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
  if (elements.tabProfileBtn) {
    const on = active === "profile";
    elements.tabProfileBtn.classList.toggle("active", on);
    elements.tabProfileBtn.setAttribute("aria-selected", String(on));
  }
}

function setModalInteractionLock(locked) {
  document.body.classList.toggle("modal-open", locked);

  if (!elements.appRoot) {
    return;
  }

  if (locked) {
    elements.appRoot.setAttribute("inert", "");
  } else {
    elements.appRoot.removeAttribute("inert");
  }
}

function isInsideModalOverlay(target) {
  return target instanceof Element && Boolean(target.closest("#widgetModalOverlay"));
}

function isInsideAddWidgetModalOverlay(target) {
  return target instanceof Element && Boolean(target.closest("#addWidgetModalOverlay"));
}

function isInsideShortcutIconEditorOverlay(target) {
  return target instanceof Element && Boolean(target.closest("#shortcutIconEditorOverlay"));
}

function isInsideDockSettingsModalOverlay(target) {
  return target instanceof Element && Boolean(target.closest("#dockSettingsModalOverlay"));
}

function dockSettingsFields() {
  return [
    {
      key: "dockShape",
      label: "Dock shape",
      type: "select",
      options: [
        { value: "raised", label: "Raised tray" },
        { value: "flat", label: "Flat wrap" }
      ]
    },
    {
      key: "dockVisibility",
      label: "Dock visibility",
      type: "select",
      options: [
        { value: "always", label: "Always visible" },
        { value: "hover", label: "Reveal on hover" }
      ]
    },
    {
      key: "dockLength",
      label: "Dock length (units)",
      type: "number",
      min: 5,
      max: 14,
      step: 1
    }
  ];
}

function renderDockSettingsModal() {
  if (!dockSettingsModalOpen || !dockModalState.draft || !elements.dockSettingsModalBody) {
    return;
  }

  elements.dockSettingsModalBody.replaceChildren();
  for (const schema of dockSettingsFields()) {
    const row = createFormRow(schema.label);
    const input = createInputBySchema(schema, dockModalState.draft[schema.key]);
    input.addEventListener(settingsEventName(schema), () => {
      dockModalState.draft[schema.key] = readFieldValue(input, schema);
    });
    row.append(input);
    elements.dockSettingsModalBody.append(row);
  }
}

function openDockSettingsModal() {
  if (!elements.dockSettingsModalOverlay || !state?.ui?.home) {
    return;
  }

  if (modalState.open) {
    closeWidgetModal(false);
  }
  if (addWidgetModalOpen) {
    closeAddWidgetModal();
  }
  if (shortcutIconEditorState.open) {
    closeShortcutIconEditor();
  }

  const home = normalizeHomeLayout(state.ui.home);
  dockModalState.draft = {
    dockShape: normalizeDockShape(home.dockShape, "raised"),
    dockVisibility: normalizeDockVisibility(home.dockVisibility, "always"),
    dockLength: normalizeDockLength(home.dockLength, 6)
  };

  dockSettingsModalOpen = true;
  renderDockSettingsModal();
  elements.dockSettingsModalOverlay.classList.add("open");
  elements.dockSettingsModalOverlay.setAttribute("aria-hidden", "false");
  setModalInteractionLock(true);
  syncPersistentDock();

  requestAnimationFrame(() => {
    const firstInput = elements.dockSettingsModalBody?.querySelector("input, select, button");
    if (firstInput instanceof HTMLElement) {
      firstInput.focus();
    }
  });
}

function closeDockSettingsModal(rerender = false) {
  if (!dockSettingsModalOpen) {
    return;
  }

  dockSettingsModalOpen = false;
  dockModalState.draft = null;
  elements.dockSettingsModalOverlay?.classList.remove("open");
  elements.dockSettingsModalOverlay?.setAttribute("aria-hidden", "true");
  elements.dockSettingsModalBody?.replaceChildren();

  if (!modalState.open && !addWidgetModalOpen && !shortcutIconEditorState.open) {
    setModalInteractionLock(false);
  }

  if (rerender) {
    renderSettings();
  }
  syncPersistentDock();
}

function resetDockSettingsDraftToDefault() {
  if (!dockSettingsModalOpen) {
    return;
  }
  const defaults = defaultHomeLayout();
  dockModalState.draft = {
    dockShape: defaults.dockShape,
    dockVisibility: defaults.dockVisibility,
    dockLength: defaults.dockLength
  };
  renderDockSettingsModal();
}

function applyDockSettingsModal() {
  if (!dockSettingsModalOpen || !dockModalState.draft) {
    return;
  }

  const patch = {
    dockShape: normalizeDockShape(dockModalState.draft.dockShape, "raised"),
    dockVisibility: normalizeDockVisibility(dockModalState.draft.dockVisibility, "always"),
    dockPosition: "bottom",
    dockLength: normalizeDockLength(dockModalState.draft.dockLength, 6)
  };

  closeDockSettingsModal(false);
  patchHomeLayout(patch);
}

function shortcutEditorContext() {
  const canvas = elements.shortcutIconEditorCanvas;
  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  return { canvas, ctx };
}

function normalizeShortcutIconShape(value) {
  const raw = normalizeText(value);
  if (raw === "round" || raw === "flatSquared" || raw === "roundSquared") {
    return raw;
  }
  return "roundSquared";
}

function normalizeShortcutIconCache(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = normalizeText(key);
    const normalizedValue = normalizeText(value);
    if (!normalizedKey || !normalizedValue.startsWith("data:image/")) {
      continue;
    }
    out[normalizedKey] = normalizedValue;
  }
  return out;
}

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shortcutEditorThemeColors() {
  const fallback = defaultTheme();
  return {
    surface: normalizeDisplayColor(state?.ui?.theme?.surface, fallback.surface),
    line: normalizeDisplayColor(state?.ui?.theme?.line, fallback.line),
    text: normalizeDisplayColor(state?.ui?.theme?.text, fallback.text),
    accent: normalizeDisplayColor(state?.ui?.theme?.accent, fallback.accent)
  };
}

function shortcutEditorShapeSvg(shape, inset, fill, stroke, strokeWidth = 6) {
  if (shape === "round") {
    const radius = Math.max(1, 64 - inset);
    return `<circle cx="64" cy="64" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  const size = Math.max(1, 128 - inset * 2);
  const radius = shape === "roundSquared" ? 24 : 0;
  return `<rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
}

function shortcutEditorClipShapeSvg(shape, inset) {
  if (shape === "round") {
    const radius = Math.max(1, 64 - inset);
    return `<circle cx="64" cy="64" r="${radius}" />`;
  }

  const size = Math.max(1, 128 - inset * 2);
  const radius = shape === "roundSquared" ? 20 : 0;
  return `<rect x="${inset}" y="${inset}" width="${size}" height="${size}" rx="${radius}" />`;
}

function shortcutEditorSelectedPreset() {
  const target = normalizeText(shortcutIconEditorState.selectedPreset, SHORTCUT_ICON_PRESETS[0].id);
  return SHORTCUT_ICON_PRESETS.find((item) => item.id === target) || SHORTCUT_ICON_PRESETS[0];
}

function renderShortcutEditorPreviewDataUrl(dataUrl) {
  const context = shortcutEditorContext();
  if (!context) {
    return;
  }

  const { canvas, ctx } = context;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dataUrl) {
    return;
  }

  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  };
  image.src = dataUrl;
}

function shortcutEditorBuildDataUrl() {
  const shape = normalizeShortcutIconShape(shortcutIconEditorState.shape);
  const scale = clamp(Number(shortcutIconEditorState.scale) || 100, 60, 160);
  const textValue = normalizeText(shortcutIconEditorState.text).slice(0, 4);
  const textSize = clamp(Number(shortcutIconEditorState.textSize) || 58, 24, 92);
  const colors = shortcutEditorThemeColors();

  const containerSize = clamp(Math.round(86 * (scale / 100)), 44, 112);
  const contentX = Math.round((128 - containerSize) / 2);
  const contentY = Math.round((128 - containerSize) / 2);

  let contentSvg = "";
  if (shortcutIconEditorState.source === "text" && textValue) {
    const fontSize = clamp(Math.round(textSize * (scale / 100)), 18, 100);
    const fontFamily = escapeXml(state?.ui?.theme?.fontFamily || defaultTheme().fontFamily);
    contentSvg = `<text x="64" y="64" text-anchor="middle" dominant-baseline="middle" font-family="${fontFamily}" font-size="${fontSize}" font-weight="700" fill="${colors.text}">${escapeXml(textValue)}</text>`;
  } else if (shortcutIconEditorState.source === "cache" || shortcutIconEditorState.source === "image") {
    const sourceData = shortcutIconEditorState.source === "cache"
      ? normalizeText(shortcutIconEditorState.cacheEntries.find((entry) => entry.key === shortcutIconEditorState.selectedCache)?.data)
      : normalizeText(shortcutIconEditorState.importedDataUrl);
    if (sourceData) {
      const clipShape = shortcutEditorClipShapeSvg(shape, 14);
      contentSvg =
        `<defs><clipPath id="shortcutClipShape">${clipShape}</clipPath></defs>` +
        `<image href="${escapeXml(sourceData)}" x="${contentX}" y="${contentY}" width="${containerSize}" height="${containerSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shortcutClipShape)" />`;
    }
  } else {
    const preset = shortcutEditorSelectedPreset();
    contentSvg =
      `<svg x="${contentX}" y="${contentY}" width="${containerSize}" height="${containerSize}" viewBox="${preset.viewBox}" fill="none" stroke="${colors.text}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
      `${preset.markup}</svg>`;
  }

  if (!contentSvg) {
    return "";
  }

  const shell = shortcutEditorShapeSvg(shape, 6, colors.surface, colors.line, 6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${shell}${contentSvg}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function shortcutEditorRefreshPreview() {
  shortcutIconEditorState.shape = normalizeShortcutIconShape(elements.shortcutIconEditorShape?.value);
  shortcutIconEditorState.scale = clamp(Number(elements.shortcutIconEditorScale?.value) || 100, 60, 160);
  shortcutIconEditorState.text = normalizeText(elements.shortcutIconEditorText?.value).slice(0, 4);
  shortcutIconEditorState.textSize = clamp(Number(elements.shortcutIconEditorFontSize?.value) || 58, 24, 92);

  if (shortcutIconEditorState.source === "text" && shortcutIconEditorState.text.length === 0) {
    shortcutIconEditorState.source = "preset";
  }

  const nextDataUrl = shortcutEditorBuildDataUrl();
  shortcutIconEditorState.previewDataUrl = nextDataUrl;
  renderShortcutEditorPreviewDataUrl(nextDataUrl);
  renderShortcutIconEditorPresetGrid();
  renderShortcutIconEditorCachedGrid();
}

function renderShortcutIconEditorPresetGrid() {
  const host = elements.shortcutIconEditorPresetGrid;
  if (!host) {
    return;
  }
  host.replaceChildren();

  for (const preset of SHORTCUT_ICON_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shortcut-icon-editor-pick";
    button.classList.toggle("active", shortcutIconEditorState.source === "preset" && shortcutIconEditorState.selectedPreset === preset.id);
    button.title = preset.label;
    button.innerHTML = `<svg class="icon" viewBox="${preset.viewBox}">${preset.markup}</svg>`;
    button.addEventListener("click", () => {
      shortcutIconEditorState.source = "preset";
      shortcutIconEditorState.selectedPreset = preset.id;
      shortcutEditorRefreshPreview();
    });
    host.append(button);
  }
}

function renderShortcutIconEditorCachedGrid() {
  const host = elements.shortcutIconEditorCachedGrid;
  if (!host) {
    return;
  }
  host.replaceChildren();

  if (!shortcutIconEditorState.cacheEntries.length) {
    const muted = document.createElement("span");
    muted.className = "muted";
    muted.textContent = "No cached icons yet";
    host.append(muted);
    return;
  }

  for (const entry of shortcutIconEditorState.cacheEntries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shortcut-icon-editor-pick";
    button.classList.toggle("active", shortcutIconEditorState.source === "cache" && shortcutIconEditorState.selectedCache === entry.key);
    button.title = entry.key;
    const img = document.createElement("img");
    img.src = entry.data;
    img.alt = "";
    button.append(img);
    button.addEventListener("click", () => {
      shortcutIconEditorState.source = "cache";
      shortcutIconEditorState.selectedCache = entry.key;
      shortcutEditorRefreshPreview();
    });
    host.append(button);
  }
}

async function loadShortcutIconEditorCacheEntries() {
  try {
    const raw = await chrome.storage.local.get(SHORTCUT_ICON_CACHE_KEY);
    const normalized = normalizeShortcutIconCache(raw?.[SHORTCUT_ICON_CACHE_KEY]);
    shortcutIconEditorState.cacheEntries = Object.entries(normalized)
      .slice(-48)
      .reverse()
      .map(([key, data]) => ({ key, data }));
  } catch {
    shortcutIconEditorState.cacheEntries = [];
  }
  renderShortcutIconEditorCachedGrid();
}

function clearShortcutIconEditorCanvas() {
  const context = shortcutEditorContext();
  if (!context) {
    return;
  }
  context.ctx.clearRect(0, 0, context.canvas.width, context.canvas.height);
}

function resetShortcutIconEditorSource() {
  shortcutIconEditorState.source = "none";
  shortcutIconEditorState.selectedCache = "";
  shortcutIconEditorState.importedDataUrl = "";
  shortcutIconEditorState.text = "";
  if (elements.shortcutIconEditorText) {
    elements.shortcutIconEditorText.value = "";
  }
  shortcutEditorRefreshPreview();
}

function closeShortcutIconEditor() {
  shortcutIconEditorState.open = false;
  shortcutIconEditorState.source = "none";
  shortcutIconEditorState.onApply = null;
  shortcutIconEditorState.previewDataUrl = "";
  shortcutIconEditorState.importedDataUrl = "";
  clearShortcutIconEditorCanvas();
  elements.shortcutIconEditorOverlay?.classList.remove("open");
  elements.shortcutIconEditorOverlay?.setAttribute("aria-hidden", "true");
}

function openShortcutIconEditor(iconValue, onApply) {
  const initial = normalizeText(iconValue);
  shortcutIconEditorState.open = true;
  shortcutIconEditorState.onApply = typeof onApply === "function" ? onApply : null;
  shortcutIconEditorState.shape = "roundSquared";
  shortcutIconEditorState.scale = 100;
  shortcutIconEditorState.textSize = 58;
  shortcutIconEditorState.selectedPreset = SHORTCUT_ICON_PRESETS[0].id;
  shortcutIconEditorState.selectedCache = "";
  shortcutIconEditorState.importedDataUrl = "";

  if (elements.shortcutIconEditorShape) {
    elements.shortcutIconEditorShape.value = "roundSquared";
  }
  if (elements.shortcutIconEditorScale) {
    elements.shortcutIconEditorScale.value = "100";
  }
  if (elements.shortcutIconEditorFontSize) {
    elements.shortcutIconEditorFontSize.value = "58";
  }
  if (elements.shortcutIconEditorText) {
    elements.shortcutIconEditorText.value = "";
  }

  if (initial.startsWith("data:image/")) {
    shortcutIconEditorState.source = "image";
    shortcutIconEditorState.importedDataUrl = initial;
  } else if (initial && !initial.startsWith("http://") && !initial.startsWith("https://") && !initial.startsWith("chrome-extension://")) {
    shortcutIconEditorState.source = "text";
    shortcutIconEditorState.text = initial.slice(0, 4);
    if (elements.shortcutIconEditorText) {
      elements.shortcutIconEditorText.value = shortcutIconEditorState.text;
    }
  } else {
    shortcutIconEditorState.source = "preset";
  }

  elements.shortcutIconEditorOverlay?.classList.add("open");
  elements.shortcutIconEditorOverlay?.setAttribute("aria-hidden", "false");
  void loadShortcutIconEditorCacheEntries();
  renderShortcutIconEditorPresetGrid();
  renderShortcutIconEditorCachedGrid();
  shortcutEditorRefreshPreview();
}

function applyShortcutIconEditor() {
  const dataUrl = shortcutEditorBuildDataUrl();
  shortcutIconEditorState.onApply?.(dataUrl || "");
  closeShortcutIconEditor();
}

function loadImageIntoShortcutEditor(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const raw = String(reader.result || "");
    if (!raw.startsWith("data:image/")) {
      return;
    }
    shortcutIconEditorState.source = "image";
    shortcutIconEditorState.importedDataUrl = raw;
    shortcutEditorRefreshPreview();
  };
  reader.readAsDataURL(file);
}

function blockOutsideModalEvent(event) {
  if (!modalState.open && !addWidgetModalOpen && !shortcutIconEditorState.open && !dockSettingsModalOpen) {
    return;
  }
  if (dockSettingsModalOpen && isInsideDockSettingsModalOverlay(event.target)) {
    return;
  }
  if (shortcutIconEditorState.open && isInsideShortcutIconEditorOverlay(event.target)) {
    return;
  }
  if (modalState.open && isInsideModalOverlay(event.target)) {
    return;
  }
  if (addWidgetModalOpen && isInsideAddWidgetModalOverlay(event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function applyCardVisual(card, instance) {
  card.classList.toggle("headless", instance.viewMode === "headless");
  const surfaceMode = normalizeSurfaceMode(instance.surfaceMode, "normal");
  const edgeRoundness = normalizeEdgeRoundness(instance.edgeRoundness, 12);
  const opacity = surfaceMode === "transparent" ? 0 : normalizeTransparency(instance.transparency, 0.94);
  const globalBlurEnabled = state?.ui?.home?.widgetBackdropBlur !== false;
  const widgetBlurEnabled = instance.backdropBlur !== false;
  const cardBlurActive = globalBlurEnabled && widgetBlurEnabled;
  card.style.setProperty("--widget-backdrop-blur", cardBlurActive ? "12px" : "0px");
  card.style.setProperty("--widget-label-backdrop-blur", cardBlurActive ? "0px" : "11px");
  card.style.setProperty("--widget-edge-roundness", `${edgeRoundness}px`);
  card.classList.toggle("surface-transparent", surfaceMode === "transparent");
  card.style.setProperty("--widget-opacity", String(opacity));
  const align = instance.type === "aiChat" ? "top" : normalizeAlign(instance.contentAlignY, defaultWidgetContentAlign(instance.type));
  card.dataset.contentAlignY = align;
  card.dataset.contentFill = instance.contentFillParent ? "true" : "false";
  const padding = resolveWidgetPadding(instance);
  card.style.setProperty(
    "--widget-content-padding",
    `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
  );
  card.style.setProperty("--widget-pad-top", `${padding.top}px`);
  card.style.setProperty("--widget-pad-right", `${padding.right}px`);
  card.style.setProperty("--widget-pad-bottom", `${padding.bottom}px`);
  card.style.setProperty("--widget-pad-left", `${padding.left}px`);
  card.style.setProperty("--widget-head-offset", instance.viewMode === "headless" ? "0px" : "40px");
  instance.contentPaddingTop = padding.top;
  instance.contentPaddingRight = padding.right;
  instance.contentPaddingBottom = padding.bottom;
  instance.contentPaddingLeft = padding.left;
  instance.contentPaddingTopRight = normalizeContentPadding((padding.top + padding.right) / 2, padding.uniform);
  instance.contentPaddingBottomLeft = normalizeContentPadding((padding.bottom + padding.left) / 2, padding.uniform);
  instance.contentPadding = normalizeContentPadding((padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform);
  instance.contentFontScale = normalizeWidgetContentFontScale(instance.contentFontScale, 1);
  card.style.setProperty("--widget-content-font-scale", String(instance.contentFontScale));
  instance.edgeRoundness = edgeRoundness;
  const justify = align === "center" ? "center" : align === "bottom" ? "flex-end" : "flex-start";
  card.style.setProperty("--widget-content-justify", justify);

  const themeMode = normalizeWidgetThemeMode(instance.widgetThemeMode, "inherit");
  card.dataset.widgetThemeMode = themeMode;

  const useCustom = Boolean(instance.useCustomColors);
  card.dataset.useCustomColors = useCustom ? "true" : "false";
  if (useCustom) {
    card.style.setProperty("--widget-custom-text", normalizeWidgetColor(instance.customTextColor, "#1F2226"));
    card.style.setProperty("--widget-custom-accent", normalizeWidgetColor(instance.customAccentColor, "#1F4F9F"));
    card.style.setProperty("--widget-custom-surface", normalizeWidgetColor(instance.customSurfaceColor, "#FFFAF2"));
  } else {
    card.style.removeProperty("--widget-custom-text");
    card.style.removeProperty("--widget-custom-accent");
    card.style.removeProperty("--widget-custom-surface");
  }

  if (surfaceMode === "transparent") {
    const ui = state?.ui || null;
    const textColor = resolveTransparentWidgetText(instance, ui);
    card.style.setProperty("--widget-transparent-text", textColor);
    card.style.setProperty(
      "--widget-transparent-ghost-opacity",
      String(resolveTransparentGhostOpacity(ui, instance.transparentGhostStrength))
    );
  } else {
    card.style.removeProperty("--widget-transparent-text");
    card.style.removeProperty("--widget-transparent-ghost-opacity");
  }
}

function applyCardStack(card, instance) {
  card.style.zIndex = String(Math.max(1, Number(instance.zIndex) || 1));
}

function syncZCounterFromState() {
  zCounter = state.instances.reduce((max, instance) => {
    return Math.max(max, Math.max(1, Number(instance.zIndex) || 1));
  }, 1);
}

function bringWidgetToFront(instanceId) {
  const instance = instanceById(instanceId);
  if (!instance) {
    return;
  }

  const current = Math.max(1, Number(instance.zIndex) || 1);
  if (current >= zCounter) {
    zCounter = current;
    return;
  }

  instance.zIndex = zCounter + 1;
  zCounter = instance.zIndex;

  const rt = runtime.get(instanceId);
  if (rt?.card) {
    applyCardStack(rt.card, instance);
  }
}

function applyTheme() {
  const root = document.documentElement;
  const theme = state.ui.theme;
  const home = state.ui.home;

  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--surface", theme.surface);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--font-family", theme.fontFamily || defaultTheme().fontFamily);
  root.style.setProperty("--font-scale", "1");
  root.style.setProperty("--content-font-scale", String(clamp(Number(theme.fontScale) || 1, 0.5, 2)));
  root.style.setProperty("--widget-backdrop-blur", home?.widgetBackdropBlur === false ? "0px" : "12px");
}

function clearWallpaperTimer() {
  if (wallpaperTimer) {
    clearTimeout(wallpaperTimer);
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
  releaseVideoObjectUrl();
}

function clearBlurLayer() {
  blurComputeToken += 1;
  elements.bgBlurImage.classList.remove("visible");
  elements.bgBlurImage.style.filter = "none";
  if (elements.bgBlurImage.getAttribute("src")) {
    elements.bgBlurImage.removeAttribute("src");
  }
  document.documentElement.style.setProperty("--bg-sharp-opacity", "1");
  document.documentElement.style.setProperty("--bg-blur-opacity", "0");
}

function loadImageForBlur(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function sampleImageBaseLuminanceFromUrl(url) {
  const response = await fetch(url, {
    cache: "force-cache"
  });
  if (!response.ok) {
    throw new Error(`backdrop-luminance:${response.status}`);
  }

  const blob = await response.blob();
  if (!blob || !String(blob.type || "").startsWith("image/")) {
    throw new Error("backdrop-luminance:invalid-image");
  }

  const sampleSize = 24;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("backdrop-luminance:no-canvas");
  }

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    try {
      ctx.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
    } finally {
      if (typeof bitmap.close === "function") {
        bitmap.close();
      }
    }
  } else {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await loadImageForBlur(objectUrl);
      ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const pixels = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
  let luminanceSum = 0;
  let alphaWeight = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha <= 0.01) {
      continue;
    }
    const lum = 0.2126 * srgbToLinear(pixels[i]) + 0.7152 * srgbToLinear(pixels[i + 1]) + 0.0722 * srgbToLinear(pixels[i + 2]);
    luminanceSum += lum * alpha;
    alphaWeight += alpha;
  }

  if (alphaWeight <= 0) {
    throw new Error("backdrop-luminance:no-pixels");
  }

  return clamp(luminanceSum / alphaWeight, 0, 1);
}

function requestWallpaperLuminanceSample(url) {
  const source = normalizeText(url);
  if (!source || sampledWallpaperSource === source) {
    return;
  }

  const token = ++wallpaperSampleToken;
  void (async () => {
    try {
      const baseLum = await sampleImageBaseLuminanceFromUrl(source);
      if (token !== wallpaperSampleToken || state?.ui?.background?.mode !== "wallpaper") {
        return;
      }
      sampledWallpaperBaseLuminance = baseLum;
      sampledWallpaperSource = source;
    } catch {
      if (token !== wallpaperSampleToken) {
        return;
      }
      sampledWallpaperBaseLuminance = null;
      sampledWallpaperSource = source;
    }
    refreshAllWidgetCardsVisual();
    refreshWidgetsByType("label");
  })();
}

async function buildPrecomputedBlurData(url, amount) {
  const source = await loadImageForBlur(url);
  const targetMax = 820;
  const scale = Math.min(1, targetMax / Math.max(source.width, source.height));
  const width = Math.max(24, Math.round(source.width * scale));
  const height = Math.max(24, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas-context");
  }

  ctx.filter = `blur(${Math.max(1, Math.round(amount))}px)`;
  ctx.drawImage(source, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.82);
}

async function updateBlurFromImage(url) {
  const blur = clamp(Number(state.ui.background.blurAmount) || 0, 0, 28);
  if (blur <= 0 || !url) {
    clearBlurLayer();
    return;
  }

  const token = ++blurComputeToken;
  document.documentElement.style.setProperty("--bg-sharp-opacity", "0.38");
  document.documentElement.style.setProperty("--bg-blur-opacity", "0.95");

  try {
    const dataUrl = await buildPrecomputedBlurData(url, blur);
    if (token !== blurComputeToken) {
      return;
    }
    elements.bgBlurImage.src = dataUrl;
    elements.bgBlurImage.style.filter = "none";
    elements.bgBlurImage.classList.add("visible");
  } catch {
    if (token !== blurComputeToken) {
      return;
    }
    elements.bgBlurImage.src = url;
    elements.bgBlurImage.style.filter = `blur(${Math.max(1, blur)}px)`;
    elements.bgBlurImage.classList.add("visible");
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

function normalizeVideoSource(value, fallback = "manual") {
  const normalized = normalizeText(value, fallback);
  return normalized === "reddit" ? "reddit" : "manual";
}

function videoConfigSignature(cfg) {
  const source = normalizeVideoSource(cfg?.videoSource, "manual");
  const manualUrl = source === "manual" ? normalizeText(cfg?.videoUrl) : "";
  const redditSubreddit = source === "reddit" ? normalizeText(cfg?.redditVideoSubreddit, "loopingvideos") : "";
  const redditTime = source === "reddit" ? normalizeText(cfg?.redditVideoTime, "week") : "";
  return [source, manualUrl, redditSubreddit, redditTime].join("|");
}

function buildVideoCacheKey(signature) {
  const normalized = normalizeText(signature);
  if (!normalized) {
    return "";
  }
  return `${VIDEO_CACHE_KEY_PREFIX}${encodeURIComponent(normalized)}`;
}

function normalizeWallpaperProvider(value, fallback = "picsum") {
  const provider = normalizeText(value, fallback);
  if (provider === "picsum" || provider === "unsplash" || provider === "reddit") {
    return provider;
  }
  if (provider === "wallhaven") {
    return "picsum";
  }
  return "picsum";
}

function wallpaperSignature(cfg) {
  return [
    cfg.wallpaperProvider,
    cfg.wallpaperTheme,
    cfg.redditSubreddit,
    cfg.redditTime
  ].join("|");
}

function wallpaperRotateMs(cfg) {
  return clamp(Number(cfg.rotateMinutes) || 15, 1, 240) * 60000;
}

function hasWallpaperCacheRecord(cfg, signature) {
  return (
    normalizeText(cfg.wallpaperCachedUrl) !== "" &&
    normalizeText(cfg.wallpaperCachedSignature) === signature &&
    Number(cfg.wallpaperCachedAt) > 0
  );
}

function isWallpaperCacheFresh(cfg, signature) {
  if (!hasWallpaperCacheRecord(cfg, signature)) {
    return false;
  }
  const age = Math.max(0, Date.now() - Number(cfg.wallpaperCachedAt || 0));
  return age < wallpaperRotateMs(cfg);
}

function applyWallpaperSwap(url, token) {
  if (!url) {
    return false;
  }
  if (token !== wallpaperLoadToken) {
    return false;
  }
  elements.bgImage.src = url;
  elements.bgImage.classList.add("visible");
  void updateBlurFromImage(url);
  requestWallpaperLuminanceSample(url);
  return true;
}

async function preloadAndSwapWallpaper(url, token) {
  await preloadImage(url);
  return applyWallpaperSwap(url, token);
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

  if (provider === "reddit") {
    return fetchRedditWallpaperUrl(cfg);
  }

  return buildSimpleWallpaperUrl(provider, cfg.wallpaperTheme);
}

function parseRedditLoopVideoUrl(post) {
  if (!post || typeof post !== "object") {
    return "";
  }

  const candidates = [];
  const redditVideo = post?.secure_media?.reddit_video || post?.media?.reddit_video;
  if (redditVideo?.fallback_url) {
    candidates.push(redditVideo.fallback_url);
  }

  const previewVideo = post?.preview?.videos?.[0];
  if (previewVideo) {
    const variants = Array.isArray(previewVideo?.variants) ? previewVideo.variants : [];
    for (const variant of variants) {
      if (variant?.url) {
        candidates.push(variant.url);
      }
    }
  }

  if (typeof post.url_overridden_by_dest === "string") {
    candidates.push(post.url_overridden_by_dest);
  }
  if (typeof post.url === "string") {
    candidates.push(post.url);
  }

  for (const raw of candidates) {
    if (!raw) {
      continue;
    }
    const decoded = String(raw).replaceAll("&amp;", "&");
    if (!decoded.startsWith("http")) {
      continue;
    }
    if (/\.mp4(\?.*)?$/i.test(decoded) || decoded.includes("v.redd.it")) {
      return decoded;
    }
  }

  return "";
}

async function fetchRedditLoopVideoUrl(cfg) {
  const subreddit = normalizeText(cfg.redditVideoSubreddit, "loopingvideos").replace(/^r\//i, "");
  const allowedTimes = new Set(["hour", "day", "week", "month", "year", "all"]);
  const timeRange = allowedTimes.has(cfg.redditVideoTime) ? cfg.redditVideoTime : "week";
  const endpoint = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${timeRange}&limit=80`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`reddit-video:${response.status}`);
  }

  const data = await response.json();
  const candidates = (data?.data?.children || [])
    .map((entry) => parseRedditLoopVideoUrl(entry?.data || {}))
    .filter(Boolean);
  const pick = pickRandom(candidates);
  if (!pick) {
    throw new Error("reddit:video-not-found");
  }
  return pick;
}

function releaseVideoObjectUrl() {
  if (!currentVideoObjectUrl) {
    return;
  }

  try {
    URL.revokeObjectURL(currentVideoObjectUrl);
  } catch {
  }
  currentVideoObjectUrl = "";
}

async function resolveVideoRemoteUrl(cfg) {
  const source = normalizeVideoSource(cfg?.videoSource, "manual");
  if (source === "reddit") {
    return fetchRedditLoopVideoUrl(cfg);
  }
  const manualUrl = normalizeText(cfg?.videoUrl);
  if (!manualUrl) {
    throw new Error("video:missing-url");
  }
  return manualUrl;
}

async function fetchLoopVideoResponse(url) {
  const response = await fetch(url, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`loop-video:${response.status}`);
  }
  return response;
}

async function ensureCachedLoopVideoResponse(cfg, signature, { force = false } = {}) {
  const remoteUrl = await resolveVideoRemoteUrl(cfg);
  const cacheKey = buildVideoCacheKey(signature);
  if (!cacheKey || typeof caches === "undefined") {
    return fetchLoopVideoResponse(remoteUrl);
  }

  const cache = await caches.open(VIDEO_CACHE_NAME);
  if (force) {
    await cache.delete(cacheKey);
  }

  if (!force) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached.clone();
    }
  }

  const response = await fetchLoopVideoResponse(remoteUrl);
  const clone = response.clone();
  await cache.put(cacheKey, clone);
  return response;
}

async function loadVideoLoop({ force = false } = {}) {
  const cfg = state.ui.background;
  if (cfg.mode !== "video") {
    return;
  }

  const signature = videoConfigSignature(cfg);
  const token = ++videoLoadToken;
  hideVideo();
  releaseVideoObjectUrl();

  try {
    const response = await ensureCachedLoopVideoResponse(cfg, signature, { force });
    if (token !== videoLoadToken) {
      return;
    }
    const blob = await response.blob();
    if (token !== videoLoadToken) {
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    if (token !== videoLoadToken) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
    releaseVideoObjectUrl();
    currentVideoObjectUrl = objectUrl;
    elements.bgVideo.src = objectUrl;
    elements.bgVideo.load();
    void elements.bgVideo.play().catch(() => {});
    elements.bgVideo.classList.add("visible");
    elements.bgVideo.style.filter = "none";
    state.ui.background.videoCacheSignature = signature;
    state.ui.background.videoCacheStoredAt = Date.now();
    queueSave();
  } catch (error) {
    if (token !== videoLoadToken) {
      return;
    }
    console.warn("Loop video load failed", error);
  }
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = reject;
    img.src = url;
  });
}

async function refreshWallpaper({ signature = null, force = false } = {}) {
  const cfg = state.ui.background;
  const activeSignature = signature || wallpaperSignature(cfg);
  const token = ++wallpaperLoadToken;
  const currentSrc = normalizeText(elements.bgImage.getAttribute("src"));
  let hasVisibleSource = Boolean(currentSrc && elements.bgImage.classList.contains("visible"));
  let cachedShown = false;

  if (hasWallpaperCacheRecord(cfg, activeSignature)) {
    const cachedUrl = normalizeText(cfg.wallpaperCachedUrl);
    if (cachedUrl) {
      if (currentSrc === cachedUrl && elements.bgImage.classList.contains("visible")) {
        hasVisibleSource = true;
        cachedShown = true;
        void updateBlurFromImage(cachedUrl);
        requestWallpaperLuminanceSample(cachedUrl);
      } else {
        try {
          const swapped = await preloadAndSwapWallpaper(cachedUrl, token);
          if (swapped) {
            hasVisibleSource = true;
            cachedShown = true;
          }
        } catch {
        }
      }
    }
  }

  const cacheFresh = isWallpaperCacheFresh(cfg, activeSignature);
  if (!force && cacheFresh && (cachedShown || hasVisibleSource)) {
    wallpaperSourceSignature = activeSignature;
    return;
  }

  let nextUrl = "";
  try {
    nextUrl = await resolveWallpaperUrl(cfg);
    await preloadImage(nextUrl);
  } catch {
    nextUrl = buildSimpleWallpaperUrl("picsum", cfg.wallpaperTheme);
    try {
      await preloadImage(nextUrl);
    } catch {
      nextUrl = "";
    }
  }

  if (!nextUrl || token !== wallpaperLoadToken) {
    if (!hasVisibleSource && !cachedShown) {
      elements.bgImage.classList.remove("visible");
      clearBlurLayer();
    }
    return;
  }

  state.ui.background.wallpaperCachedUrl = nextUrl;
  state.ui.background.wallpaperCachedAt = Date.now();
  state.ui.background.wallpaperCachedSignature = activeSignature;
  wallpaperSourceSignature = activeSignature;
  queueSave();

  applyWallpaperSwap(nextUrl, token);
}

function scheduleWallpaperRefresh(signature) {
  clearWallpaperTimer();

  if (state.ui.background.mode !== "wallpaper") {
    return;
  }

  const cfg = state.ui.background;
  const period = wallpaperRotateMs(cfg);
  let wait = 1000;

  if (hasWallpaperCacheRecord(cfg, signature)) {
    const age = Math.max(0, Date.now() - Number(cfg.wallpaperCachedAt || 0));
    wait = Math.max(1000, period - age);
  }

  wallpaperTimer = setTimeout(() => {
    if (state.ui.background.mode !== "wallpaper") {
      return;
    }
    const nextSignature = wallpaperSignature(state.ui.background);
    void refreshWallpaper({ signature: nextSignature, force: true }).finally(() => {
      scheduleWallpaperRefresh(nextSignature);
    });
  }, wait);
}

function syncBackgroundRefreshButton() {
  if (!elements.bgRefreshBtn) {
    return;
  }
  const bgMode = state?.ui?.background?.mode;
  const manualUrl = normalizeText(state?.ui?.background?.videoUrl);
  const videoReady = bgMode === "video" && (state?.ui?.background?.videoSource === "reddit" || Boolean(manualUrl));
  const canRefresh = bgMode === "wallpaper" || videoReady;
  elements.bgRefreshBtn.disabled = !canRefresh;
  elements.bgRefreshBtn.classList.toggle("is-disabled", !canRefresh);
  const title = bgMode === "video" ? "Refresh loop video" : "Refresh wallpaper";
  elements.bgRefreshBtn.title = title;
}

function refreshBackgroundNow() {
  const mode = state.ui.background.mode;
  if (mode === "wallpaper") {
    const signature = wallpaperSignature(state.ui.background);
    void refreshWallpaper({ signature, force: true }).finally(() => {
      if (state.ui.background.mode !== "wallpaper") {
        return;
      }
      scheduleWallpaperRefresh(wallpaperSignature(state.ui.background));
    });
    return;
  }
  if (mode === "video") {
    void loadVideoLoop({ force: true });
  }
}

function applyBackground() {
  clearWallpaperTimer();

  const cfg = state.ui.background;
  const theme = state.ui.theme;
  const overlay = clamp(Number(cfg.overlayOpacity) || 0.24, 0, 0.85);

  elements.bgOverlay.style.background = `rgba(8, 11, 16, ${overlay})`;
  elements.bgLayer.style.background = theme.background;
  hideVideo();
  if (cfg.mode !== "video") {
    videoLoadToken += 1;
  }
  syncBackgroundRefreshButton();

  if (cfg.mode === "solid") {
    wallpaperSourceSignature = "";
    wallpaperLoadToken += 1;
    elements.bgImage.classList.remove("visible");
    clearBlurLayer();
    elements.bgLayer.style.background = cfg.solidColor || theme.background;
    return;
  }

  if (cfg.mode === "video") {
    wallpaperSourceSignature = "";
    wallpaperLoadToken += 1;
    elements.bgImage.classList.remove("visible");
    clearBlurLayer();
    elements.bgLayer.style.background = theme.background;
    void loadVideoLoop({ force: false });
    return;
  }

  if (cfg.mode === "wallpaper") {
    elements.bgLayer.style.background = theme.background;
    const signature = wallpaperSignature(cfg);
    wallpaperSourceSignature = signature;
    void refreshWallpaper({ signature, force: false }).finally(() => {
      if (state.ui.background.mode !== "wallpaper") {
        return;
      }
      scheduleWallpaperRefresh(wallpaperSignature(state.ui.background));
    });
    return;
  }

  wallpaperSourceSignature = "";
  wallpaperLoadToken += 1;
  elements.bgImage.classList.remove("visible");
  clearBlurLayer();

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

function refreshAllWidgetCardsVisual() {
  for (const instance of state.instances) {
    const rt = runtime.get(instance.id);
    if (!rt?.card) {
      continue;
    }
    applyCardVisual(rt.card, instance);
  }
}

function refreshWidgetsByType(type) {
  for (const instance of state.instances) {
    if (instance.type !== type) {
      continue;
    }
    runtime.get(instance.id)?.controller?.refresh?.();
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

function normalizeGridSpanValue(value, fallback, max) {
  const num = Math.floor(Number(value));
  if (!Number.isFinite(num)) {
    return clamp(Math.floor(Number(fallback) || 1), 1, max);
  }
  return clamp(num, 1, max);
}

function syncAddWidgetSizeInputs() {
  const type = elements.widgetTypeSelect?.value;
  const def = widgetRegistry[type];
  if (!def) {
    return;
  }

  const size = widgetDefaultGridSize(type, def);
  const fixedSingleCell = type === "container";
  if (elements.addWidgetColSpanInput) {
    elements.addWidgetColSpanInput.value = String(size.colSpan);
    elements.addWidgetColSpanInput.disabled = fixedSingleCell;
  }
  if (elements.addWidgetRowSpanInput) {
    elements.addWidgetRowSpanInput.value = String(size.rowSpan);
    elements.addWidgetRowSpanInput.disabled = fixedSingleCell;
  }
  if (elements.addWidgetTitleInput) {
    elements.addWidgetTitleInput.placeholder = `Default: ${def.title}`;
    elements.addWidgetTitleInput.value = "";
  }
}

function openAddWidgetModal() {
  if (state.mode !== "edit") {
    return;
  }
  if (!elements.addWidgetModalOverlay) {
    addWidget(elements.widgetTypeSelect?.value || widgetList[0]?.type || "clock");
    return;
  }

  if (modalState.open) {
    closeWidgetModal(false);
  }

  const firstType = widgetList[0]?.type;
  if (firstType && !widgetRegistry[elements.widgetTypeSelect?.value]) {
    elements.widgetTypeSelect.value = firstType;
  }

  syncAddWidgetSizeInputs();

  addWidgetModalOpen = true;
  elements.addWidgetModalOverlay.classList.add("open");
  elements.addWidgetModalOverlay.setAttribute("aria-hidden", "false");
  setModalInteractionLock(true);
  requestAnimationFrame(() => {
    elements.widgetTypeSelect?.focus();
  });
}

function closeAddWidgetModal() {
  if (!addWidgetModalOpen) {
    return;
  }

  addWidgetModalOpen = false;
  elements.addWidgetModalOverlay?.classList.remove("open");
  elements.addWidgetModalOverlay?.setAttribute("aria-hidden", "true");
  if (!modalState.open) {
    setModalInteractionLock(false);
  }
}

function applyAddWidgetModal() {
  const type = elements.widgetTypeSelect?.value;
  const def = widgetRegistry[type];
  if (!def) {
    return;
  }

  const defaultSize = widgetDefaultGridSize(type, def);
  const isContainerType = type === "container";
  const colSpan = isContainerType
    ? 1
    : normalizeGridSpanValue(elements.addWidgetColSpanInput?.value, defaultSize.colSpan, GRID_MAX_COLUMNS);
  const rowSpan = isContainerType
    ? 1
    : normalizeGridSpanValue(elements.addWidgetRowSpanInput?.value, defaultSize.rowSpan, GRID_MAX_ROW_SPAN);
  const title = normalizeText(elements.addWidgetTitleInput?.value, def.title);

  addWidget(type, {
    colSpan,
    rowSpan,
    title
  });
  closeAddWidgetModal();
}

function syncLauncherPagingState({ expandToFitInstances = true } = {}) {
  if (!state?.ui?.home) {
    return {
      pageCount: 1,
      activePage: 0
    };
  }

  const home = normalizeHomeLayout(state.ui.home);
  const instances = Array.isArray(state.instances) ? state.instances : [];
  let maxInstancePage = 0;

  for (const instance of instances) {
    const page = normalizeWidgetPage(instance.page, MAX_LAUNCHER_PAGES, 0);
    instance.page = page;
    if (!isWidgetDocked(instance) && !isWidgetInContainer(instance)) {
      maxInstancePage = Math.max(maxInstancePage, page);
    }
  }

  let pageCount = home.pageCount;
  if (expandToFitInstances) {
    pageCount = Math.max(pageCount, maxInstancePage + 1);
  }

  home.pageCount = normalizePageCount(pageCount, 1);
  for (const instance of instances) {
    instance.page = normalizeWidgetPage(instance.page, home.pageCount, 0);
  }
  home.activePage = normalizeActivePage(home.activePage, home.pageCount, 0);

  state.ui.home = home;
  return home;
}

function currentLauncherPageCount() {
  return normalizePageCount(state?.ui?.home?.pageCount, 1);
}

function currentLauncherActivePage() {
  const pageCount = currentLauncherPageCount();
  return normalizeActivePage(state?.ui?.home?.activePage, pageCount, 0);
}

function widgetPageOffsetX(page) {
  const boardW = Math.max(1, Math.floor(elements.board?.clientWidth || 1));
  const pageCount = currentLauncherPageCount();
  return normalizeWidgetPage(page, pageCount, 0) * boardW;
}

function pointInsideRect(x, y, rect) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !rect) {
    return false;
  }
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function registerContainerDropTarget(containerId, element) {
  const id = normalizeContainerId(containerId);
  if (!id || !(element instanceof HTMLElement)) {
    return;
  }
  containerDropUiState.targets.set(id, { element });
}

function unregisterContainerDropTarget(containerId) {
  const id = normalizeContainerId(containerId);
  if (!id) {
    return;
  }
  const current = containerDropUiState.targets.get(id);
  current?.element?.classList.remove("is-drop-target");
  containerDropUiState.targets.delete(id);
  if (containerDropUiState.activeId === id) {
    containerDropUiState.activeId = "";
  }
}

function clearContainerDropTargets() {
  for (const entry of containerDropUiState.targets.values()) {
    entry?.element?.classList.remove("is-drop-target");
  }
  containerDropUiState.targets.clear();
  containerDropUiState.activeId = "";
}

function setContainerDropTargetActive(containerId) {
  const activeId = normalizeContainerId(containerId);
  containerDropUiState.activeId = activeId;
  for (const [id, entry] of containerDropUiState.targets.entries()) {
    entry?.element?.classList.toggle("is-drop-target", Boolean(activeId) && id === activeId);
  }
}

function containerDropTargetAtPoint(x, y, draggedInstance = null) {
  if (draggedInstance?.type === "container") {
    return "";
  }

  const entries = Array.from(containerDropUiState.targets.entries()).reverse();
  for (const [containerId, entry] of entries) {
    if (!entry?.element?.isConnected) {
      continue;
    }

    if (draggedInstance && containerId === String(draggedInstance.id)) {
      continue;
    }

    const targetInstance = instanceById(containerId);
    if (!targetInstance || targetInstance.enabled === false || targetInstance.type !== "container") {
      continue;
    }
    if (targetInstance.config?.expanded !== true) {
      continue;
    }

    const rect = entry.element.getBoundingClientRect();
    if (pointInsideRect(x, y, rect)) {
      return containerId;
    }
  }

  return "";
}

function isDockDropPoint(x, y) {
  const config = buildDockConfig(state?.ui?.home);
  if (!config.enabled) {
    return false;
  }
  const dock = elements.persistentDock;
  if (!dock || dock.classList.contains("is-disabled")) {
    return false;
  }
  return pointInsideRect(x, y, dock.getBoundingClientRect());
}

function tryContainerWidgetByDrop(instance, pointerEvent, { record = true } = {}) {
  if (!instance || !pointerEvent) {
    return false;
  }

  const targetContainerId = containerDropTargetAtPoint(pointerEvent.clientX, pointerEvent.clientY, instance);
  if (!targetContainerId) {
    return false;
  }

  return setWidgetContainer(instance.id, targetContainerId, { record });
}

function setDockDropTargetActive(active) {
  elements.persistentDock?.classList.toggle("is-drop-target", Boolean(active));
}

function tryDockWidgetByDrop(instance, pointerEvent, { record = true } = {}) {
  if (!instance || !pointerEvent || !isDockDropPoint(pointerEvent.clientX, pointerEvent.clientY)) {
    return false;
  }
  if (isWidgetDocked(instance) || isWidgetInContainer(instance)) {
    return false;
  }

  if (record) {
    recordHistorySnapshot("Dock widget");
  }

  instance.dockOrder = nextDockOrder();
  normalizeDockedWidgetOrders(state.instances);
  setDockActiveId(instance.id, { rerender: false });

  if (state.selectedWidgetId === instance.id) {
    state.selectedWidgetId = "";
  }
  if (modalState.open && modalState.widgetId === instance.id) {
    closeWidgetModal(false);
  }
  return true;
}

function dockButtonsInStrip() {
  const strip = elements.dockWidgetStrip;
  if (!strip) {
    return [];
  }
  return Array.from(strip.querySelectorAll(".dock-widget-item"));
}

function applyDockActiveVisual(activeId = dockUiState.activeId) {
  const buttons = dockButtonsInStrip();
  if (!buttons.length) {
    dockUiState.activeId = "";
    return;
  }

  const fallbackId = normalizeText(buttons[0]?.dataset.widgetId);
  const normalized = normalizeText(activeId);
  const resolved = buttons.some((button) => normalizeText(button.dataset.widgetId) === normalized)
    ? normalized
    : fallbackId;

  dockUiState.activeId = resolved;

  for (const button of buttons) {
    const buttonId = normalizeText(button.dataset.widgetId);
    const active = buttonId === resolved;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  }
}

function syncDockOverflowState() {
  const strip = elements.dockWidgetStrip;
  if (!strip) {
    return;
  }

  const overflow = strip.scrollWidth - strip.clientWidth > 1;
  const atStart = strip.scrollLeft <= 1;
  const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;

  strip.dataset.overflowing = overflow ? "true" : "false";
  strip.dataset.overflowStart = !atStart && overflow ? "true" : "false";
  strip.dataset.overflowEnd = !atEnd && overflow ? "true" : "false";
}

function moveDockFocusByOffset(offset) {
  const buttons = dockButtonsInStrip();
  if (!buttons.length) {
    return;
  }
  const activeElement = document.activeElement;
  const index = Math.max(0, buttons.findIndex((button) => button === activeElement));
  const nextIndex = clamp(index + offset, 0, buttons.length - 1);
  const nextButton = buttons[nextIndex];
  if (!(nextButton instanceof HTMLElement)) {
    return;
  }
  nextButton.focus();
  setDockActiveId(normalizeText(nextButton.dataset.widgetId), { rerender: false });
  applyDockActiveVisual();
}

function moveDockFocusToEdge(edge) {
  const buttons = dockButtonsInStrip();
  if (!buttons.length) {
    return;
  }
  const nextButton = edge === "end" ? buttons[buttons.length - 1] : buttons[0];
  if (!(nextButton instanceof HTMLElement)) {
    return;
  }
  nextButton.focus();
  setDockActiveId(normalizeText(nextButton.dataset.widgetId), { rerender: false });
  applyDockActiveVisual();
}

function onDockStripKeyDown(event) {
  if (!(event.target instanceof HTMLElement) || !event.target.closest(".dock-widget-item")) {
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveDockFocusByOffset(1);
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveDockFocusByOffset(-1);
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    moveDockFocusToEdge("start");
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    moveDockFocusToEdge("end");
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.target.click();
  }
}

function onDockStripWheel(event) {
  const strip = elements.dockWidgetStrip;
  if (!strip) {
    return;
  }
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    return;
  }
  event.preventDefault();
  strip.scrollLeft += event.deltaY;
  syncDockOverflowState();
}

function syncDockContentPadding(config) {
  const root = document.documentElement;
  const dock = elements.persistentDock;

  if (!config?.enabled || !dock || dock.classList.contains("is-disabled")) {
    root.style.setProperty("--persistent-dock-height", "0px");
    root.style.setProperty("--persistent-dock-content-padding", "0px");
    root.style.setProperty("--persistent-dock-clearance", "0px");
    return;
  }

  const measured = Math.ceil(dock.getBoundingClientRect().height || 0);
  const dockHeight = Math.max(config.heightPx, measured);
  const contentPadding = dockHeight + 12;

  root.style.setProperty("--persistent-dock-height", `${dockHeight}px`);
  root.style.setProperty("--persistent-dock-content-padding", `${contentPadding}px`);
  root.style.setProperty("--persistent-dock-clearance", `${contentPadding}px`);
}

function renderDockWidgets() {
  const strip = elements.dockWidgetStrip;
  if (!strip) {
    return;
  }

  strip.replaceChildren();
  const items = buildDockItems();
  strip.classList.toggle("is-empty", items.length === 0);

  if (!items.length) {
    dockUiState.activeId = "";
    const empty = document.createElement("span");
    empty.className = "dock-widget-empty";
    empty.textContent = "Drop widgets here";
    strip.append(empty);
    syncDockOverflowState();
    return;
  }

  const activeId = normalizeDockActiveId(items);
  dockUiState.activeId = activeId;

  for (const item of items) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "dock-widget-item";
    chip.dataset.widgetId = item.id;
    chip.title = item.label;
    chip.setAttribute("aria-label", item.label);

    const icon = document.createElement("span");
    icon.className = "dock-item-icon";
    icon.textContent = item.iconText;

    const indicator = document.createElement("span");
    indicator.className = "dock-item-indicator";
    indicator.setAttribute("aria-hidden", "true");

    chip.append(icon, indicator);

    if (item.badge !== null) {
      const badge = document.createElement("span");
      badge.className = "dock-item-badge";
      badge.textContent = String(item.badge);
      badge.setAttribute("aria-hidden", "true");
      chip.append(badge);
    }

    chip.addEventListener("click", () => {
      setDockActiveId(item.id, { rerender: false });
      applyDockActiveVisual(item.id);
      if (state.mode === "edit") {
        setSelected(item.id);
        openWidgetModal(item.id);
        return;
      }
      setActiveLauncherPage(item.page, {
        shouldSave: true,
        animate: true
      });
    });
    strip.append(chip);
  }

  applyDockActiveVisual(activeId);
  syncDockOverflowState();
}

function syncPersistentDock(progress = null) {
  const dock = elements.persistentDock;
  if (!dock) {
    syncDockContentPadding({ enabled: false, heightPx: 0 });
    return;
  }

  const config = buildDockConfig(state?.ui?.home);
  if (!config.enabled) {
    setDockDropTargetActive(false);
    elements.dockWidgetStrip?.replaceChildren();
    dockUiState.activeId = "";
    dock.classList.add("is-disabled");
    dock.setAttribute("aria-hidden", "true");
    syncDockContentPadding(config);
    return;
  }

  dock.classList.remove("is-disabled");
  dock.setAttribute("aria-hidden", "false");
  dock.dataset.shape = config.shape;
  dock.dataset.visibility = config.visibility;
  dock.dataset.position = config.position;
  dock.style.setProperty("--dock-length-units", String(config.lengthUnits));
  dock.style.setProperty("--dock-unit-size", `${config.heightPx}px`);

  const pageCount = currentLauncherPageCount();
  const activePage = currentLauncherActivePage();
  const value = Number.isFinite(progress)
    ? clamp(progress, 0, Math.max(0, pageCount - 1))
    : activePage;
  const rounded = clamp(Math.round(value), 0, Math.max(0, pageCount - 1));

  if (elements.dockPageState) {
    elements.dockPageState.textContent = `${rounded + 1} / ${pageCount}`;
  }
  if (elements.dockPrevBtn) {
    elements.dockPrevBtn.disabled = rounded <= 0;
  }
  if (elements.dockNextBtn) {
    elements.dockNextBtn.disabled = rounded >= pageCount - 1;
  }
  if (elements.dockSettingsBtn) {
    const settingsTitle = dockSettingsModalOpen ? "Close dock settings" : "Open dock settings";
    elements.dockSettingsBtn.title = settingsTitle;
    elements.dockSettingsBtn.setAttribute("aria-label", settingsTitle);
    elements.dockSettingsBtn.classList.toggle("is-active", dockSettingsModalOpen);
  }

  renderDockWidgets();
  syncDockContentPadding(config);
  if (!Number.isFinite(progress)) {
    requestAnimationFrame(() => {
      syncDockContentPadding(config);
    });
  }
}

function syncPageIndicator(progress = null) {
  const indicator = elements.pageIndicator;
  if (!indicator || !state?.ui?.home) {
    return;
  }

  const pageCount = currentLauncherPageCount();
  const activePage = currentLauncherActivePage();
  const allowAdd = state.mode === "edit" && pageCount < MAX_LAUNCHER_PAGES;
  const allowRemove = state.mode === "edit" && pageCount > 1;
  const signature = `${pageCount}:${allowAdd ? "add" : "no-add"}:${allowRemove ? "remove" : "no-remove"}`;

  if (indicator.dataset.signature !== signature) {
    indicator.replaceChildren();
    indicator.dataset.signature = signature;

    const dots = document.createElement("div");
    dots.className = "page-indicator-dots";

    for (let i = 0; i < pageCount; i += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "page-indicator-dot";
      dot.setAttribute("aria-label", `Open page ${i + 1}`);
      dot.dataset.pageIndex = String(i);
      dot.addEventListener("click", () => {
        setActiveLauncherPage(i, { shouldSave: true, animate: true });
      });
      dots.append(dot);
    }

    const thumb = document.createElement("span");
    thumb.className = "page-indicator-thumb";
    dots.append(thumb);
    indicator.append(dots);

    if (allowAdd) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "page-indicator-add";
      addBtn.textContent = "+";
      addBtn.title = "Add launcher page";
      addBtn.setAttribute("aria-label", "Add launcher page");
      addBtn.addEventListener("click", () => {
        addLauncherPage();
      });
      indicator.append(addBtn);
    }

    if (allowRemove) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "page-indicator-remove";
      removeBtn.textContent = "-";
      removeBtn.title = "Remove current page";
      removeBtn.setAttribute("aria-label", "Remove current page");
      removeBtn.addEventListener("click", () => {
        removeLauncherPage();
      });
      indicator.append(removeBtn);
    }
  }

  const value = Number.isFinite(progress)
    ? clamp(progress, 0, Math.max(0, pageCount - 1))
    : activePage;
  const rounded = clamp(Math.round(value), 0, Math.max(0, pageCount - 1));

  const dotsWrap = indicator.querySelector(".page-indicator-dots");
  dotsWrap?.style.setProperty("--page-progress", String(value));

  const dots = indicator.querySelectorAll(".page-indicator-dot");
  dots.forEach((dot, index) => {
    const isActive = index === rounded;
    dot.classList.toggle("active", isActive);
    dot.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function renderBoardViewport({ dragOffsetX = 0, animate = true, dragging = false } = {}) {
  if (!elements.board || !state?.ui?.home) {
    return;
  }

  const pageCount = currentLauncherPageCount();
  const activePage = currentLauncherActivePage();
  const boardW = Math.max(1, Math.floor(elements.board.clientWidth));

  let offset = Number(dragOffsetX) || 0;
  if ((activePage === 0 && offset > 0) || (activePage === pageCount - 1 && offset < 0)) {
    offset *= 0.34;
  }

  const translateX = Math.round(-(activePage * boardW) + offset);
  elements.board.style.setProperty("--board-page-translate-x", `${translateX}px`);
  elements.board.classList.toggle("no-page-transition", !animate);
  elements.board.classList.toggle("is-page-dragging", dragging);

  if (dragging) {
    const progress = activePage - offset / boardW;
    syncPageIndicator(progress);
    syncPersistentDock(progress);
  } else {
    syncPageIndicator(activePage);
    syncPersistentDock(activePage);
  }

  refreshWidgetsByType("container");
}

function setActiveLauncherPage(page, { shouldSave = false, animate = true } = {}) {
  if (!state?.ui?.home) {
    return false;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const nextPage = normalizeActivePage(page, home.pageCount, home.activePage);
  const changed = home.activePage !== nextPage;

  home.activePage = nextPage;
  state.ui.home = home;

  renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });

  if (changed && shouldSave) {
    queueSave();
  }
  return changed;
}

function addLauncherPage() {
  if (state.mode !== "edit") {
    return;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  if (home.pageCount >= MAX_LAUNCHER_PAGES) {
    return;
  }

  recordHistorySnapshot("Add launcher page");
  home.pageCount = normalizePageCount(home.pageCount + 1, home.pageCount + 1);
  home.activePage = home.pageCount - 1;
  state.ui.home = home;

  renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
  renderSettings();
  queueSave();
}

function removeLauncherPage() {
  if (state.mode !== "edit") {
    return;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  if (home.pageCount <= 1) {
    return;
  }

  const targetPage = currentLauncherActivePage();
  const fallbackPage = Math.max(0, targetPage - 1);

  recordHistorySnapshot("Remove launcher page");

  for (const instance of state.instances) {
    const currentPage = normalizeWidgetPage(instance.page, home.pageCount, 0);
    if (currentPage > targetPage) {
      instance.page = currentPage - 1;
      continue;
    }
    if (currentPage === targetPage) {
      instance.page = fallbackPage;
    }
  }

  home.pageCount = normalizePageCount(home.pageCount - 1, home.pageCount - 1);
  home.activePage = normalizeActivePage(Math.min(targetPage, home.pageCount - 1), home.pageCount, fallbackPage);
  state.ui.home = home;

  updateBoardBounds();
  renderSettings();
  queueSave();
}

function applyLayout(card, layout, page = 0) {
  card.style.left = `${Math.round(layout.x + widgetPageOffsetX(page))}px`;
  card.style.top = `${Math.round(layout.y)}px`;
  card.style.width = `${Math.max(1, Math.round(layout.w))}px`;
  card.style.height = `${Math.max(1, Math.round(layout.h))}px`;
}

function isGridLayoutMode() {
  return state?.ui?.home?.mode === "grid";
}

function captureFreeLayouts() {
  for (const instance of state.instances) {
    instance.freeLayout = {
      x: Number(instance.layout.x) || 0,
      y: Number(instance.layout.y) || 0,
      w: Number(instance.layout.w) || 320,
      h: Number(instance.layout.h) || 220
    };
  }
}

function restoreFreeLayouts() {
  for (const instance of state.instances) {
    if (!instance.freeLayout) {
      continue;
    }
    instance.layout = cloneLayout(instance.freeLayout);
  }
}

function applyGridLayout({ commitFreeLayout = false, shouldSave = false } = {}) {
  if (!isGridLayoutMode()) {
    return;
  }

  syncLauncherPagingState({ expandToFitInstances: true });

  if (commitFreeLayout) {
    captureFreeLayouts();
  }

  const items = state.instances.filter(
    (instance) => instance.enabled !== false && !isWidgetDocked(instance) && !isWidgetInContainer(instance)
  );
  if (!items.length) {
    renderBoardViewport({ animate: false, dragging: false, dragOffsetX: 0 });
    return;
  }

  const metrics = gridMetrics(items);

  const byPage = new Map();
  for (const instance of items) {
    const page = normalizeWidgetPage(instance.page, state.ui.home.pageCount, 0);
    instance.page = page;
    if (!byPage.has(page)) {
      byPage.set(page, []);
    }
    byPage.get(page).push(instance);
  }

  for (const pageItems of byPage.values()) {
    for (let i = 0; i < pageItems.length; i += 1) {
      const instance = pageItems[i];
      const def = widgetRegistry[instance.type];
      const defaultSize = widgetDefaultGridSize(instance.type, def);
      const grid = normalizeGridLayout(instance.gridLayout, {
        col: i % metrics.cols,
        row: Math.floor(i / metrics.cols),
        colSpan: defaultSize.colSpan,
        rowSpan: defaultSize.rowSpan
      });

      if (instance.type === "container") {
        grid.colSpan = 1;
        grid.rowSpan = 1;
      }

      grid.colSpan = clamp(grid.colSpan, 1, metrics.cols);
      grid.rowSpan = clamp(grid.rowSpan, 1, metrics.rows);
      grid.col = clamp(grid.col, 0, Math.max(0, metrics.cols - grid.colSpan));
      grid.row = clamp(grid.row, 0, Math.max(0, metrics.rows - grid.rowSpan));
      instance.gridLayout = grid;

      instance.layout.x = metrics.marginX + grid.col * (metrics.cellW + metrics.gapX);
      instance.layout.y = metrics.marginY + grid.row * (metrics.cellH + metrics.gapY);
      instance.layout.w = metrics.cellW * grid.colSpan + metrics.gapX * (grid.colSpan - 1);
      instance.layout.h = metrics.cellH * grid.rowSpan + metrics.gapY * (grid.rowSpan - 1);

      const rt = runtime.get(instance.id);
      if (rt?.card) {
        applyLayout(rt.card, instance.layout, instance.page);
        if (instance.type === "container") {
          rt.controller?.refresh?.();
        }
      }
    }
  }

  renderBoardViewport({ animate: false, dragging: false, dragOffsetX: 0 });

  if (shouldSave) {
    queueSave();
  }
}

function updateBoardBounds() {
  syncLauncherPagingState({ expandToFitInstances: true });

  if (isGridLayoutMode()) {
    applyGridLayout({ commitFreeLayout: false, shouldSave: false });
    return;
  }

  const boardW = Math.max(1, Math.floor(elements.board.clientWidth));
  const boardH = Math.max(1, Math.floor(elements.board.clientHeight));

  for (const instance of state.instances) {
    if (isWidgetDocked(instance) || isWidgetInContainer(instance)) {
      continue;
    }

    if (instance.type === "container") {
      enforceContainerWidgetSize(instance);
    }

    const minW = Math.min(80, boardW);
    const minH = Math.min(80, boardH);

    instance.layout.w = clamp(Number(instance.layout.w) || minW, minW, boardW);
    instance.layout.h = clamp(Number(instance.layout.h) || minH, minH, boardH);
    instance.layout.x = clamp(Number(instance.layout.x) || 0, 0, Math.max(0, boardW - instance.layout.w));
    instance.layout.y = clamp(Number(instance.layout.y) || 0, 0, Math.max(0, boardH - instance.layout.h));

    const rt = runtime.get(instance.id);
    if (rt?.card) {
      applyLayout(rt.card, instance.layout, instance.page);
      if (instance.type === "container") {
        rt.controller?.refresh?.();
      }
    }
  }

  renderBoardViewport({ animate: false, dragging: false, dragOffsetX: 0 });
}

function autoArrangeWidgets() {
  if (state.mode !== "edit") {
    return;
  }

  syncLauncherPagingState({ expandToFitInstances: true });

  if (isGridLayoutMode()) {
    applyGridLayout({ commitFreeLayout: false, shouldSave: true });
    return;
  }

  const items = state.instances.filter(
    (instance) => instance.enabled !== false && !isWidgetDocked(instance) && !isWidgetInContainer(instance)
  );
  if (!items.length) {
    return;
  }

  const boardW = Math.max(1, Math.floor(elements.board.clientWidth));
  const boardH = Math.max(1, Math.floor(elements.board.clientHeight));
  const gap = boardW < 900 ? 10 : 14;

  const byPage = new Map();
  for (const instance of items) {
    const page = normalizeWidgetPage(instance.page, state.ui.home.pageCount, 0);
    instance.page = page;
    if (!byPage.has(page)) {
      byPage.set(page, []);
    }
    byPage.get(page).push(instance);
  }

  for (const pageItems of byPage.values()) {
    let best = null;
    for (let columns = 1; columns <= pageItems.length; columns += 1) {
      const rows = Math.ceil(pageItems.length / columns);
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
        rows: pageItems.length,
        cellW: Math.max(90, boardW - gap * 2),
        cellH: Math.max(70, Math.floor((boardH - gap * (pageItems.length + 1)) / Math.max(1, pageItems.length)))
      };
    }

    for (let i = 0; i < pageItems.length; i += 1) {
      const row = Math.floor(i / best.columns);
      const col = i % best.columns;
      const x = gap + col * (best.cellW + gap);
      const y = gap + row * (best.cellH + gap);

      const instance = pageItems[i];
      instance.layout.x = x;
      instance.layout.y = y;
      instance.layout.w = best.cellW;
      instance.layout.h = best.cellH;

      const rt = runtime.get(instance.id);
      if (rt?.card) {
        applyLayout(rt.card, instance.layout, instance.page);
      }
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
  if (instanceId) {
    bringWidgetToFront(instanceId);
  }
  state.selectedWidgetId = instanceId || "";
  const selectedInstance = instanceId ? instanceById(instanceId) : null;
  if (selectedInstance && isWidgetDocked(selectedInstance)) {
    setDockActiveId(selectedInstance.id, { rerender: false });
  }
  for (const [id, rt] of runtime.entries()) {
    rt.card.classList.toggle("selected", id === state.selectedWidgetId);
  }
  renderDockWidgets();
  renderSettings();
  queueSave();
}

function patchTheme(patch) {
  recordHistorySnapshot("Update theme");
  state.ui.theme = {
    ...state.ui.theme,
    ...patch
  };
  state.ui.theme.fontScale = clamp(Number(state.ui.theme.fontScale) || 1, 0.5, 2);

  applyTheme();
  applyBackground();
  refreshAllWidgetCardsVisual();
  refreshWidgetsByType("label");
  renderSettings();
  queueSave();
}

function patchHomeLayout(patch) {
  recordHistorySnapshot("Update layout settings");
  const hasExplicitPageCount =
    patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "pageCount");
  const prevMode = state.ui.home.mode;
  state.ui.home = normalizeHomeLayout({
    ...state.ui.home,
    ...patch
  });
  syncLauncherPagingState({ expandToFitInstances: !hasExplicitPageCount });

  const nextMode = state.ui.home.mode;
  if (prevMode !== nextMode) {
    if (nextMode === "grid") {
      applyGridLayout({ commitFreeLayout: true, shouldSave: false });
    } else {
      restoreFreeLayouts();
      updateBoardBounds();
    }
  } else if (nextMode === "grid") {
    applyGridLayout({ commitFreeLayout: false, shouldSave: false });
  } else {
    updateBoardBounds();
  }

  applyTheme();
  setBodyMode();
  renderSettings();
  queueSave();
}

function patchShortcutsUi(patch) {
  recordHistorySnapshot("Update shortcut global settings");
  state.ui.shortcuts = {
    ...state.ui.shortcuts,
    ...patch
  };
  state.ui.shortcuts.iconSizePercent = clamp(Number(state.ui.shortcuts.iconSizePercent) || 100, 40, 220);
  refreshAllWidgets();
  renderSettings();
  queueSave();
}

function patchWidgetCommonMaster(patch) {
  recordHistorySnapshot("Update widget common master settings");
  state.ui.widgetCommonMaster = normalizeWidgetCommonMaster({
    ...state.ui.widgetCommonMaster,
    ...patch
  });

  for (const instance of state.instances) {
    applyWidgetCommonMaster(instance, state.ui.widgetCommonMaster, false);
    instance.commonOverrides = inferCommonOverrides(instance, state.ui.widgetCommonMaster);
    const rt = runtime.get(instance.id);
    if (rt?.card) {
      applyCardVisual(rt.card, instance);
    }
  }

  refreshAllWidgets();
  renderSettings();
  queueSave();
}

function patchBackground(patch) {
  recordHistorySnapshot("Update background settings");
  state.ui.background = {
    ...state.ui.background,
    ...patch
  };
  state.ui.background.wallpaperProvider = normalizeWallpaperProvider(state.ui.background.wallpaperProvider, "picsum");
  state.ui.background.wallpaperTheme = normalizeText(state.ui.background.wallpaperTheme, "nature");
  state.ui.background.redditSubreddit = normalizeText(state.ui.background.redditSubreddit, "EarthPorn");
  state.ui.background.redditTime = normalizeText(state.ui.background.redditTime, "week");
  state.ui.background.rotateMinutes = clamp(Number(state.ui.background.rotateMinutes) || 15, 1, 240);
  state.ui.background.videoSource = normalizeVideoSource(state.ui.background.videoSource, "manual");
  state.ui.background.videoUrl = normalizeText(state.ui.background.videoUrl);
  state.ui.background.redditVideoSubreddit = normalizeText(state.ui.background.redditVideoSubreddit, "loopingvideos");
  state.ui.background.redditVideoTime = normalizeText(state.ui.background.redditVideoTime, "week");
  const videoFieldsTouched =
    patch && typeof patch === "object"
      ? ["videoSource", "videoUrl", "redditVideoSubreddit", "redditVideoTime"].some((key) => key in patch)
      : false;
  if (videoFieldsTouched) {
    state.ui.background.videoCacheSignature = "";
    state.ui.background.videoCacheStoredAt = 0;
  }
  state.ui.background.blurAmount = clamp(Number(state.ui.background.blurAmount) || 0, 0, 28);
  state.ui.background.overlayOpacity = clamp(
    Number(state.ui.background.overlayOpacity) || 0.24,
    0,
    0.85
  );

  applyBackground();
  refreshAllWidgetCardsVisual();
  refreshWidgetsByType("label");
  renderSettings();
  queueSave();
}

function patchWidgetConfig(instanceId, patch, { record = true } = {}) {
  const instance = instanceById(instanceId);
  if (!instance) {
    return;
  }
  if (record) {
    recordHistorySnapshot("Update widget settings");
  } else {
    touchUserMutationClock();
  }
  instance.config = { ...instance.config, ...patch };
  runtime.get(instanceId)?.controller?.refresh?.();
  renderSettings();
  queueSave();
}

function setWidgetContainer(instanceId, containerId, { record = true, rerender = true, save = true } = {}) {
  const instance = instanceById(instanceId);
  if (!instance || instance.type === "container") {
    return false;
  }

  const previousContainerId = normalizeContainerId(instance.containerId);
  const requestedContainerId = normalizeContainerId(containerId);
  let nextContainerId = "";

  if (requestedContainerId) {
    const target = instanceById(requestedContainerId);
    if (target && target.type === "container" && target.id !== instance.id) {
      nextContainerId = target.id;
    }
  }

  if (previousContainerId === nextContainerId) {
    return false;
  }

  if (record) {
    recordHistorySnapshot(nextContainerId ? "Move widget to folder" : "Move widget out of folder");
  } else {
    touchUserMutationClock();
  }

  instance.containerId = nextContainerId;
  if (nextContainerId) {
    instance.dockOrder = null;
    if (state.selectedWidgetId === instance.id) {
      state.selectedWidgetId = "";
    }
  }

  normalizeContainerAssignments(state.instances);

  if (rerender) {
    renderBoard();
    renderSettings();
  } else {
    refreshWidgetsByType("container");
  }

  if (save) {
    queueSave();
  }
  return true;
}

function releaseWidgetFromContainerByDrop(widgetId, payload = {}) {
  const instance = instanceById(widgetId);
  if (!instance || instance.type === "container") {
    return false;
  }

  const currentContainerId = normalizeContainerId(instance.containerId);
  if (!currentContainerId) {
    return false;
  }

  const boardRect = elements.board?.getBoundingClientRect();
  if (!boardRect) {
    return false;
  }

  recordHistorySnapshot("Move widget out of folder");

  const sourceContainer = instanceById(currentContainerId);
  const releasePage = normalizeWidgetPage(sourceContainer?.page, currentLauncherPageCount(), currentLauncherActivePage());

  setWidgetContainer(widgetId, "", { record: false, rerender: false, save: false });

  instance.page = releasePage;
  state.ui.home.activePage = releasePage;

  const pointerX = Number.isFinite(payload?.clientX) ? payload.clientX : boardRect.left + boardRect.width / 2;
  const pointerY = Number.isFinite(payload?.clientY) ? payload.clientY : boardRect.top + boardRect.height / 2;

  if (isGridLayoutMode()) {
    const metrics = gridMetrics();
    const def = widgetRegistry[instance.type];
    const grid = normalizeGridLayout(instance.gridLayout, {
      col: 0,
      row: 0,
      ...widgetDefaultGridSize(instance.type, def)
    });
    const spanWidth = metrics.cellW * grid.colSpan + metrics.gapX * (grid.colSpan - 1);
    const spanHeight = metrics.cellH * grid.rowSpan + metrics.gapY * (grid.rowSpan - 1);
    const stepX = Math.max(1, metrics.cellW + metrics.gapX);
    const stepY = Math.max(1, metrics.cellH + metrics.gapY);
    const localX = clamp(pointerX - boardRect.left - spanWidth / 2, 0, Math.max(0, boardRect.width - spanWidth));
    const localY = clamp(pointerY - boardRect.top - spanHeight / 2, 0, Math.max(0, boardRect.height - spanHeight));

    grid.col = clamp(Math.round((localX - metrics.marginX) / stepX), 0, Math.max(0, metrics.cols - grid.colSpan));
    grid.row = clamp(Math.round((localY - metrics.marginY) / stepY), 0, Math.max(0, metrics.rows - grid.rowSpan));

    instance.gridLayout = grid;
    instance.layout.x = metrics.marginX + grid.col * stepX;
    instance.layout.y = metrics.marginY + grid.row * stepY;
    instance.layout.w = spanWidth;
    instance.layout.h = spanHeight;
  } else {
    const maxW = Math.max(80, Math.floor(boardRect.width));
    const maxH = Math.max(80, Math.floor(boardRect.height));
    instance.layout.w = clamp(Number(instance.layout.w) || 320, 80, maxW);
    instance.layout.h = clamp(Number(instance.layout.h) || 220, 80, maxH);
    const maxX = Math.max(0, boardRect.width - instance.layout.w);
    const maxY = Math.max(0, boardRect.height - instance.layout.h);
    const nextX = clamp(pointerX - boardRect.left - instance.layout.w / 2, 0, maxX);
    const nextY = clamp(pointerY - boardRect.top - instance.layout.h / 2, 0, maxY);
    instance.layout.x = Math.round(nextX / SNAP) * SNAP;
    instance.layout.y = Math.round(nextY / SNAP) * SNAP;
  }

  state.selectedWidgetId = instance.id;
  renderBoard();
  queueSave();
  return true;
}

function patchWidgetLayout(instanceId, layoutPatch, options = {}) {
  const instance = instanceById(instanceId);
  if (!instance) {
    return;
  }
  const nextLayout = {
    ...instance.layout,
    ...layoutPatch
  };

  if (instance.type === "container") {
    const unit = containerUnitLayoutSize();
    nextLayout.w = unit.w;
    nextLayout.h = unit.h;
  }

  const changed =
    nextLayout.x !== instance.layout.x ||
    nextLayout.y !== instance.layout.y ||
    nextLayout.w !== instance.layout.w ||
    nextLayout.h !== instance.layout.h;

  if (!changed) {
    return;
  }

  if (options.record !== false) {
    recordHistorySnapshot(options.label || "Move widget");
  }

  instance.layout = nextLayout;
  const rt = runtime.get(instanceId);
  if (rt) {
    applyLayout(rt.card, instance.layout, instance.page);
    if (instance.type === "container") {
      rt.controller?.refresh?.();
    }
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
  const removed = state.instances[index];
  recordHistorySnapshot("Remove widget");
  runtime.get(instanceId)?.controller?.destroy?.();
  runtime.get(instanceId)?.card.remove();
  runtime.delete(instanceId);

  if (removed?.type === "container") {
    for (const instance of state.instances) {
      if (instance?.id === removed.id || instance?.type === "container") {
        continue;
      }
      if (normalizeContainerId(instance.containerId) === removed.id) {
        instance.containerId = "";
      }
    }
  }

  state.instances.splice(index, 1);
  normalizeDockedWidgetOrders(state.instances);
  normalizeContainerAssignments(state.instances);

  if (state.selectedWidgetId === instanceId) {
    state.selectedWidgetId = "";
  }

  if (modalState.open && modalState.widgetId === instanceId) {
    closeWidgetModal(false);
  }

  renderDockWidgets();
  renderSettings();
  if (removed?.type === "container" || isWidgetInContainer(removed)) {
    renderBoard();
  } else {
    updateBoardBounds();
    refreshWidgetsByType("container");
  }
  queueSave();
}

function createWidgetCard(instance) {
  const def = widgetRegistry[instance.type];
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".widget-card");
  const shell = fragment.querySelector(".widget-shell");
  const head = fragment.querySelector(".widget-head");
  const headActions = fragment.querySelector(".widget-head-actions");
  const title = fragment.querySelector(".widget-title");
  const body = fragment.querySelector(".widget-body");
  const contentHost = fragment.querySelector(".widget-content-host");
  const inlineActions = fragment.querySelector(".widget-inline-actions");
  const contentSlot = fragment.querySelector(".widget-content-slot");
  const selectBtn = fragment.querySelector(".widget-select-btn");
  const removeBtn = fragment.querySelector(".widget-remove-btn");
  const floatSelectBtn = fragment.querySelector(".widget-float-select");
  const floatRemoveBtn = fragment.querySelector(".widget-float-remove");
  const dragBtn = fragment.querySelector(".widget-drag-btn");
  const resizeHandle = fragment.querySelector(".widget-resize-handle");
  const paddingHandleTopRight = fragment.querySelector(".widget-padding-handle-top-right");
  const paddingHandleBottomLeft = fragment.querySelector(".widget-padding-handle-bottom-left");

  title.textContent = instance.title || def.title;
  card.dataset.widgetId = instance.id;
  card.dataset.widgetType = instance.type;
  card.dataset.treeId = instance.id;
  if (shell) {
    shell.dataset.treeId = `${instance.id}-1`;
  }
  if (head) {
    head.dataset.treeId = `${instance.id}-1-1`;
  }
  if (body) {
    body.dataset.treeId = `${instance.id}-1-2`;
  }
  if (contentHost) {
    contentHost.dataset.treeId = `${instance.id}-1-2-1`;
  }
  if (contentSlot) {
    contentSlot.dataset.treeId = `${instance.id}-1-2-2`;
  }
  if (resizeHandle) {
    resizeHandle.dataset.treeId = `${instance.id}-1-3`;
  }
  if (paddingHandleTopRight) {
    paddingHandleTopRight.dataset.treeId = `${instance.id}-1-4`;
  }
  if (paddingHandleBottomLeft) {
    paddingHandleBottomLeft.dataset.treeId = `${instance.id}-1-5`;
  }

  if (instance.type === "container") {
    resizeHandle?.remove();
  }

  applyLayout(card, instance.layout, instance.page);
  applyCardVisual(card, instance);
  applyCardStack(card, instance);

  const controller = def.create({
    container: contentSlot || body,
    getConfig: () => instance.config,
    getUi: () => state.ui,
    getWidget: () => instance,
    getAllWidgets: () => state.instances,
    getWidgetDefinition: (type) => widgetRegistry[type] || null,
    getGridMetrics: () => gridMetrics(),
    getWidgetRuntimeCard: (widgetId) => runtime.get(widgetId)?.card || null,
    patchConfig: (patch, options = {}) => patchWidgetConfig(instance.id, patch, options),
    patchWidgetConfigById: (widgetId, patch, options = {}) => patchWidgetConfig(widgetId, patch, options),
    setWidgetContainer: (widgetId, containerId) => setWidgetContainer(widgetId, containerId),
    releaseWidgetFromContainerByDrop: (widgetId, payload) => releaseWidgetFromContainerByDrop(widgetId, payload),
    registerContainerDropTarget: (containerId, element) => registerContainerDropTarget(containerId, element),
    unregisterContainerDropTarget: (containerId) => unregisterContainerDropTarget(containerId),
    isEditMode: () => state.mode === "edit",
    openSettings: () => {
      if (state.mode !== "edit") {
        return;
      }
      setSelected(instance.id);
      openWidgetModal(instance.id);
    },
    openWidgetSettingsById: (widgetId) => {
      if (state.mode !== "edit") {
        return;
      }
      const target = instanceById(widgetId);
      if (!target) {
        return;
      }
      setSelected(target.id);
      openWidgetModal(target.id);
    }
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

  if (instance.type === "bookmarks" && typeof controller?.refresh === "function") {
    const makeRefreshButton = (className, titleText) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = className;
      btn.title = titleText;
      btn.innerHTML = '<svg class="icon"><use href="#i-reset"></use></svg>';
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        controller.refresh();
      });
      return btn;
    };

    const headRefresh = makeRefreshButton("icon-btn widget-refresh-btn", "Refresh bookmarks");
    if (selectBtn?.parentElement === headActions) {
      headActions.insertBefore(headRefresh, selectBtn);
    } else {
      headActions?.prepend(headRefresh);
    }

    const floatRefresh = makeRefreshButton("icon-btn widget-float-refresh", "Refresh bookmarks");
    if (floatSelectBtn?.parentElement === inlineActions) {
      inlineActions.insertBefore(floatRefresh, floatSelectBtn);
    } else {
      inlineActions?.prepend(floatRefresh);
    }
    card.classList.add("supports-headless-refresh");
  }

  if (instance.type === "mondayAssigned") {
    const makeActionButton = (className, titleText, iconId, action, onAfter = null) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = className;
      btn.title = titleText;
      btn.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(action?.()).finally(() => {
          onAfter?.();
        });
      });
      return btn;
    };

    const placeHeadAction = (btn) => {
      if (selectBtn?.parentElement === headActions) {
        headActions.insertBefore(btn, selectBtn);
      } else {
        headActions?.prepend(btn);
      }
    };

    const placeFloatAction = (btn) => {
      if (floatSelectBtn?.parentElement === inlineActions) {
        inlineActions.insertBefore(btn, floatSelectBtn);
      } else {
        inlineActions?.prepend(btn);
      }
    };

    const runRefresh = () => {
      if (typeof controller?.manualRefresh === "function") {
        return controller.manualRefresh();
      } else if (typeof controller?.refresh === "function") {
        return controller.refresh();
      }
      return null;
    };

    const runOpenMonday = () => {
      if (typeof controller?.openMonday === "function") {
        return controller.openMonday();
      }
      return null;
    };

    const runToggleAuth = () => {
      if (typeof controller?.toggleConnection === "function") {
        return controller.toggleConnection();
      }
      return null;
    };

    const authButtons = [];
    const syncAuthButtonState = () => {
      const connected =
        typeof controller?.isConnected === "function" ? Boolean(controller.isConnected()) : false;
      for (const btn of authButtons) {
        btn.classList.toggle("is-disconnect", connected);
        btn.title = connected ? "Disconnect Monday" : "Connect Monday";
      }
    };

    if (
      typeof controller?.manualRefresh === "function" ||
      typeof controller?.refresh === "function"
    ) {
      const headRefresh = makeActionButton(
        "icon-btn widget-refresh-btn",
        "Refresh Monday issues",
        "i-reset",
        runRefresh,
        syncAuthButtonState
      );
      placeHeadAction(headRefresh);

      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        "Refresh Monday issues",
        "i-reset",
        runRefresh,
        syncAuthButtonState
      );
      placeFloatAction(floatRefresh);
    }

    if (typeof controller?.openMonday === "function") {
      const headOpen = makeActionButton(
        "icon-btn widget-open-btn",
        "Open Monday",
        "i-open",
        runOpenMonday
      );
      placeHeadAction(headOpen);

      const floatOpen = makeActionButton(
        "icon-btn widget-float-open",
        "Open Monday",
        "i-open",
        runOpenMonday
      );
      placeFloatAction(floatOpen);
    }

    if (typeof controller?.toggleConnection === "function") {
      const headAuth = makeActionButton(
        "icon-btn widget-auth-toggle-btn",
        "Connect Monday",
        "i-plug",
        runToggleAuth,
        syncAuthButtonState
      );
      const floatAuth = makeActionButton(
        "icon-btn widget-float-auth-toggle",
        "Connect Monday",
        "i-plug",
        runToggleAuth,
        syncAuthButtonState
      );
      authButtons.push(headAuth, floatAuth);
      placeHeadAction(headAuth);
      placeFloatAction(floatAuth);
      syncAuthButtonState();
    }

    card.classList.add("supports-headless-refresh");
  }

  if (instance.type === "githubPrList") {
    const makeActionButton = (className, titleText, iconId, action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = className;
      btn.title = titleText;
      btn.innerHTML = `<svg class="icon"><use href="#${iconId}"></use></svg>`;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(action?.());
      });
      return btn;
    };

    const placeHeadAction = (btn) => {
      if (selectBtn?.parentElement === headActions) {
        headActions.insertBefore(btn, selectBtn);
      } else {
        headActions?.prepend(btn);
      }
    };

    const placeFloatAction = (btn) => {
      if (floatSelectBtn?.parentElement === inlineActions) {
        inlineActions.insertBefore(btn, floatSelectBtn);
      } else {
        inlineActions?.prepend(btn);
      }
    };

    const runRefresh = () => {
      if (typeof controller?.manualRefresh === "function") {
        return controller.manualRefresh();
      }
      if (typeof controller?.refresh === "function") {
        return controller.refresh();
      }
      return null;
    };

    const runOpenRepository = () => {
      if (typeof controller?.openRepository === "function") {
        return controller.openRepository();
      }
      return null;
    };

    if (
      typeof controller?.manualRefresh === "function" ||
      typeof controller?.refresh === "function"
    ) {
      const headRefresh = makeActionButton(
        "icon-btn widget-refresh-btn",
        "Refresh pull requests",
        "i-reset",
        runRefresh
      );
      placeHeadAction(headRefresh);

      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        "Refresh pull requests",
        "i-reset",
        runRefresh
      );
      placeFloatAction(floatRefresh);
    }

    if (typeof controller?.openRepository === "function") {
      const headOpen = makeActionButton(
        "icon-btn widget-open-btn",
        "Open repository",
        "i-open",
        runOpenRepository
      );
      placeHeadAction(headOpen);

      const floatOpen = makeActionButton(
        "icon-btn widget-float-open",
        "Open repository",
        "i-open",
        runOpenRepository
      );
      placeFloatAction(floatOpen);
    }

    card.classList.add("supports-headless-refresh");
  }

  card.addEventListener(
    "click",
    (event) => {
      const justFinishedDrag = Date.now() - lastDragEndAt <= 280;
      if (!justFinishedDrag) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  card.addEventListener("click", (event) => {
    if (instance.type === "container") {
      if (Date.now() - lastDragEndAt <= 280) {
        return;
      }
      if (event.target.closest("button, input, textarea, select, a, [contenteditable='true']")) {
        return;
      }

      if (state.mode === "edit") {
        setSelected(instance.id);
      }

      event.preventDefault();
      event.stopPropagation();
      patchWidgetConfig(instance.id, {
        expanded: instance.config?.expanded !== true
      }, { record: false });
      return;
    }

    if (state.mode !== "edit") {
      return;
    }
    setSelected(instance.id);
    if (instance.type === "shortcut" && event.target.closest(".shortcut-tile")) {
      event.preventDefault();
      event.stopPropagation();
      openWidgetModal(instance.id);
      return;
    }
    if (instance.type === "aiChat" && event.target.closest(".ai-chat-widget")) {
      if (event.target.closest("form, input, textarea, button, a, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openWidgetModal(instance.id);
    }
  });

  const startDrag = ({
    event = null,
    target = null,
    fromHandleButton = false,
    startX = null,
    startY = null,
    allowUseMode = false,
    fromLongPress = false
  } = {}) => {
    if (state.mode !== "edit" && !allowUseMode) {
      return false;
    }
    if (event && Number.isFinite(event.button) && event.button !== 0 && event.button !== -1) {
      return false;
    }
    if (!fromHandleButton && !allowUseMode && target?.closest("button, input, textarea, select, a")) {
      return false;
    }

    event?.stopPropagation();
    event?.preventDefault();

    if (state.mode === "edit") {
      setSelected(instance.id);
    }

    const dragStartX = Number.isFinite(startX) ? startX : event?.clientX;
    const dragStartY = Number.isFinite(startY) ? startY : event?.clientY;
    if (!Number.isFinite(dragStartX) || !Number.isFinite(dragStartY)) {
      return false;
    }

    if (fromLongPress) {
      card.classList.remove("longpress-drag-armed");
    }
    card.classList.add("widget-drag-active");

    const pageSwitchThreshold = 42;
    const pageSwitchCooldownMs = 190;
    let lastPageSwitchAt = 0;
    let pageChangedDuringDrag = false;

    const edgeDirectionFromPointer = (clientX) => {
      const rect = elements.board.getBoundingClientRect();
      if (!Number.isFinite(clientX) || rect.width < pageSwitchThreshold * 2) {
        return 0;
      }
      if (clientX <= rect.left + pageSwitchThreshold) {
        return -1;
      }
      if (clientX >= rect.right - pageSwitchThreshold) {
        return 1;
      }
      return 0;
    };

    const trySwitchPage = (direction, moveEvent, onSwitched = null) => {
      if (!direction) {
        return false;
      }

      const now = performance.now();
      if (now - lastPageSwitchAt < pageSwitchCooldownMs) {
        return false;
      }

      const pageCount = currentLauncherPageCount();
      const currentPage = normalizeWidgetPage(instance.page, pageCount, 0);
      const nextPage = currentPage + direction;
      if (nextPage < 0 || nextPage >= pageCount) {
        return false;
      }

      instance.page = nextPage;
      state.ui.home.activePage = nextPage;
      pageChangedDuringDrag = true;
      lastPageSwitchAt = now;

      if (typeof onSwitched === "function") {
        onSwitched(direction, nextPage, currentPage, moveEvent);
      }

      renderBoardViewport({ animate: false, dragging: false, dragOffsetX: 0 });
      return true;
    };

    if (isGridLayoutMode()) {
      recordHistorySnapshot("Move widget");
      const metrics = gridMetrics();
      const defForGrid = widgetRegistry[instance.type];
      const gridFallback = {
        col: 0,
        row: 0,
        ...widgetDefaultGridSize(instance.type, defForGrid)
      };
      const stepX = Math.max(1, metrics.cellW + metrics.gapX);
      const stepY = Math.max(1, metrics.cellH + metrics.gapY);
      const boardRect = elements.board.getBoundingClientRect();
      let lastPointerX = dragStartX;
      let lastPointerY = dragStartY;

      const snapLayoutToGrid = () => {
        const currentGrid = normalizeGridLayout(instance.gridLayout, gridFallback);
        const maxCol = Math.max(0, metrics.cols - currentGrid.colSpan);
        const maxRow = Math.max(0, metrics.rows - currentGrid.rowSpan);
        const snappedCol = clamp(Math.round((instance.layout.x - metrics.marginX) / stepX), 0, maxCol);
        const snappedRow = clamp(Math.round((instance.layout.y - metrics.marginY) / stepY), 0, maxRow);

        instance.gridLayout = {
          ...currentGrid,
          col: snappedCol,
          row: snappedRow
        };
      };

      const move = (moveEvent) => {
        const dx = moveEvent.clientX - lastPointerX;
        const dy = moveEvent.clientY - lastPointerY;
        lastPointerX = moveEvent.clientX;
        lastPointerY = moveEvent.clientY;
        const containerDropTargetId = containerDropTargetAtPoint(moveEvent.clientX, moveEvent.clientY, instance);
        setContainerDropTargetActive(containerDropTargetId);
        setDockDropTargetActive(!containerDropTargetId && isDockDropPoint(moveEvent.clientX, moveEvent.clientY));

        const maxX = Math.max(0, boardRect.width - instance.layout.w);
        const maxY = Math.max(0, boardRect.height - instance.layout.h);

        instance.layout.x = clamp(instance.layout.x + dx, 0, maxX);
        instance.layout.y = clamp(instance.layout.y + dy, 0, maxY);

        const direction = edgeDirectionFromPointer(moveEvent.clientX);
        trySwitchPage(direction, moveEvent, (switchDirection) => {
          const edgeInset = clamp(Math.round(instance.layout.w * 0.18), 16, 64);
          const maxLocalX = Math.max(0, boardRect.width - instance.layout.w);
          const nextLocalX = switchDirection > 0 ? edgeInset : maxLocalX - edgeInset;
          instance.layout.x = clamp(nextLocalX, 0, maxLocalX);
          lastPointerX = moveEvent.clientX;
          lastPointerY = moveEvent.clientY;
        });

        const rt = runtime.get(instance.id);
        if (rt?.card) {
          applyLayout(rt.card, instance.layout, instance.page);
          if (instance.type === "container") {
            rt.controller?.refresh?.();
          }
        }
      };

      const up = (upEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        setDockDropTargetActive(false);
        setContainerDropTargetActive("");
        card.classList.remove("longpress-drag-armed");
        card.classList.remove("widget-drag-active");
        lastDragEndAt = Date.now();

        if (tryContainerWidgetByDrop(instance, upEvent, { record: false })) {
          return;
        }

        if (tryDockWidgetByDrop(instance, upEvent, { record: false })) {
          renderBoard();
          queueSave();
          return;
        }

        snapLayoutToGrid();
        applyGridLayout({ commitFreeLayout: false, shouldSave: false });
        queueSave();
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      return true;
    }

    const boardRect = elements.board.getBoundingClientRect();
    let lastPointerX = dragStartX;
    let lastPointerY = dragStartY;

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - lastPointerX;
      const dy = moveEvent.clientY - lastPointerY;
      lastPointerX = moveEvent.clientX;
      lastPointerY = moveEvent.clientY;
      const containerDropTargetId = containerDropTargetAtPoint(moveEvent.clientX, moveEvent.clientY, instance);
      setContainerDropTargetActive(containerDropTargetId);
      setDockDropTargetActive(!containerDropTargetId && isDockDropPoint(moveEvent.clientX, moveEvent.clientY));
      const maxX = Math.max(0, boardRect.width - instance.layout.w);
      const maxY = Math.max(0, boardRect.height - instance.layout.h);

      const nextX = Math.max(0, Math.min(maxX, instance.layout.x + dx));
      const nextY = Math.max(0, Math.min(maxY, instance.layout.y + dy));

      patchWidgetLayout(instance.id, {
        x: nextX,
        y: nextY
      }, { record: false });

      const direction = edgeDirectionFromPointer(moveEvent.clientX);
      trySwitchPage(direction, moveEvent, (switchDirection) => {
        const edgeInset = clamp(Math.round(instance.layout.w * 0.18), 16, 64);
        const maxLocalX = Math.max(0, boardRect.width - instance.layout.w);
        const nextLocalX = switchDirection > 0 ? edgeInset : maxLocalX - edgeInset;
        patchWidgetLayout(instance.id, {
          x: clamp(nextLocalX, 0, maxLocalX)
        }, { record: false });
        const rt = runtime.get(instance.id);
        if (rt?.card) {
          applyLayout(rt.card, instance.layout, instance.page);
        }
        lastPointerX = moveEvent.clientX;
        lastPointerY = moveEvent.clientY;
      });
    };

    const up = (upEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setDockDropTargetActive(false);
      setContainerDropTargetActive("");
      card.classList.remove("longpress-drag-armed");
      card.classList.remove("widget-drag-active");
      lastDragEndAt = Date.now();

      if (tryContainerWidgetByDrop(instance, upEvent, { record: true })) {
        return;
      }

      if (tryDockWidgetByDrop(instance, upEvent, { record: true })) {
        renderBoard();
        queueSave();
        return;
      }

      const snappedX = Math.round(instance.layout.x / SNAP) * SNAP;
      const snappedY = Math.round(instance.layout.y / SNAP) * SNAP;
      const changedBySnap = snappedX !== instance.layout.x || snappedY !== instance.layout.y;

      if (changedBySnap) {
        patchWidgetLayout(instance.id, {
          x: snappedX,
          y: snappedY
        }, { label: "Move widget" });
        return;
      }

      if (pageChangedDuringDrag) {
        recordHistorySnapshot("Move widget");
        updateBoardBounds();
        renderSettings();
        queueSave();
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return true;
  };

  const longPressDragState = {
    timerId: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    moveTolerance: LONG_PRESS_DRAG_MOVE_TOLERANCE,
    target: null
  };

  const clearLongPressDrag = () => {
    if (longPressDragState.timerId !== null) {
      window.clearTimeout(longPressDragState.timerId);
      longPressDragState.timerId = null;
    }
    window.removeEventListener("pointermove", handleLongPressPointerMove);
    window.removeEventListener("pointerup", handleLongPressPointerEnd);
    window.removeEventListener("pointercancel", handleLongPressPointerEnd);
    window.removeEventListener("mousemove", handleLongPressMouseMove);
    window.removeEventListener("mouseup", handleLongPressMouseEnd);
    card.classList.remove("longpress-drag-armed");
    widgetLongPressState.pending = false;
    widgetLongPressState.pointerId = null;
    longPressDragState.pointerId = null;
    longPressDragState.startX = 0;
    longPressDragState.startY = 0;
    longPressDragState.moveTolerance = LONG_PRESS_DRAG_MOVE_TOLERANCE;
    longPressDragState.target = null;
  };

  const movedPastLongPressTolerance = (clientX, clientY) => {
    return Math.hypot(clientX - longPressDragState.startX, clientY - longPressDragState.startY) > longPressDragState.moveTolerance;
  };

  const handleLongPressPointerMove = (moveEvent) => {
    if (longPressDragState.pointerId !== null && moveEvent.pointerId !== longPressDragState.pointerId) {
      return;
    }
    if (movedPastLongPressTolerance(moveEvent.clientX, moveEvent.clientY)) {
      clearLongPressDrag();
    }
  };

  const handleLongPressPointerEnd = (endEvent) => {
    if (longPressDragState.pointerId !== null && endEvent.pointerId !== longPressDragState.pointerId) {
      return;
    }
    clearLongPressDrag();
  };

  const handleLongPressMouseMove = (moveEvent) => {
    if (movedPastLongPressTolerance(moveEvent.clientX, moveEvent.clientY)) {
      clearLongPressDrag();
    }
  };

  const handleLongPressMouseEnd = () => {
    clearLongPressDrag();
  };

  const scheduleLongPressDrag = (event, target) => {
    if (state.mode === "edit") {
      return false;
    }
    if (event && Number.isFinite(event.button) && event.button !== 0 && event.button !== -1) {
      return false;
    }

    const pointerStartX = event?.clientX;
    const pointerStartY = event?.clientY;
    if (!Number.isFinite(pointerStartX) || !Number.isFinite(pointerStartY)) {
      return false;
    }

    clearLongPressDrag();

    longPressDragState.pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
    longPressDragState.startX = pointerStartX;
    longPressDragState.startY = pointerStartY;
    const isShortcutPress = Boolean(target?.closest(".shortcut-tile"));
    const delayMs = isShortcutPress ? SHORTCUT_LONG_PRESS_DRAG_DELAY_MS : LONG_PRESS_DRAG_DELAY_MS;
    longPressDragState.moveTolerance = isShortcutPress ? LONG_PRESS_DRAG_MOVE_TOLERANCE + 10 : LONG_PRESS_DRAG_MOVE_TOLERANCE;
    longPressDragState.target = target || null;
    card.classList.add("longpress-drag-armed");
    widgetLongPressState.pending = true;
    widgetLongPressState.pointerId = longPressDragState.pointerId;

    if (longPressDragState.pointerId !== null) {
      window.addEventListener("pointermove", handleLongPressPointerMove, { passive: true });
      window.addEventListener("pointerup", handleLongPressPointerEnd, { passive: true });
      window.addEventListener("pointercancel", handleLongPressPointerEnd, { passive: true });
    } else {
      window.addEventListener("mousemove", handleLongPressMouseMove);
      window.addEventListener("mouseup", handleLongPressMouseEnd);
    }

    longPressDragState.timerId = window.setTimeout(() => {
      const dragTarget = longPressDragState.target;
      const dragStartX = longPressDragState.startX;
      const dragStartY = longPressDragState.startY;
      clearLongPressDrag();
      startDrag({
        event: null,
        target: dragTarget,
        fromHandleButton: false,
        startX: dragStartX,
        startY: dragStartY,
        allowUseMode: true,
        fromLongPress: true
      });
    }, delayMs);

    return true;
  };

  const startPaddingDrag = (event, corner) => {
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
    const fallbackPadding = widgetPaddingFallback(instance.type);
    const startPadding = resolveWidgetPadding(instance);
    instance.contentPaddingTop = startPadding.top;
    instance.contentPaddingRight = startPadding.right;
    instance.contentPaddingBottom = startPadding.bottom;
    instance.contentPaddingLeft = startPadding.left;
    let changed = false;
    let recorded = false;

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      const proportional = moveEvent.shiftKey;
      let nextTop = startPadding.top;
      let nextRight = startPadding.right;
      let nextBottom = startPadding.bottom;
      let nextLeft = startPadding.left;

      if (corner === "topRight") {
        if (proportional) {
          const delta = (-dx + dy) / 2.5;
          nextTop = normalizeContentPadding(startPadding.top + delta, fallbackPadding);
          nextRight = normalizeContentPadding(startPadding.right + delta, fallbackPadding);
        } else {
          nextTop = normalizeContentPadding(startPadding.top + dy / 2.5, fallbackPadding);
          nextRight = normalizeContentPadding(startPadding.right - dx / 2.5, fallbackPadding);
        }
      } else if (proportional) {
        const delta = (dx - dy) / 2.5;
        nextBottom = normalizeContentPadding(startPadding.bottom + delta, fallbackPadding);
        nextLeft = normalizeContentPadding(startPadding.left + delta, fallbackPadding);
      } else {
        nextBottom = normalizeContentPadding(startPadding.bottom - dy / 2.5, fallbackPadding);
        nextLeft = normalizeContentPadding(startPadding.left + dx / 2.5, fallbackPadding);
      }

      const currentTop = normalizeContentPadding(instance.contentPaddingTop, fallbackPadding);
      const currentRight = normalizeContentPadding(instance.contentPaddingRight, fallbackPadding);
      const currentBottom = normalizeContentPadding(instance.contentPaddingBottom, fallbackPadding);
      const currentLeft = normalizeContentPadding(instance.contentPaddingLeft, fallbackPadding);

      if (nextTop === currentTop && nextRight === currentRight && nextBottom === currentBottom && nextLeft === currentLeft) {
        return;
      }

      if (!recorded) {
        recordHistorySnapshot("Adjust content padding");
        recorded = true;
      }

      changed = true;
      instance.contentPaddingTop = nextTop;
      instance.contentPaddingRight = nextRight;
      instance.contentPaddingBottom = nextBottom;
      instance.contentPaddingLeft = nextLeft;
      instance.contentPaddingTopRight = normalizeContentPadding((nextTop + nextRight) / 2, fallbackPadding);
      instance.contentPaddingBottomLeft = normalizeContentPadding((nextBottom + nextLeft) / 2, fallbackPadding);
      instance.contentPadding = normalizeContentPadding((nextTop + nextRight + nextBottom + nextLeft) / 4, fallbackPadding);

      const rt = runtime.get(instance.id);
      if (rt?.card) {
        applyCardVisual(rt.card, instance);
      }

      if (modalState.open && modalState.widgetId === instance.id && modalState.draft) {
        modalState.draft.contentPaddingTop = instance.contentPaddingTop;
        modalState.draft.contentPaddingRight = instance.contentPaddingRight;
        modalState.draft.contentPaddingBottom = instance.contentPaddingBottom;
        modalState.draft.contentPaddingLeft = instance.contentPaddingLeft;
        modalState.draft.contentPaddingTopRight = instance.contentPaddingTopRight;
        modalState.draft.contentPaddingBottomLeft = instance.contentPaddingBottomLeft;
        modalState.draft.contentPadding = instance.contentPadding;
      }
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!changed) {
        return;
      }
      lastDragEndAt = Date.now();
      renderSettings();
      queueSave();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  head.addEventListener("pointerdown", (event) => {
    if (instance.type === "container") {
      return;
    }
    if (instance.viewMode === "headless") {
      return;
    }
    if (state.mode !== "edit") {
      return;
    }
    startDrag({ event, target: event.target, fromHandleButton: false });
  });

  head.addEventListener("mousedown", (event) => {
    if (typeof window.PointerEvent !== "undefined") {
      return;
    }
    if (instance.type === "container") {
      return;
    }
    if (instance.viewMode === "headless") {
      return;
    }
    if (state.mode !== "edit") {
      return;
    }
    startDrag({ event, target: event.target, fromHandleButton: false });
  });

  title?.addEventListener("pointerdown", (event) => {
    if (instance.type === "container") {
      return;
    }
    if (instance.viewMode === "headless") {
      return;
    }
    if (state.mode !== "edit") {
      return;
    }
    startDrag({ event, target: event.target, fromHandleButton: false });
  });

  title?.addEventListener("mousedown", (event) => {
    if (typeof window.PointerEvent !== "undefined") {
      return;
    }
    if (instance.type === "container") {
      return;
    }
    if (instance.viewMode === "headless") {
      return;
    }
    if (state.mode !== "edit") {
      return;
    }
    startDrag({ event, target: event.target, fromHandleButton: false });
  });

  card.addEventListener(
    "pointerdown",
    (event) => {
      if (state.mode === "edit") {
        return;
      }
      scheduleLongPressDrag(event, event.target);
    },
    true
  );

  card.addEventListener(
    "mousedown",
    (event) => {
      if (typeof window.PointerEvent !== "undefined") {
        return;
      }
      if (state.mode === "edit") {
        return;
      }
      scheduleLongPressDrag(event, event.target);
    },
    true
  );

  dragBtn?.addEventListener("pointerdown", (event) => {
    startDrag({ event, target: event.target, fromHandleButton: true });
  });

  dragBtn?.addEventListener("mousedown", (event) => {
    if (typeof window.PointerEvent !== "undefined") {
      return;
    }
    startDrag({ event, target: event.target, fromHandleButton: true });
  });

  paddingHandleTopRight?.addEventListener("pointerdown", (event) => {
    startPaddingDrag(event, "topRight");
  });

  paddingHandleBottomLeft?.addEventListener("pointerdown", (event) => {
    startPaddingDrag(event, "bottomLeft");
  });

  if (resizeHandle) {
    resizeHandle.addEventListener("pointerdown", (event) => {
      if (state.mode !== "edit") {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      if (instance.type === "container") {
        return;
      }

      event.stopPropagation();
      event.preventDefault();
      setSelected(instance.id);

      const startX = event.clientX;
      const startY = event.clientY;
      const startW = instance.layout.w;
      const startH = instance.layout.h;

      if (isGridLayoutMode()) {
        recordHistorySnapshot("Resize widget");
        const metrics = gridMetrics();
        const startGrid = normalizeGridLayout(instance.gridLayout, {
          col: 0,
          row: 0,
          ...widgetDefaultGridSize(instance.type, widgetRegistry[instance.type])
        });
        const stepX = Math.max(1, metrics.cellW + metrics.gapX);
        const stepY = Math.max(1, metrics.cellH + metrics.gapY);

        const moveGrid = (moveEvent) => {
          const dCol = Math.round((moveEvent.clientX - startX) / stepX);
          const dRow = Math.round((moveEvent.clientY - startY) / stepY);

          instance.gridLayout = {
            ...startGrid,
            colSpan: clamp(startGrid.colSpan + dCol, 1, Math.max(1, metrics.cols - startGrid.col)),
            rowSpan: clamp(startGrid.rowSpan + dRow, 1, Math.max(1, metrics.rows - startGrid.row))
          };

          applyGridLayout({ commitFreeLayout: false, shouldSave: false });
        };

        const upGrid = () => {
          window.removeEventListener("pointermove", moveGrid);
          window.removeEventListener("pointerup", upGrid);
          lastDragEndAt = Date.now();
          applyGridLayout({ commitFreeLayout: false, shouldSave: false });
          queueSave();
        };

        window.addEventListener("pointermove", moveGrid);
        window.addEventListener("pointerup", upGrid);
        return;
      }

      const move = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        const boardRect = elements.board.getBoundingClientRect();
        const maxW = Math.max(1, Math.floor(boardRect.width - instance.layout.x));
        const maxH = Math.max(1, Math.floor(boardRect.height - instance.layout.y));
        const minW = Math.min(80, maxW);
        const minH = Math.min(80, maxH);

        patchWidgetLayout(instance.id, {
          w: clamp(startW + dx, minW, maxW),
          h: clamp(startH + dy, minH, maxH)
        }, { record: false });
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        lastDragEndAt = Date.now();
        patchWidgetLayout(instance.id, {
          w: Math.round(instance.layout.w / SNAP) * SNAP,
          h: Math.round(instance.layout.h / SNAP) * SNAP
        }, { label: "Resize widget" });
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  elements.board.append(card);
  runtime.set(instance.id, { card, controller });
}

function renderBoard() {
  clearContainerDropTargets();
  for (const rt of runtime.values()) {
    rt.controller?.destroy?.();
  }
  runtime.clear();
  elements.board.replaceChildren();
  syncLauncherPagingState({ expandToFitInstances: true });
  normalizeDockedWidgetOrders(state.instances);
  syncZCounterFromState();

  for (const instance of state.instances) {
    if (instance.enabled !== false && !isWidgetDocked(instance) && !isWidgetInContainer(instance)) {
      createWidgetCard(instance);
    }
  }

  if (isGridLayoutMode()) {
    applyGridLayout({ commitFreeLayout: false, shouldSave: false });
  }

  setSelected(state.selectedWidgetId);
  setBodyMode();
  updateBoardBounds();
}

function createFormRow(labelText, helpText = "") {
  const row = document.createElement("label");
  row.className = "form-row";

  const titleWrap = document.createElement("span");
  titleWrap.className = "form-row-label";

  const text = document.createElement("span");
  text.textContent = labelText;
  titleWrap.append(text);

  const help = normalizeText(helpText);
  if (help) {
    const tip = document.createElement("span");
    tip.className = "field-help";
    tip.textContent = "?";
    tip.title = help;
    tip.setAttribute("aria-label", help);
    titleWrap.append(tip);
  }

  row.append(titleWrap);
  return row;
}

function normalizeDisplayColor(value, fallback = "#000000") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = [raw[1], raw[2], raw[3]];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback.toUpperCase();
}

function createColorControl(value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "color-field-control";

  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.value = normalizeDisplayColor(value, "#000000");

  const code = document.createElement("code");
  code.className = "color-code";
  code.textContent = swatch.value.toUpperCase();

  const emit = () => {
    const next = normalizeDisplayColor(swatch.value, "#000000");
    swatch.value = next;
    code.textContent = next;
    onChange(next);
  };

  swatch.addEventListener("input", emit);
  swatch.addEventListener("change", emit);

  wrap.append(swatch, code);
  return wrap;
}

function createSectionChip(text) {
  const chip = document.createElement("p");
  chip.className = "section-chip";
  chip.textContent = text;
  return chip;
}

function isThemeFieldKey(key) {
  return (
    key === "primary" ||
    key === "accent" ||
    key === "secondary" ||
    key === "background" ||
    key === "surface" ||
    key === "text" ||
    key === "line" ||
    key === "fontFamily" ||
    key === "fontScale" ||
    key === "widgetThemeMode" ||
    key === "useCustomColors" ||
    key === "customTextColor" ||
    key === "customAccentColor" ||
    key === "customSurfaceColor"
  );
}

function settingsEventName(schema) {
  if (schema.type === "checkbox" || schema.type === "select" || schema.type === "bookmark-folder-select") {
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

  if (schema.type === "bookmark-folder-select") {
    const select = document.createElement("select");
    const targetValue = String(value ?? "");

    chrome.bookmarks
      .getTree()
      .then((tree) => {
        const root = tree?.[0];
        if (!root) {
          select.value = targetValue;
          return;
        }

        const rootOption = document.createElement("option");
        rootOption.value = String(root.id);
        rootOption.textContent = "Everything";
        select.append(rootOption);

        const walk = (node, pathParts) => {
          const title = normalizeText(node.title, "Untitled");
          const nextParts = [...pathParts, title];
          if (!node.url) {
            const option = document.createElement("option");
            option.value = String(node.id);
            option.textContent = nextParts.join("/");
            select.append(option);
          }
          for (const child of node.children || []) {
            if (!child.url) {
              walk(child, nextParts);
            }
          }
        };

        for (const child of root.children || []) {
          if (!child.url) {
            walk(child, []);
          }
        }

        const nextValue = targetValue || String(root.id);
        select.value = nextValue;
        if (select.value !== nextValue) {
          select.value = String(root.id);
        }
      })
      .catch(() => {
        select.value = targetValue;
      });

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
  const themeFields = [
    { key: "primary", label: "Primary", type: "color" },
    { key: "accent", label: "Accent", type: "color" },
    { key: "secondary", label: "Secondary", type: "color" },
    { key: "background", label: "Background", type: "color" },
    { key: "surface", label: "Surface", type: "color" },
    { key: "text", label: "Text", type: "color" },
    { key: "line", label: "Line", type: "color" },
    { key: "fontFamily", label: "Font family", type: "select", options: FONT_OPTIONS },
    { key: "fontScale", label: "Content font scale", type: "number", min: 0.5, max: 2, step: 0.05 }
  ];

  for (const schema of themeFields) {
    const row = createFormRow(schema.label);
    row.classList.add("theme-row");
    const value = state.ui.theme[schema.key];
    if (schema.type === "color") {
      row.append(
        createColorControl(value, (next) => {
          patchTheme({ [schema.key]: next });
        })
      );
    } else {
      const input = createInputBySchema(schema, value);
      input.addEventListener(settingsEventName(schema), () => {
        const next = readFieldValue(input, schema);
        patchTheme({ [schema.key]: next });
      });
      row.append(input);
    }
    elements.settingsContent.append(row);
  }
  appendDivider();

  const home = state.ui.home;
  const homeFields = [
    {
      key: "mode",
      label: "Home layout mode",
      type: "select",
      options: [
        { value: "grid", label: "Grid" },
        { value: "free", label: "Free mode" }
      ]
    },
    {
      key: "gridColumns",
      label: "Grid columns (N)",
      type: "number",
      min: 1,
      max: GRID_MAX_COLUMNS,
      step: 1
    },
    {
      key: "gridRows",
      label: "Grid rows (M)",
      type: "number",
      min: 1,
      max: GRID_MAX_ROWS,
      step: 1
    },
    {
      key: "marginHorizontal",
      label: "Horizontal margin",
      type: "select",
      options: [
        { value: "wide", label: "Wide" },
        { value: "medium", label: "Medium" },
        { value: "narrow", label: "Narrow" },
        { value: "none", label: "None" }
      ]
    },
    {
      key: "marginVertical",
      label: "Vertical margin",
      type: "select",
      options: [
        { value: "wide", label: "Wide" },
        { value: "medium", label: "Medium" },
        { value: "narrow", label: "Narrow" },
        { value: "none", label: "None" }
      ]
    },
    {
      key: "itemGap",
      label: "Item gap",
      type: "select",
      options: [
        { value: "narrow", label: "Narrow (Default)" },
        { value: "wide", label: "Wide" },
        { value: "none", label: "None" }
      ]
    },
    {
      key: "pageCount",
      label: "Launcher pages",
      type: "number",
      min: 1,
      max: MAX_LAUNCHER_PAGES,
      step: 1
    },
    {
      key: "dockEnabled",
      label: "Enable dock",
      type: "checkbox"
    },
    {
      key: "widgetBackdropBlur",
      label: "Blur behind widgets",
      type: "checkbox"
    }
  ];

  for (const schema of homeFields) {
    if (home.mode === "free" && (schema.key === "gridColumns" || schema.key === "gridRows")) {
      continue;
    }
    const row = createFormRow(schema.label);
    const input = createInputBySchema(schema, home[schema.key]);
    input.addEventListener(settingsEventName(schema), () => {
      patchHomeLayout({ [schema.key]: readFieldValue(input, schema) });
    });
    row.append(input);
    elements.settingsContent.append(row);
  }

  appendDivider();
  const shortcutRow = createFormRow("Global shortcut icon size (%)");
  const shortcutInput = createInputBySchema(
    {
      key: "iconSizePercent",
      type: "number",
      min: 40,
      max: 220,
      step: 5
    },
    state.ui.shortcuts?.iconSizePercent ?? 100
  );
  shortcutInput.addEventListener("change", () => {
    patchShortcutsUi({ iconSizePercent: readFieldValue(shortcutInput, { type: "number" }) });
  });
  shortcutRow.append(shortcutInput);
  elements.settingsContent.append(shortcutRow);

  appendDivider();
  elements.settingsContent.append(createSectionChip("Widget Common Master"));

  const master = normalizeWidgetCommonMaster(state.ui.widgetCommonMaster);
  for (const schema of getWidgetCommonMasterFields()) {
    const row = createFormRow(schema.label);
    if (isThemeFieldKey(schema.key)) {
      row.classList.add("theme-row");
    }
    const value = master[schema.key];
    if (schema.type === "color") {
      row.append(
        createColorControl(value, (next) => {
          patchWidgetCommonMaster({ [schema.key]: next });
        })
      );
    } else {
      const input = createInputBySchema(schema, value);
      input.addEventListener(settingsEventName(schema), () => {
        patchWidgetCommonMaster({ [schema.key]: readFieldValue(input, schema) });
      });
      row.append(input);
    }
    elements.settingsContent.append(row);
  }

  const masterResetRow = document.createElement("div");
  masterResetRow.className = "preset-actions";
  const masterResetBtn = document.createElement("button");
  masterResetBtn.type = "button";
  masterResetBtn.className = "btn";
  masterResetBtn.textContent = "Reset Widget Common Master";
  masterResetBtn.addEventListener("click", () => {
    patchWidgetCommonMaster(defaultWidgetCommonMaster());
  });
  masterResetRow.append(masterResetBtn);
  elements.settingsContent.append(masterResetRow);
}

function renderProfileSettings() {
  const presetNameRow = createFormRow("Preset name");
  const presetNameInput = document.createElement("input");
  presetNameInput.type = "text";
  presetNameInput.placeholder = "My preset";
  presetNameRow.append(presetNameInput);
  elements.settingsContent.append(presetNameRow);

  const actionRow = document.createElement("div");
  actionRow.className = "preset-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-primary";
  saveBtn.textContent = "Save current";
  saveBtn.addEventListener("click", () => {
    savePreset(presetNameInput.value);
  });

  actionRow.append(saveBtn);
  elements.settingsContent.append(actionRow);

  appendDivider();
  elements.settingsContent.append(createSectionChip("Default Profile"));

  const hasDefaultProfile = Boolean(
    state?.ui?.defaultProfileSnapshot &&
      Array.isArray(state.ui.defaultProfileSnapshot.instances) &&
      state.ui.defaultProfileSnapshot.instances.length
  );
  const defaultProfileInfo = document.createElement("p");
  defaultProfileInfo.className = "muted";
  if (hasDefaultProfile) {
    const updatedAt = Number(state?.ui?.defaultProfileUpdatedAt) || 0;
    const stamp = updatedAt > 0 ? new Date(updatedAt).toLocaleString() : "saved";
    defaultProfileInfo.textContent = `Current state is saved as default profile (${stamp}).`;
  } else {
    defaultProfileInfo.textContent = "No default profile yet.";
  }
  elements.settingsContent.append(defaultProfileInfo);

  const defaultProfileRow = document.createElement("div");
  defaultProfileRow.className = "preset-actions";

  const setDefaultBtn = document.createElement("button");
  setDefaultBtn.type = "button";
  setDefaultBtn.className = "btn";
  setDefaultBtn.textContent = "Use current as default";
  setDefaultBtn.addEventListener("click", () => {
    saveCurrentAsDefaultProfile();
  });

  const loadDefaultBtn = document.createElement("button");
  loadDefaultBtn.type = "button";
  loadDefaultBtn.className = "btn";
  loadDefaultBtn.textContent = "Load default";
  loadDefaultBtn.disabled = !hasDefaultProfile;
  loadDefaultBtn.addEventListener("click", () => {
    loadDefaultProfile("all");
  });

  const clearDefaultBtn = document.createElement("button");
  clearDefaultBtn.type = "button";
  clearDefaultBtn.className = "btn";
  clearDefaultBtn.textContent = "Clear default";
  clearDefaultBtn.disabled = !hasDefaultProfile;
  clearDefaultBtn.addEventListener("click", () => {
    const ok = window.confirm("Clear saved default profile?");
    if (!ok) {
      return;
    }
    clearDefaultProfile();
  });

  defaultProfileRow.append(setDefaultBtn, loadDefaultBtn, clearDefaultBtn);
  elements.settingsContent.append(defaultProfileRow);

  const presets = Array.isArray(state.presets) ? state.presets : [];
  if (!presets.length) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "No saved presets yet.";
    elements.settingsContent.append(hint);
    return;
  }

  const presetSelectRow = createFormRow("Saved presets");
  const presetSelect = document.createElement("select");
  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = `${preset.name} (${new Date(preset.updatedAt).toLocaleString()})`;
    presetSelect.append(option);
  }
  presetSelectRow.append(presetSelect);
  elements.settingsContent.append(presetSelectRow);

  const loadScopeRow = createFormRow("Load scope");
  const loadScopeSelect = document.createElement("select");
  const scopeOptions = [
    { value: "all", label: "Global + Background + Widgets" },
    { value: "global", label: "Global only" },
    { value: "background", label: "Background only" },
    { value: "widgets", label: "Widgets (includes layout)" }
  ];
  for (const opt of scopeOptions) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    loadScopeSelect.append(option);
  }
  loadScopeRow.append(loadScopeSelect);
  elements.settingsContent.append(loadScopeRow);

  const manageRow = document.createElement("div");
  manageRow.className = "preset-actions";

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "btn";
  loadBtn.textContent = "Load";
  loadBtn.addEventListener("click", () => {
    loadPresetById(presetSelect.value, loadScopeSelect.value);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    const ok = window.confirm("Delete selected preset?");
    if (!ok) {
      return;
    }
    deletePresetById(presetSelect.value);
  });

  manageRow.append(loadBtn, deleteBtn);
  elements.settingsContent.append(manageRow);
}

function renderBackgroundSettings() {
  const modeSchema = {
    key: "mode",
    label: "Mode",
    type: "select",
    options: [
      { value: "gradient", label: "Gradient" },
      { value: "solid", label: "Solid color" },
      { value: "wallpaper", label: "Wallpaper rotation" },
      { value: "video", label: "Loop video" }
    ]
  };
  const bg = state.ui.background;
  const bgFields = [modeSchema];

  if (bg.mode === "solid") {
    bgFields.push({ key: "solidColor", label: "Solid color", type: "color" });
  }

  if (bg.mode === "wallpaper") {
    bgFields.push(
        {
          key: "wallpaperProvider",
          label: "Wallpaper source",
          type: "select",
          options: [
            { value: "picsum", label: "Picsum" },
            { value: "unsplash", label: "Unsplash Source" },
            { value: "reddit", label: "Reddit" }
          ]
        },
      { key: "wallpaperTheme", label: "Wallpaper theme", type: "text", placeholder: "nature, city, sea" }
    );

    if (bg.wallpaperProvider === "reddit") {
      bgFields.push(
        { key: "redditSubreddit", label: "Reddit subreddit", type: "text", placeholder: "EarthPorn" },
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
        }
      );
    }

    bgFields.push(
      { key: "rotateMinutes", label: "Rotate every (minutes)", type: "number", min: 1, max: 240, step: 1 },
      { key: "blurAmount", label: "Background blur", type: "number", min: 0, max: 28, step: 1 }
    );
  }

  if (bg.mode === "video") {
    bgFields.push({
      key: "videoSource",
      label: "Video source",
      type: "select",
      options: [
        { value: "manual", label: "Manual URL" },
        { value: "reddit", label: "Reddit loop videos" }
      ]
    });

    if (bg.videoSource === "manual") {
      bgFields.push({
        key: "videoUrl",
        label: "Video URL (mp4/webm)",
        type: "text",
        placeholder: "https://.../loop.mp4"
      });
    } else {
      bgFields.push(
        {
          key: "redditVideoSubreddit",
          label: "Reddit subreddit",
          type: "text",
          placeholder: "loopingvideos"
        },
        {
          key: "redditVideoTime",
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
        }
      );
    }
  }

  bgFields.push({ key: "overlayOpacity", label: "Overlay opacity", type: "number", min: 0, max: 0.85, step: 0.05 });

  for (const schema of bgFields) {
    const row = createFormRow(schema.label);
    const value = state.ui.background[schema.key];
    if (schema.type === "color") {
      row.append(
        createColorControl(value, (next) => {
          patchBackground({ [schema.key]: next });
        })
      );
    } else {
      const input = createInputBySchema(schema, value);
      input.addEventListener(settingsEventName(schema), () => {
        const next = readFieldValue(input, schema);
        patchBackground({ [schema.key]: next });
      });
      row.append(input);
    }
    elements.settingsContent.append(row);
  }
}

function getWidgetModalCommonFields(instance = null) {
  const pageCount = currentLauncherPageCount();
  const allowManualLayout = !isGridLayoutMode() && instance?.type !== "container";
  const baseFields = [
    { key: "title", label: "Title", type: "text", group: "base" },
    {
      key: "page",
      label: "Page",
      type: "number",
      min: 1,
      max: pageCount,
      step: 1,
      group: "base"
    },
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
      key: "surfaceMode",
      label: "Surface mode",
      type: "select",
      group: "base",
      options: [
        { value: "normal", label: "Normal" },
        { value: "transparent", label: "Transparent" }
      ]
    },
    {
      key: "transparentAutoContrast",
      label: "Auto contrast in transparent mode",
      type: "checkbox",
      group: "base"
    },
    {
      key: "transparentGhostStrength",
      label: "Transparent ghost strength (%)",
      type: "number",
      min: 40,
      max: 180,
      step: 5,
      group: "base"
    },
    {
      key: "backdropBlur",
      label: "Blur background",
      type: "checkbox",
      group: "base"
    },
    {
      key: "edgeRoundness",
      label: "Edge roundness",
      type: "number",
      group: "base",
      min: 0,
      max: 40,
      step: 1
    },
    {
      key: "transparency",
      label: "Transparency",
      type: "number",
      group: "base",
      min: 0,
      max: 1,
      step: 0.05
    },
    {
      key: "contentAlignY",
      label: "Content vertical align",
      type: "select",
      group: "base",
      options: [
        { value: "top", label: "Top" },
        { value: "center", label: "Center" },
        { value: "bottom", label: "Bottom" }
      ]
    },
    {
      key: "contentFillParent",
      label: "Fill content to widget",
      type: "checkbox",
      group: "base"
    },
    {
      key: "contentPadding",
      label: "Content padding",
      type: "number",
      min: 0,
      max: 48,
      step: 1,
      group: "base"
    },
    {
      key: "contentFontScale",
      label: "Content font scale",
      type: "number",
      min: 0.5,
      max: 2,
      step: 0.05,
      group: "base"
    },
    {
      key: "widgetThemeMode",
      label: "Widget theme override",
      type: "select",
      group: "base",
      options: [
        { value: "inherit", label: "Inherit global" },
        { value: "light", label: "Force light" },
        { value: "dark", label: "Force dark" }
      ]
    },
    {
      key: "useCustomColors",
      label: "Use custom colors",
      type: "checkbox",
      group: "base"
    },
    { key: "customTextColor", label: "Custom text color", type: "color", group: "base" },
    { key: "customAccentColor", label: "Custom accent color", type: "color", group: "base" },
    { key: "customSurfaceColor", label: "Custom surface color", type: "color", group: "base" },
    ...(allowManualLayout
      ? [
          { key: "x", label: "X", type: "number", group: "layout" },
          { key: "y", label: "Y", type: "number", group: "layout" },
          { key: "w", label: "Width", type: "number", group: "layout" },
          { key: "h", label: "Height", type: "number", group: "layout" }
        ]
      : [])
  ];

  return baseFields;
}

function getWidgetModalSpecificFields(def) {
  const specific = Array.isArray(def.settingsSchema) ? def.settingsSchema : [];
  return specific.map((field) => ({ ...field, group: "config" }));
}

function getWidgetCommonMasterFields() {
  return [
    {
      key: "viewMode",
      label: "Default display mode",
      type: "select",
      options: [
        { value: "window", label: "Window" },
        { value: "headless", label: "Headless" }
      ]
    },
    {
      key: "surfaceMode",
      label: "Default surface mode",
      type: "select",
      options: [
        { value: "normal", label: "Normal" },
        { value: "transparent", label: "Transparent" }
      ]
    },
    { key: "transparentAutoContrast", label: "Default auto contrast in transparent mode", type: "checkbox" },
    {
      key: "transparentGhostStrength",
      label: "Default transparent ghost strength (%)",
      type: "number",
      min: 40,
      max: 180,
      step: 5
    },
    { key: "backdropBlur", label: "Default blur behind widget", type: "checkbox" },
    { key: "edgeRoundness", label: "Default edge roundness", type: "number", min: 0, max: 40, step: 1 },
    { key: "transparency", label: "Default transparency", type: "number", min: 0, max: 1, step: 0.05 },
    {
      key: "contentAlignY",
      label: "Default content vertical align",
      type: "select",
      options: [
        { value: "top", label: "Top" },
        { value: "center", label: "Center" },
        { value: "bottom", label: "Bottom" }
      ]
    },
    { key: "contentFillParent", label: "Default fill content", type: "checkbox" },
    { key: "contentPadding", label: "Default content padding", type: "number", min: 0, max: 48, step: 1 },
    { key: "contentFontScale", label: "Default content font scale", type: "number", min: 0.5, max: 2, step: 0.05 },
    {
      key: "widgetThemeMode",
      label: "Default widget theme override",
      type: "select",
      options: [
        { value: "inherit", label: "Inherit global" },
        { value: "light", label: "Force light" },
        { value: "dark", label: "Force dark" }
      ]
    },
    { key: "useCustomColors", label: "Default use custom colors", type: "checkbox" },
    { key: "customTextColor", label: "Default custom text color", type: "color" },
    { key: "customAccentColor", label: "Default custom accent color", type: "color" },
    { key: "customSurfaceColor", label: "Default custom surface color", type: "color" }
  ];
}

function applyCommonMasterToDraft(draft, instanceType, master) {
  draft.viewMode = master.viewMode === "headless" ? "headless" : "window";
  draft.surfaceMode = normalizeSurfaceMode(master.surfaceMode, "normal");
  draft.transparentAutoContrast = master.transparentAutoContrast !== false;
  draft.transparentGhostStrength = normalizeTransparentGhostStrength(master.transparentGhostStrength, 100);
  draft.backdropBlur = master.backdropBlur !== false;
  draft.edgeRoundness = normalizeEdgeRoundness(master.edgeRoundness, 12);
  draft.transparency = normalizeTransparency(master.transparency, 0.94);
  draft.contentAlignY = instanceType === "aiChat" ? "top" : normalizeAlign(master.contentAlignY, defaultWidgetContentAlign(instanceType));
  draft.contentFillParent = instanceType === "aiChat" ? true : Boolean(master.contentFillParent);
  const padding = normalizeContentPadding(master.contentPadding, widgetPaddingFallback(instanceType));
  draft.contentPadding = padding;
  draft.contentPaddingTop = padding;
  draft.contentPaddingRight = padding;
  draft.contentPaddingBottom = padding;
  draft.contentPaddingLeft = padding;
  draft.contentPaddingTopRight = padding;
  draft.contentPaddingBottomLeft = padding;
  draft.contentFontScale = normalizeWidgetContentFontScale(master.contentFontScale, 1);
  draft.widgetThemeMode = normalizeWidgetThemeMode(master.widgetThemeMode, "inherit");
  draft.useCustomColors = Boolean(master.useCustomColors);
  draft.customTextColor = normalizeWidgetColor(master.customTextColor, "#1F2226");
  draft.customAccentColor = normalizeWidgetColor(master.customAccentColor, "#1F4F9F");
  draft.customSurfaceColor = normalizeWidgetColor(master.customSurfaceColor, "#FFFAF2");
}

function resetWidgetTabDraftToDefaults(def) {
  if (!modalState.draft) {
    return;
  }
  modalState.draft.config = structuredClone(def.defaultConfig || {});
}

function resetCommonTabDraftToGlobal(instance, def) {
  if (!modalState.draft) {
    return;
  }
  const master = normalizeWidgetCommonMaster(state.ui.widgetCommonMaster);
  const draft = modalState.draft;
  draft.title = def.title;
  draft.layout = cloneLayout(def.defaultLayout);
  applyCommonMasterToDraft(draft, instance.type, master);
}

function setWidgetModalActiveTab(tab) {
  const next = tab === "common" ? "common" : "widget";
  modalState.activeTab = next;
  renderWidgetModal();
}

function renderWidgetModalFields(fields) {
  const frag = document.createDocumentFragment();
  const current = modalState.widgetId ? instanceById(modalState.widgetId) : null;
  for (const field of fields) {
    if (current?.type === "aiChat" && (field.key === "contentFillParent" || field.key === "contentAlignY")) {
      continue;
    }

    if (
      !modalState?.draft?.useCustomColors &&
      (field.key === "customTextColor" || field.key === "customAccentColor" || field.key === "customSurfaceColor")
    ) {
      continue;
    }

    const row = createFormRow(field.label, field.helpText || "");
    if (isThemeFieldKey(field.key)) {
      row.classList.add("theme-row");
    }

    if (field.type === "shortcut-icon-editor") {
      const actionWrap = document.createElement("div");
      actionWrap.className = "shortcut-icon-editor-inline-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn";
      editBtn.textContent = "Edit icon";
      editBtn.addEventListener("click", () => {
        const current = normalizeText(modalState?.draft?.config?.icon);
        openShortcutIconEditor(current, (nextDataUrl) => {
          if (!modalState.draft) {
            return;
          }
          setModalFieldValue({ group: "config", key: "icon" }, nextDataUrl);
          renderWidgetModal();
        });
      });

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "btn";
      clearBtn.textContent = "Remove custom icon";
      clearBtn.addEventListener("click", () => {
        setModalFieldValue({ group: "config", key: "icon" }, "");
        renderWidgetModal();
      });

      actionWrap.append(editBtn, clearBtn);
      row.append(actionWrap);
      frag.append(row);
      continue;
    }

    const input = createInputBySchema(field, modalFieldValue(field));
    input.addEventListener(settingsEventName(field), () => {
      setModalFieldValue(field, readFieldValue(input, field));
      if (field.key === "useCustomColors") {
        renderWidgetModal();
      }
    });
    row.append(input);
    frag.append(row);
  }
  return frag;
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
    if (field.key === "contentPadding") {
      const fallback = normalizeContentPadding(draft.contentPadding, 10);
      const top = normalizeContentPadding(draft.contentPaddingTop, fallback);
      const right = normalizeContentPadding(draft.contentPaddingRight, fallback);
      const bottom = normalizeContentPadding(draft.contentPaddingBottom, fallback);
      const left = normalizeContentPadding(draft.contentPaddingLeft, fallback);
      return normalizeContentPadding((top + right + bottom + left) / 4, fallback);
    }
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
    if (field.key === "contentPadding") {
      const current = modalState.widgetId ? instanceById(modalState.widgetId) : null;
      const fallback = widgetPaddingFallback(current?.type);
      const padding = normalizeContentPadding(value, fallback);
      draft.contentPadding = padding;
      draft.contentPaddingTop = padding;
      draft.contentPaddingRight = padding;
      draft.contentPaddingBottom = padding;
      draft.contentPaddingLeft = padding;
      draft.contentPaddingTopRight = padding;
      draft.contentPaddingBottomLeft = padding;
      return;
    }
    draft[field.key] = value;
    return;
  }
  draft.config[field.key] = value;
}

function closeWidgetModal(rerender = true) {
  if (shortcutIconEditorState.open) {
    closeShortcutIconEditor();
  }

  modalState.open = false;
  modalState.widgetId = "";
  modalState.draft = null;
  modalState.dismissPointerId = null;
  modalState.dismissMoved = false;
  modalState.dismissStartedOnOverlay = false;
  modalState.activeTab = "widget";

  setModalInteractionLock(false);
  elements.widgetModalOverlay?.classList.remove("open");
  elements.widgetModalOverlay?.setAttribute("aria-hidden", "true");
  elements.widgetModalTabs?.replaceChildren();
  if (elements.widgetModalTabs) {
    elements.widgetModalTabs.style.display = "none";
  }
  elements.widgetModalBody?.replaceChildren();
  if (elements.widgetModalDefaultBtn) {
    elements.widgetModalDefaultBtn.onclick = null;
  }

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
  if (elements.widgetModalTabs) {
    elements.widgetModalTabs.replaceChildren();
    elements.widgetModalTabs.style.display = "none";
  }
  elements.widgetModalBody.replaceChildren();

  const commonFields = getWidgetModalCommonFields(instance);
  const widgetFields = getWidgetModalSpecificFields(def);
  const hasWidgetTab = widgetFields.length > 0;
  const active = hasWidgetTab ? (modalState.activeTab === "common" ? "common" : "widget") : "common";
  modalState.activeTab = active;

  if (hasWidgetTab) {
    const tablist = elements.widgetModalTabs;
    if (tablist) {
      tablist.style.display = "flex";

      const widgetBtn = document.createElement("button");
      widgetBtn.type = "button";
      widgetBtn.className = "settings-tab-btn";
      widgetBtn.setAttribute("role", "tab");
      widgetBtn.id = "widgetModalTabWidget";
      widgetBtn.setAttribute("aria-controls", "widgetModalTabPanelWidget");
      widgetBtn.textContent = "Widget";

      const commonBtn = document.createElement("button");
      commonBtn.type = "button";
      commonBtn.className = "settings-tab-btn";
      commonBtn.setAttribute("role", "tab");
      commonBtn.id = "widgetModalTabCommon";
      commonBtn.setAttribute("aria-controls", "widgetModalTabPanelCommon");
      commonBtn.textContent = "Common";

      const widgetOn = active === "widget";
      widgetBtn.classList.toggle("active", widgetOn);
      widgetBtn.setAttribute("aria-selected", String(widgetOn));
      commonBtn.classList.toggle("active", !widgetOn);
      commonBtn.setAttribute("aria-selected", String(!widgetOn));

      widgetBtn.addEventListener("click", () => {
        setWidgetModalActiveTab("widget");
      });
      commonBtn.addEventListener("click", () => {
        setWidgetModalActiveTab("common");
      });

      tablist.append(widgetBtn, commonBtn);
    }
  }

  const activeFields = active === "widget" ? widgetFields : commonFields;
  const panel = document.createElement("section");
  panel.setAttribute("role", "tabpanel");
  if (hasWidgetTab) {
    const isWidget = active === "widget";
    panel.id = isWidget ? "widgetModalTabPanelWidget" : "widgetModalTabPanelCommon";
    panel.setAttribute("aria-labelledby", isWidget ? "widgetModalTabWidget" : "widgetModalTabCommon");
  }
  panel.append(renderWidgetModalFields(activeFields));
  elements.widgetModalBody.append(panel);

  if (elements.widgetModalDefaultBtn) {
    elements.widgetModalDefaultBtn.textContent = "Reset to default";
    elements.widgetModalDefaultBtn.title = active === "widget" ? "Reset widget tab to defaults" : "Reset common tab to global defaults";
    elements.widgetModalDefaultBtn.onclick = () => {
      if (active === "widget") {
        resetWidgetTabDraftToDefaults(def);
      } else {
        resetCommonTabDraftToGlobal(instance, def);
      }
      renderWidgetModal();
    };
  }

  elements.widgetModalOverlay.classList.add("open");
  elements.widgetModalOverlay.setAttribute("aria-hidden", "false");
  setModalInteractionLock(true);

  const firstInput = elements.widgetModalBody.querySelector("input, textarea, select, button");
  if (firstInput instanceof HTMLElement) {
    firstInput.focus();
  }
}

function openWidgetModal(instanceId) {
  const instance = instanceById(instanceId);
  if (!instance) {
    return;
  }

  const padding = resolveWidgetPadding(instance);

  modalState.open = true;
  modalState.widgetId = instance.id;
  modalState.activeTab = "widget";
  modalState.draft = {
    title: instance.title,
    page: normalizeWidgetPage(instance.page, currentLauncherPageCount(), 0) + 1,
    viewMode: instance.viewMode || "window",
    surfaceMode: normalizeSurfaceMode(instance.surfaceMode, "normal"),
    transparentAutoContrast: instance.transparentAutoContrast !== false,
    transparentGhostStrength: normalizeTransparentGhostStrength(instance.transparentGhostStrength, 100),
    backdropBlur: instance.backdropBlur !== false,
    edgeRoundness: normalizeEdgeRoundness(instance.edgeRoundness, 12),
    transparency: normalizeTransparency(instance.transparency, 0.94),
    contentAlignY:
      instance.type === "aiChat"
        ? "top"
        : normalizeAlign(instance.contentAlignY, defaultWidgetContentAlign(instance.type)),
    contentFillParent: Boolean(instance.contentFillParent),
    contentPadding: normalizeContentPadding((padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform),
    contentPaddingTop: padding.top,
    contentPaddingRight: padding.right,
    contentPaddingBottom: padding.bottom,
    contentPaddingLeft: padding.left,
    contentPaddingTopRight: normalizeContentPadding((padding.top + padding.right) / 2, padding.uniform),
    contentPaddingBottomLeft: normalizeContentPadding((padding.bottom + padding.left) / 2, padding.uniform),
    contentFontScale: normalizeWidgetContentFontScale(instance.contentFontScale, 1),
    widgetThemeMode: normalizeWidgetThemeMode(instance.widgetThemeMode, "inherit"),
    useCustomColors: Boolean(instance.useCustomColors),
    customTextColor: normalizeWidgetColor(instance.customTextColor, "#1F2226"),
    customAccentColor: normalizeWidgetColor(instance.customAccentColor, "#1F4F9F"),
    customSurfaceColor: normalizeWidgetColor(instance.customSurfaceColor, "#FFFAF2"),
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
  const previousPage = normalizeWidgetPage(instance.page, currentLauncherPageCount(), 0);

  recordHistorySnapshot("Apply widget settings");

  instance.title = normalizeText(draft.title, def.title);
  instance.viewMode = draft.viewMode === "headless" ? "headless" : "window";
  instance.surfaceMode = normalizeSurfaceMode(draft.surfaceMode, "normal");
  instance.transparentAutoContrast = draft.transparentAutoContrast !== false;
  instance.transparentGhostStrength = normalizeTransparentGhostStrength(draft.transparentGhostStrength, 100);
  instance.backdropBlur = draft.backdropBlur !== false;
  instance.edgeRoundness = normalizeEdgeRoundness(draft.edgeRoundness, 12);
  instance.transparency = normalizeTransparency(draft.transparency, 0.94);
  instance.contentAlignY =
    instance.type === "aiChat"
      ? "top"
      : normalizeAlign(draft.contentAlignY, defaultWidgetContentAlign(instance.type));
  instance.contentFillParent = instance.type === "aiChat" ? true : Boolean(draft.contentFillParent);
  const paddingFallback = widgetPaddingFallback(instance.type);
  const uniformPadding = normalizeContentPadding(draft.contentPadding, paddingFallback);
  const topPadding = normalizeContentPadding(draft.contentPaddingTop ?? draft.contentPaddingTopRight ?? uniformPadding, uniformPadding);
  const rightPadding = normalizeContentPadding(draft.contentPaddingRight ?? draft.contentPaddingTopRight ?? uniformPadding, uniformPadding);
  const bottomPadding = normalizeContentPadding(draft.contentPaddingBottom ?? draft.contentPaddingBottomLeft ?? uniformPadding, uniformPadding);
  const leftPadding = normalizeContentPadding(draft.contentPaddingLeft ?? draft.contentPaddingBottomLeft ?? uniformPadding, uniformPadding);
  instance.contentPaddingTop = topPadding;
  instance.contentPaddingRight = rightPadding;
  instance.contentPaddingBottom = bottomPadding;
  instance.contentPaddingLeft = leftPadding;
  instance.contentPaddingTopRight = normalizeContentPadding((topPadding + rightPadding) / 2, uniformPadding);
  instance.contentPaddingBottomLeft = normalizeContentPadding((bottomPadding + leftPadding) / 2, uniformPadding);
  instance.contentPadding = normalizeContentPadding((topPadding + rightPadding + bottomPadding + leftPadding) / 4, uniformPadding);
  instance.contentFontScale = normalizeWidgetContentFontScale(draft.contentFontScale, 1);
  instance.widgetThemeMode = normalizeWidgetThemeMode(draft.widgetThemeMode, "inherit");
  instance.useCustomColors = Boolean(draft.useCustomColors);
  instance.customTextColor = normalizeWidgetColor(draft.customTextColor, "#1F2226");
  instance.customAccentColor = normalizeWidgetColor(draft.customAccentColor, "#1F4F9F");
  instance.customSurfaceColor = normalizeWidgetColor(draft.customSurfaceColor, "#FFFAF2");
  instance.page = normalizeWidgetPage((Number(draft.page) || 1) - 1, currentLauncherPageCount(), previousPage);
  instance.layout = cloneLayout(draft.layout);
  instance.config = {
    ...instance.config,
    ...draft.config
  };

  if (instance.type === "container") {
    instance.config.expanded = instance.config.expanded === true;
    instance.config.expandedCols = normalizeContainerExpandedCols(instance.config.expandedCols, 4);
    instance.config.expandedRows = normalizeContainerExpandedRows(instance.config.expandedRows, 3);
    delete instance.config.expandedWidth;
    delete instance.config.expandedHeight;
    if (instance.gridLayout && typeof instance.gridLayout === "object") {
      instance.gridLayout.colSpan = 1;
      instance.gridLayout.rowSpan = 1;
    }
    enforceContainerWidgetSize(instance);
  }

  instance.commonOverrides = inferCommonOverrides(instance, state.ui.widgetCommonMaster);
  syncLauncherPagingState({ expandToFitInstances: true });
  if (instance.page !== previousPage) {
    state.ui.home.activePage = instance.page;
  }

  const rt = runtime.get(instance.id);
  if (rt) {
    const titleEl = rt.card.querySelector(".widget-title");
    if (titleEl) {
      titleEl.textContent = instance.title || def.title;
    }
    applyLayout(rt.card, instance.layout, instance.page);
    applyCardVisual(rt.card, instance);
    rt.controller?.refresh?.();
  } else if (isWidgetInContainer(instance)) {
    refreshWidgetsByType("container");
  }

  updateBoardBounds();
  queueSave();
  closeWidgetModal(true);
}

function renderSettings() {
  elements.settingsContent.replaceChildren();
  syncSettingsTabButtons();
  syncSettingsPanelVisibility();

  if (state.mode !== "edit") {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Use Mode에서는 설정 편집이 잠깁니다. 우측 상단의 톱니 버튼으로 Edit Mode로 전환하세요.";
    elements.settingsContent.append(p);
    return;
  }

  if (state.ui.activeTab === "background") {
    renderBackgroundSettings();
    return;
  }

  if (state.ui.activeTab === "profile") {
    renderProfileSettings();
    return;
  }

  renderGlobalSettings();
}

function addWidget(type, options = {}) {
  if (state.mode !== "edit") {
    return;
  }

  const def = widgetRegistry[type];
  if (!def) {
    return;
  }

  recordHistorySnapshot("Add widget");

  syncLauncherPagingState({ expandToFitInstances: true });
  const targetPage = currentLauncherActivePage();
  const pageLocalIndex = state.instances.filter((instance) => {
    return (
      !isWidgetDocked(instance) &&
      !isWidgetInContainer(instance) &&
      normalizeWidgetPage(instance.page, state.ui.home.pageCount, 0) === targetPage
    );
  }).length;

  const defaultSize = widgetDefaultGridSize(type, def);
  const requestedColSpan = normalizeGridSpanValue(options.colSpan, defaultSize.colSpan, GRID_MAX_COLUMNS);
  const requestedRowSpan = normalizeGridSpanValue(options.rowSpan, defaultSize.rowSpan, GRID_MAX_ROW_SPAN);
  const colSpan = type === "container" ? 1 : requestedColSpan;
  const rowSpan = type === "container" ? 1 : requestedRowSpan;
  const defaultPadding = widgetPaddingFallback(type);

  const instance = {
    id: `${type}-${state.nextId}`,
    type,
    title: normalizeText(options.title, def.title),
    zIndex: zCounter + 1,
    viewMode: isHeadlessTransparentDefaultType(type) ? "headless" : "window",
    surfaceMode: isHeadlessTransparentDefaultType(type) ? "transparent" : "normal",
    transparentAutoContrast: true,
    transparentGhostStrength: 100,
    backdropBlur: defaultWidgetBackdropBlur(type),
    edgeRoundness: 12,
    transparency: 0.94,
    contentAlignY: defaultWidgetContentAlign(type),
    contentFillParent: type === "aiChat",
    contentPadding: defaultPadding,
    contentPaddingTop: defaultPadding,
    contentPaddingRight: defaultPadding,
    contentPaddingBottom: defaultPadding,
    contentPaddingLeft: defaultPadding,
    contentPaddingTopRight: defaultPadding,
    contentPaddingBottomLeft: defaultPadding,
    contentFontScale: 1,
    widgetThemeMode: "inherit",
    useCustomColors: false,
    customTextColor: "#1F2226",
    customAccentColor: "#1F4F9F",
    customSurfaceColor: "#FFFAF2",
    commonOverrides: normalizeCommonOverrides({}),
    page: targetPage,
    dockOrder: null,
    containerId: "",
    enabled: true,
    config: structuredClone(def.defaultConfig || {}),
    gridLayout: normalizeGridLayout(null, {
      col: pageLocalIndex % 4,
      row: Math.floor(pageLocalIndex / 4),
      colSpan,
      rowSpan
    }),
    layout: cloneLayout(def.defaultLayout)
  };

  instance.commonOverrides = inferCommonOverrides(instance, state.ui.widgetCommonMaster);
  applyWidgetCommonMaster(instance, state.ui.widgetCommonMaster, false);

  state.nextId += 1;
  zCounter = instance.zIndex;

  if (!isGridLayoutMode()) {
    instance.layout.x += (pageLocalIndex % 6) * 24;
    instance.layout.y += (pageLocalIndex % 4) * 24;
    const boardRect = elements.board.getBoundingClientRect();
    const scaleX = colSpan / Math.max(1, defaultSize.colSpan);
    const scaleY = rowSpan / Math.max(1, defaultSize.rowSpan);
    instance.layout.w = clamp(Math.round(instance.layout.w * scaleX), 80, Math.max(80, Math.floor(boardRect.width)));
    instance.layout.h = clamp(Math.round(instance.layout.h * scaleY), 80, Math.max(80, Math.floor(boardRect.height)));
  }

  if (type === "container") {
    enforceContainerWidgetSize(instance);
  }

  state.instances.push(instance);
  createWidgetCard(instance);

  if (isGridLayoutMode()) {
    applyGridLayout({ commitFreeLayout: false, shouldSave: false });
  }

  setSelected(instance.id);
  updateBoardBounds();
  queueSave();
}

function resetState() {
  recordHistorySnapshot("Reset state");
  const resetMutationClock = readUserMutationClock(state);
  const keptPresets = Array.isArray(state?.presets) ? state.presets : [];
  const keptDefaultProfileSnapshot =
    state?.ui?.defaultProfileSnapshot && typeof state.ui.defaultProfileSnapshot === "object"
      ? clonePresetSnapshot(state.ui.defaultProfileSnapshot)
      : null;
  const keptDefaultProfileUpdatedAt = Math.max(0, Number(state?.ui?.defaultProfileUpdatedAt) || 0);
  state = defaultState();
  state.meta.lastUserMutationAt = resetMutationClock;
  state.presets = keptPresets;

  if (keptDefaultProfileSnapshot) {
    state.ui.defaultProfileSnapshot = keptDefaultProfileSnapshot;
    state.ui.defaultProfileUpdatedAt = keptDefaultProfileUpdatedAt;
    applyProfileSnapshot(keptDefaultProfileSnapshot, "all");
    return;
  }

  applyTheme();
  applyBackground();
  renderBoard();
  queueSave();
}

function isInteractiveSwipeTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest("[data-no-page-swipe], [data-no-page-drag], [data-page-swipe-lock]")) {
    return true;
  }

  const interactiveSelector = [
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "option",
    "label",
    "summary",
    "details",
    "[contenteditable]",
    "[draggable='true']",
    "[role='button']",
    "[role='link']",
    "[role='textbox']",
    "[role='menuitem']",
    "[role='option']",
    "[role='checkbox']",
    "[role='switch']",
    ".widget-head",
    ".widget-drag-btn",
    ".widget-resize-handle",
    ".widget-padding-handle",
    ".widget-select-btn",
    ".widget-remove-btn",
    ".widget-float-select",
    ".widget-float-remove",
    ".widget-refresh-btn",
    ".widget-open-btn",
    ".widget-auth-toggle-btn",
    ".widget-float-refresh",
    ".widget-float-open",
    ".widget-float-auth-toggle",
    ".shortcut-tile",
    ".ai-chat-widget"
  ].join(",");

  return Boolean(target.closest(interactiveSelector));
}

function canStartBoardSwipeFromTarget(target) {
  if (!(target instanceof Element)) {
    return true;
  }

  const blockedZones = [
    "#settingsPanel",
    "#settingsPanelBackdrop",
    ".settings-panel",
    ".settings-panel-backdrop",
    ".widget-modal-overlay",
    ".corner-controls",
    ".add-widget-fab",
    ".page-indicator",
    ".edit-dock",
    ".persistent-dock"
  ].join(",");

  if (target.closest(blockedZones)) {
    return false;
  }

  return !isInteractiveSwipeTarget(target);
}

function isTextEditableTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  const editableSelector = [
    "input",
    "textarea",
    "select",
    "option",
    "[contenteditable='true']",
    "[contenteditable='plaintext-only']",
    "[contenteditable='']",
    "[contenteditable]:not([contenteditable='false'])"
  ].join(",");

  return Boolean(target.closest(editableSelector));
}

function beginBoardSwipe(event) {
  if (!elements.board || !state?.ui?.home) {
    return;
  }
  if (widgetLongPressState.pending) {
    return;
  }
  if (boardSwipeState.active) {
    return;
  }
  if (Number.isFinite(event.button) && event.button !== 0) {
    return;
  }
  if (!canStartBoardSwipeFromTarget(event.target)) {
    return;
  }
  if (modalState.open || addWidgetModalOpen || shortcutIconEditorState.open || dockSettingsModalOpen) {
    return;
  }
  if (state.mode === "edit" && state.ui.settingsOpen) {
    return;
  }

  const captureHost =
    event.currentTarget instanceof Element ? event.currentTarget : elements.workspace || elements.board;

  boardSwipeState.active = true;
  boardSwipeState.pointerId = event.pointerId;
  boardSwipeState.captureTarget = captureHost;
  boardSwipeState.startX = event.clientX;
  boardSwipeState.startY = event.clientY;
  boardSwipeState.startAt = performance.now();
  boardSwipeState.dragOffsetX = 0;
  boardSwipeState.dragging = false;
  captureHost?.setPointerCapture?.(event.pointerId);
}

function moveBoardSwipe(event) {
  if (!boardSwipeState.active || boardSwipeState.pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - boardSwipeState.startX;
  const dy = event.clientY - boardSwipeState.startY;

  if (!boardSwipeState.dragging) {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < 3) {
      return;
    }
    if (absX < absY * 0.55) {
      endBoardSwipe(event, { cancelled: true });
      return;
    }
    boardSwipeState.dragging = true;
  }

  boardSwipeState.dragOffsetX = dx;
  renderBoardViewport({ dragOffsetX: dx, animate: false, dragging: true });
  event.preventDefault();
}

function endBoardSwipe(event, { cancelled = false } = {}) {
  if (!boardSwipeState.active || boardSwipeState.pointerId !== event.pointerId) {
    return;
  }

  const dx = event.clientX - boardSwipeState.startX;
  const elapsed = Math.max(1, performance.now() - boardSwipeState.startAt);
  const velocity = dx / elapsed;
  const didDrag = boardSwipeState.dragging;

  boardSwipeState.active = false;
  boardSwipeState.pointerId = null;
  const captureHost = boardSwipeState.captureTarget;
  boardSwipeState.captureTarget = null;
  boardSwipeState.startX = 0;
  boardSwipeState.startY = 0;
  boardSwipeState.startAt = 0;
  boardSwipeState.dragOffsetX = 0;
  boardSwipeState.dragging = false;
  captureHost?.releasePointerCapture?.(event.pointerId);

  if (cancelled || !didDrag) {
    renderBoardViewport({ dragOffsetX: 0, animate: true, dragging: false });
    return;
  }

  const activePage = currentLauncherActivePage();
  const threshold = Math.max(34, Math.min(130, Math.round((elements.board?.clientWidth || 1) * 0.14)));
  let nextPage = activePage;

  if (dx <= -threshold || velocity <= -0.42) {
    nextPage = activePage + 1;
  } else if (dx >= threshold || velocity >= 0.42) {
    nextPage = activePage - 1;
  }

  setActiveLauncherPage(nextPage, { shouldSave: true, animate: true });
  lastDragEndAt = Date.now();
}

function wireEvents() {
  if (elements.editDock) {
    requestAnimationFrame(() => {
      applyEditDockPosition(window.innerWidth / 2 - 170, 10);
    });
  }

  elements.editDockGrip?.addEventListener("pointerdown", (event) => {
    if (!elements.editDock) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = elements.editDock.getBoundingClientRect();
    dockDragState.active = true;
    dockDragState.pointerId = event.pointerId;
    dockDragState.startX = event.clientX;
    dockDragState.startY = event.clientY;
    dockDragState.startLeft = rect.left;
    dockDragState.startTop = rect.top;
    elements.editDock.classList.add("is-dragging");
    elements.editDockGrip.setPointerCapture?.(event.pointerId);
  });

  window.addEventListener("pointermove", (event) => {
    if (!dockDragState.active || event.pointerId !== dockDragState.pointerId) {
      return;
    }
    const nextLeft = dockDragState.startLeft + (event.clientX - dockDragState.startX);
    const nextTop = dockDragState.startTop + (event.clientY - dockDragState.startY);
    applyEditDockPosition(nextLeft, nextTop);
  });

  window.addEventListener("pointerup", (event) => {
    if (!dockDragState.active || event.pointerId !== dockDragState.pointerId) {
      return;
    }
    dockDragState.active = false;
    dockDragState.pointerId = null;
    elements.editDock?.classList.remove("is-dragging");
  });

  window.addEventListener("pointercancel", (event) => {
    if (!dockDragState.active || event.pointerId !== dockDragState.pointerId) {
      return;
    }
    dockDragState.active = false;
    dockDragState.pointerId = null;
    elements.editDock?.classList.remove("is-dragging");
  });

  elements.workspace?.addEventListener("pointerdown", (event) => {
    beginBoardSwipe(event);
  });

  window.addEventListener("pointermove", (event) => {
    moveBoardSwipe(event);
  });

  window.addEventListener("pointerup", (event) => {
    endBoardSwipe(event, { cancelled: false });
  });

  window.addEventListener("pointercancel", (event) => {
    endBoardSwipe(event, { cancelled: true });
  });

  elements.settingsRailToggleBtn?.addEventListener("click", () => {
    if (state.mode !== "edit") {
      return;
    }
    state.ui.settingsOpen = !state.ui.settingsOpen;
    syncSettingsPanelVisibility();
    queueSave();
  });

  elements.settingsPanelBackdrop?.addEventListener("click", () => {
    if (!state.ui.settingsOpen) {
      return;
    }
    state.ui.settingsOpen = false;
    syncSettingsPanelVisibility();
    queueSave();
  });

  elements.bgRefreshBtn?.addEventListener("click", () => {
    refreshBackgroundNow();
  });

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

  elements.dockPrevBtn?.addEventListener("click", () => {
    setActiveLauncherPage(currentLauncherActivePage() - 1, { shouldSave: true, animate: true });
  });

  elements.dockNextBtn?.addEventListener("click", () => {
    setActiveLauncherPage(currentLauncherActivePage() + 1, { shouldSave: true, animate: true });
  });

  elements.dockSettingsBtn?.addEventListener("click", () => {
    if (dockSettingsModalOpen) {
      closeDockSettingsModal(false);
      return;
    }
    openDockSettingsModal();
  });

  elements.dockWidgetStrip?.addEventListener("keydown", onDockStripKeyDown);
  elements.dockWidgetStrip?.addEventListener("wheel", onDockStripWheel, { passive: false });
  elements.dockWidgetStrip?.addEventListener("scroll", () => {
    syncDockOverflowState();
  }, { passive: true });

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

  elements.tabProfileBtn?.addEventListener("click", () => {
    state.ui.activeTab = "profile";
    renderSettings();
    queueSave();
  });

  elements.widgetTypeSelect?.addEventListener("change", () => {
    if (!addWidgetModalOpen) {
      return;
    }
    syncAddWidgetSizeInputs();
  });

  elements.addWidgetBtn.addEventListener("click", () => {
    openAddWidgetModal();
  });

  elements.addWidgetModalCloseBtn?.addEventListener("click", () => {
    closeAddWidgetModal();
  });

  elements.addWidgetModalCancelBtn?.addEventListener("click", () => {
    closeAddWidgetModal();
  });

  elements.addWidgetModalOkBtn?.addEventListener("click", () => {
    applyAddWidgetModal();
  });

  elements.addWidgetModalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.addWidgetModalOverlay) {
      closeAddWidgetModal();
    }
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

  elements.undoBtn?.addEventListener("click", () => {
    undoLastChange();
  });

  elements.redoBtn?.addEventListener("click", () => {
    redoLastChange();
  });

  window.addEventListener("resize", () => {
    if (elements.editDock?.classList.contains("is-positioned")) {
      const left = Number.parseFloat(elements.editDock.style.left) || 0;
      const top = Number.parseFloat(elements.editDock.style.top) || 0;
      applyEditDockPosition(left, top);
    }
    updateBoardBounds();
    syncPersistentDock();
  });

  elements.widgetModalCloseBtn?.addEventListener("click", () => {
    closeWidgetModal(false);
  });

  elements.dockSettingsModalCloseBtn?.addEventListener("click", () => {
    closeDockSettingsModal(false);
  });

  elements.dockSettingsModalCancelBtn?.addEventListener("click", () => {
    closeDockSettingsModal(false);
  });

  elements.dockSettingsModalOkBtn?.addEventListener("click", () => {
    applyDockSettingsModal();
  });

  elements.dockSettingsModalDefaultBtn?.addEventListener("click", () => {
    resetDockSettingsDraftToDefault();
  });

  elements.dockSettingsModalOverlay?.addEventListener("click", (event) => {
    if (event.target === elements.dockSettingsModalOverlay) {
      closeDockSettingsModal(false);
    }
  });

  elements.widgetModalCancelBtn?.addEventListener("click", () => {
    closeWidgetModal(false);
  });

  elements.widgetModalOkBtn?.addEventListener("click", () => {
    applyWidgetModal();
  });

  elements.shortcutIconEditorCloseBtn?.addEventListener("click", () => {
    closeShortcutIconEditor();
  });

  elements.shortcutIconEditorCancelBtn?.addEventListener("click", () => {
    closeShortcutIconEditor();
  });

  elements.shortcutIconEditorApplyBtn?.addEventListener("click", () => {
    applyShortcutIconEditor();
  });

  elements.shortcutIconEditorClearBtn?.addEventListener("click", () => {
    resetShortcutIconEditorSource();
  });

  elements.shortcutIconEditorShape?.addEventListener("change", () => {
    shortcutEditorRefreshPreview();
  });

  elements.shortcutIconEditorScale?.addEventListener("input", () => {
    shortcutEditorRefreshPreview();
  });

  elements.shortcutIconEditorText?.addEventListener("input", () => {
    shortcutIconEditorState.source = normalizeText(elements.shortcutIconEditorText?.value) ? "text" : "preset";
    shortcutEditorRefreshPreview();
  });

  elements.shortcutIconEditorFontSize?.addEventListener("input", () => {
    if (normalizeText(elements.shortcutIconEditorText?.value)) {
      shortcutIconEditorState.source = "text";
    }
    shortcutEditorRefreshPreview();
  });

  elements.shortcutIconEditorImportBtn?.addEventListener("click", () => {
    elements.shortcutIconEditorFile?.click();
  });

  elements.shortcutIconEditorFile?.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) {
      return;
    }
    loadImageIntoShortcutEditor(input.files[0]);
    input.value = "";
  });

  elements.shortcutIconEditorOverlay?.addEventListener("pointerdown", (event) => {
    if (event.target === elements.shortcutIconEditorOverlay) {
      closeShortcutIconEditor();
    }
  });

  elements.widgetModalOverlay?.addEventListener("pointerdown", (event) => {
    modalState.dismissPointerId = event.pointerId;
    modalState.dismissStartX = event.clientX;
    modalState.dismissStartY = event.clientY;
    modalState.dismissMoved = false;
    modalState.dismissStartedOnOverlay = event.target === elements.widgetModalOverlay;
  });

  elements.widgetModalOverlay?.addEventListener("pointermove", (event) => {
    if (event.pointerId !== modalState.dismissPointerId) {
      return;
    }
    const dx = event.clientX - modalState.dismissStartX;
    const dy = event.clientY - modalState.dismissStartY;
    if (Math.hypot(dx, dy) > 7) {
      modalState.dismissMoved = true;
    }
  });

  elements.widgetModalOverlay?.addEventListener("pointerup", (event) => {
    if (event.pointerId !== modalState.dismissPointerId) {
      return;
    }

    const endedOnOverlay = event.target === elements.widgetModalOverlay;
    const enoughTimeSinceDrag = Date.now() - lastDragEndAt > 240;
    const shouldClose =
      modalState.dismissStartedOnOverlay && endedOnOverlay && !modalState.dismissMoved && enoughTimeSinceDrag;

    modalState.dismissPointerId = null;
    modalState.dismissMoved = false;
    modalState.dismissStartedOnOverlay = false;

    if (shouldClose) {
      closeWidgetModal(false);
    }
  });

  elements.widgetModalOverlay?.addEventListener("pointercancel", () => {
    modalState.dismissPointerId = null;
    modalState.dismissMoved = false;
    modalState.dismissStartedOnOverlay = false;
  });

  document.addEventListener("pointerdown", blockOutsideModalEvent, true);
  document.addEventListener("wheel", blockOutsideModalEvent, { capture: true, passive: false });
  document.addEventListener("touchmove", blockOutsideModalEvent, { capture: true, passive: false });
  document.addEventListener(
    "dragstart",
    (event) => {
      if (isTextEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
    },
    true
  );
  document.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
    },
    true
  );
  document.addEventListener(
    "selectstart",
    (event) => {
      if (isTextEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
    },
    true
  );
  document.addEventListener(
    "dblclick",
    (event) => {
      if (isTextEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
    },
    true
  );

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const withMod = event.ctrlKey || event.metaKey;
    const isTypingTarget = isTextEditableTarget(event.target);
    const isUndo = withMod && !event.altKey && !event.shiftKey && key === "z";
    const isRedo = withMod && !event.altKey && (key === "y" || (event.shiftKey && key === "z"));

    if ((isUndo || isRedo) && !isTypingTarget) {
      event.preventDefault();
      if (isUndo) {
        undoLastChange();
      } else {
        redoLastChange();
      }
      return;
    }

    if (addWidgetModalOpen) {
      if (!isInsideAddWidgetModalOverlay(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeAddWidgetModal();
        return;
      }

      if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        applyAddWidgetModal();
        return;
      }
    }

    if (dockSettingsModalOpen) {
      if (!isInsideDockSettingsModalOverlay(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeDockSettingsModal(false);
        return;
      }

      if (
        event.key === "Enter" &&
        (event.target instanceof HTMLSelectElement ||
          (event.target instanceof HTMLInputElement && event.target.type !== "checkbox"))
      ) {
        event.preventDefault();
        applyDockSettingsModal();
        return;
      }

      return;
    }

    if (!modalState.open) {
      if (shortcutIconEditorState.open && event.key === "Escape") {
        event.preventDefault();
        closeShortcutIconEditor();
      }
      return;
    }

    if (shortcutIconEditorState.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeShortcutIconEditor();
      }
      return;
    }

    if (!isInsideModalOverlay(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeWidgetModal(false);
      return;
    }

    if (event.key === "Tab") {
      const focusable = elements.widgetModalOverlay?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || !focusable.length) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        if (last instanceof HTMLElement) {
          last.focus();
        }
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        if (first instanceof HTMLElement) {
          first.focus();
        }
      }
    }
  });
}

async function init() {
  populateTypeSelect();
  syncAddWidgetSizeInputs();
  const loaded = await loadState(defaultState());
  lastSavedFingerprint = snapshotFingerprint(loaded);
  lastSavedUserMutationAt = readUserMutationClock(loaded);
  saveInFlightFingerprint = "";
  state = hydrate(loaded);
  wireStorageSync();
  if (state.ui.home.legacyHeadlessSurfaceMigrated && loaded?.ui?.home?.legacyHeadlessSurfaceMigrated !== true) {
    queueSave();
  }

  applyTheme();
  applyBackground();
  wireEvents();
  renderBoard();
}

void init();
