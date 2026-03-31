import { STORAGE_KEY, loadState, saveState } from "./storage.js";
import { widgetRegistry, widgetList } from "./widgets/index.js";
import {
  STARTUP_STATE_EMPTY_WIDGETS_QUERY_KEY,
  STARTUP_STATE_INLINE_QUERY_KEY,
  STARTUP_STATE_JSON_PATH,
  STARTUP_STATE_QUERY_KEY,
  getStartupStateFromLocation as getStartupStateFromLocationWithPolicy,
  loadStartupStateFromConfigFile as loadStartupStateFromConfigFileWithPolicy,
  loadStartupStateFromJsonValue as loadStartupStateFromJsonValueWithPolicy,
  resolveStartupStateDefault as resolveStartupStateDefaultWithPolicy
} from "./core/startupState.js";
import {
  applyRuntimeOnlyPolicyToPresetSnapshot,
  applyRuntimeOnlyPolicyToSnapshot,
  applyRuntimeOnlyWidgetConfigDefaults,
  buildPersistableWidgetConfigPatch
} from "./core/runtimeSnapshotPolicy.js";
import {
  DROP_CONTAINER_KIND,
  DROP_PLAN_KIND,
  createBoardPageDropPlan,
  createBoardPlaceholderDropPlan,
  createContainerDropPlan,
  createDeleteZoneDropPlan,
  createNoneDropPlan,
  internalPlaceholderFromPlaceholderEdge,
  isBoardPlaceholderDropPlan,
  isBoardRealPageDropPlan,
  isContainerDropPlan,
  placeholderEdgeFromInternalPlaceholder,
  policyPlaceholderPageFromInternalPlaceholder,
  policyRealPageFromInternalPage
} from "./core/launcherDropPlan.js";

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
  "titleAlign",
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
const VIDEO_CACHE_MAX_ENTRIES = 6;
const BOARD_PAGE_TRANSITION_MS = 260;
const EXPORT_SNAPSHOT_FILENAME = "startup-state.sanitized.json";
const SENSITIVE_EXPORT_KEYWORD_PARTS = [
  "token",
  "secret",
  "password",
  "apikey",
  "auth",
  "credential",
  "session",
  "bearer",
  "private",
  "clientsecret"
];
const VOLATILE_BACKGROUND_KEYWORD_PARTS = ["cache", "cached", "signature", "storedat", "fetch", "timestamp", "temp", "runtime"];
const REDACTED_EXPORT_VALUE = "[REDACTED]";

const elements = {
  appRoot: document.getElementById("app"),
  board: document.getElementById("board"),
  bgRefreshBtn: document.getElementById("bgRefreshBtn"),
  modeToggleBtn: document.getElementById("modeToggleBtn"),
  addWidgetBtn: document.getElementById("addWidgetBtn"),
  resetBtn: document.getElementById("resetBtn"),
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
  addWidgetToast: document.getElementById("addWidgetToast"),
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
  widgetTitleRenameOverlay: document.getElementById("widgetTitleRenameOverlay"),
  widgetTitleRenameInput: document.getElementById("widgetTitleRenameInput"),
  widgetTitleRenameCloseBtn: document.getElementById("widgetTitleRenameCloseBtn"),
  widgetTitleRenameCancelBtn: document.getElementById("widgetTitleRenameCancelBtn"),
  widgetTitleRenameOkBtn: document.getElementById("widgetTitleRenameOkBtn"),
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
  persistentDockBody: document.querySelector("#persistentDock .persistent-dock-body"),
  dockWidgetStrip: document.getElementById("dockWidgetStrip"),
  dockSettingsBtn: document.getElementById("dockSettingsBtn"),
  dockSettingsModalOverlay: document.getElementById("dockSettingsModalOverlay"),
  dockSettingsModalBody: document.getElementById("dockSettingsModalBody"),
  dockSettingsModalCloseBtn: document.getElementById("dockSettingsModalCloseBtn"),
  dockSettingsModalCancelBtn: document.getElementById("dockSettingsModalCancelBtn"),
  dockSettingsModalOkBtn: document.getElementById("dockSettingsModalOkBtn"),
  dockSettingsModalDefaultBtn: document.getElementById("dockSettingsModalDefaultBtn"),
  dragDeleteZone: document.getElementById("dragDeleteZone"),
  boardContextMenu: document.getElementById("boardContextMenu"),
  boardContextAddWidgetBtn: document.getElementById("boardContextAddWidgetBtn"),
  homePageAnchorBtn: document.getElementById("homePageAnchorBtn"),
  workspace: document.querySelector(".workspace"),
  editDock: document.querySelector(".edit-dock"),
  editDockGrip: document.getElementById("editDockGrip")
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

const widgetTitleRenameState = {
  open: false,
  widgetId: ""
};

let state = null;
let saveTimer = null;
let saveAllowsNonUserMutation = false;
let lastSavedFingerprint = "";
let lastSavedUserMutationAt = 0;
let saveInFlightFingerprint = "";
let saveChain = Promise.resolve();
let wallpaperTimer = null;
let wallpaperCounter = 0;
let lastDragEndAt = 0;
let blurComputeToken = 0;
let wallpaperSourceSignature = "";
let zCounter = 1;
let addWidgetModalOpen = false;
let dockSettingsModalOpen = false;
let addWidgetToastTimer = null;
let wallpaperLoadToken = 0;
let videoLoadToken = 0;
let sampledWallpaperBaseLuminance = null;
let sampledWallpaperSource = "";
let wallpaperSampleToken = 0;
let currentVideoObjectUrl = "";
let runtimeSettingsPanelOpen = false;
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
const dockEmbeddedUiState = {
  controllers: new Map()
};
const containerDropUiState = {
  targets: new Map(),
  activeId: ""
};

const dragGuideUiState = {
  host: null
};
const dragDeleteUiState = {
  active: false,
  hovering: false
};
const boardContextMenuState = {
  open: false,
  anchorX: 0,
  anchorY: 0
};
const launcherPageUiState = {
  virtualPage: null,
  pendingPlaceholderDrop: null,
  dragPlaceholderPolicyActive: false
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

async function loadStartupStateFromJsonValue(rawValue, options = {}) {
  return loadStartupStateFromJsonValueWithPolicy(rawValue, {
    ...options,
    isStateObject,
    mergeStateObjects,
    baseOrigin: location.origin
  });
}

async function getStartupStateFromLocation() {
  return getStartupStateFromLocationWithPolicy({
    search: window.location.search,
    startupStateQueryKey: STARTUP_STATE_QUERY_KEY,
    startupStateInlineQueryKey: STARTUP_STATE_INLINE_QUERY_KEY,
    startupStateEmptyWidgetsQueryKey: STARTUP_STATE_EMPTY_WIDGETS_QUERY_KEY,
    isStateObject,
    mergeStateObjects,
    fetchFn: fetch,
    baseOrigin: location.origin,
    cache: "no-store",
    logger: console
  });
}

async function loadStartupStateFromConfigFile() {
  return loadStartupStateFromConfigFileWithPolicy({
    startupStateJsonPath: STARTUP_STATE_JSON_PATH,
    runtimeGetUrl: chrome?.runtime?.getURL ? chrome.runtime.getURL.bind(chrome.runtime) : null,
    isStateObject,
    mergeStateObjects,
    fetchFn: fetch,
    baseOrigin: location.origin,
    cache: "no-store"
  });
}

async function resolveStartupStateDefault() {
  return resolveStartupStateDefaultWithPolicy({
    defaultState,
    isStateObject,
    mergeStateObjects,
    startupStateJsonPath: STARTUP_STATE_JSON_PATH,
    runtimeGetUrl: chrome?.runtime?.getURL ? chrome.runtime.getURL.bind(chrome.runtime) : null,
    fetchFn: fetch,
    baseOrigin: location.origin,
    cache: "no-store"
  });
}

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
    localMediaDataUrl: "",
    localMediaType: "",
    localMediaName: "",
    localMediaBackgroundColor: "#000000",
    localMediaFit: "stretch",
    videoCacheSignature: "",
    videoCacheStoredAt: 0,
    blurAmount: 0,
    overlayOpacity: 0.24
  };
}

function defaultUi() {
  return {
    activeTab: "global",
    theme: defaultTheme(),
    background: defaultBackground(),
    home: defaultHomeLayout(),
    widgetCommonMaster: defaultWidgetCommonMaster(),
    shortcuts: {
      iconSizePercent: 100
    },
    monday: {
      accessToken: ""
    },
    defaultProfileSnapshot: null,
    defaultProfileUpdatedAt: 0
  };
}

function normalizeMondayGlobalSettings(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    accessToken: normalizeText(raw.accessToken)
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
    homePage: 0,
    manualPages: [],
    dockEnabled: true,
    dockShape: "raised",
    dockVisibility: "fixed",
    dockPosition: "bottom",
    dockLength: 6,
    dockHeight: 44,
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
    titleAlign: "center",
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

function isHeadlessDefaultType(type) {
  return type === "weather" || isHeadlessTransparentDefaultType(type);
}

function defaultWidgetContentAlign(type) {
  if (type === "weather") {
    return "top";
  }
  return isHeadlessDefaultType(type) ? "center" : "top";
}

function defaultWidgetTitleAlign() {
  return "center";
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

function normalizeTitleAlign(value, fallback = "center") {
  if (value === "left" || value === "center" || value === "right") {
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
const SHORT_TEXT_WIDGET_TYPES = new Set(["clock", "flexWorktime", "mondayMeetingNote"]);
const SHORT_TEXT_MIN_CONTENT_FONT_SCALE = 1.25;

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
    titleAlign: normalizeTitleAlign(base.titleAlign, defaultWidgetTitleAlign()),
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
  if (key === "titleAlign") {
    return normalizeTitleAlign(instance.titleAlign, defaultWidgetTitleAlign());
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

  if (key === "titleAlign") {
    instance.titleAlign = normalizeTitleAlign(value, defaultWidgetTitleAlign());
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

function normalizeDockVisibility(value, fallback = "fixed") {
  const raw = normalizeText(value, fallback).toLowerCase();
  if (raw === "fixed" || raw === "always") {
    return "fixed";
  }
  if (raw === "collapsible" || raw === "hover") {
    return "collapsible";
  }

  const normalizedFallback = normalizeText(fallback, "fixed").toLowerCase();
  if (normalizedFallback === "collapsible" || normalizedFallback === "hover") {
    return "collapsible";
  }
  return "fixed";
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

function normalizeDockHeight(value, fallback = 44) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return clamp(Math.round(fallback), 36, 72);
  }
  return clamp(Math.round(num), 36, 72);
}

function normalizeDockSize(value, fallback = 44) {
  return normalizeDockHeight(value, fallback);
}

/**
 * @typedef {Object} DockConfig
 * @property {boolean} enabled
 * @property {"raised" | "flat"} shape
 * @property {"fixed" | "collapsible"} visibility
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

function nextDockOrder(instances = state?.instances) {
  const items = Array.isArray(instances) ? instances : [];
  let maxOrder = -1;

  for (const item of items) {
    if (!item || item.enabled === false || isWidgetInContainer(item) || !isWidgetDocked(item)) {
      continue;
    }
    const current = normalizeDockOrder(item.dockOrder, -1);
    if (current >= 0 && current > maxOrder) {
      maxOrder = current;
    }
  }

  return maxOrder + 1;
}

function isWidgetDocked(instance) {
  return normalizeDockOrder(instance?.dockOrder, null) !== null;
}

function normalizeDockedWidgetOrders(instances, home = state?.ui?.home) {
  if (!Array.isArray(instances) || !instances.length) {
    return false;
  }

  const slotCount = Math.max(1, buildDockConfig(home).lengthUnits);
  const docked = instances
    .filter((instance) => instance && instance.enabled !== false && isWidgetDocked(instance) && !isWidgetInContainer(instance))
    .sort((a, b) => {
      const orderA = normalizeDockOrder(a.dockOrder, Number.MAX_SAFE_INTEGER);
      const orderB = normalizeDockOrder(b.dockOrder, Number.MAX_SAFE_INTEGER);
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return String(a.id).localeCompare(String(b.id));
    });

  let changed = false;
  const occupied = new Set();
  const nextAvailableSlot = () => {
    for (let slot = 0; slot < slotCount; slot += 1) {
      if (!occupied.has(slot)) {
        return slot;
      }
    }
    return null;
  };

  for (const instance of docked) {
    const current = normalizeDockOrder(instance.dockOrder, null);
    if (current !== null && current < slotCount && !occupied.has(current)) {
      occupied.add(current);
      continue;
    }

    const fallback = nextAvailableSlot();
    if (fallback === null) {
      if (instance.dockOrder !== null) {
        instance.dockOrder = null;
        changed = true;
      }
      continue;
    }

    if (instance.dockOrder !== fallback) {
      instance.dockOrder = fallback;
      changed = true;
    }
    occupied.add(fallback);
  }

  for (const instance of instances) {
    if (!instance || !isWidgetDocked(instance) || !isWidgetInContainer(instance)) {
      continue;
    }
    instance.dockOrder = null;
    changed = true;
  }

  return changed;
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

function resolveContainerSpan(containerInstance) {
  const cols = normalizeContainerExpandedCols(containerInstance?.config?.expandedCols, 4);
  const rows = normalizeContainerExpandedRows(containerInstance?.config?.expandedRows, 3);

  if (!isGridLayoutMode()) {
    return { cols, rows };
  }

  const home = normalizeHomeLayout(state?.ui?.home);
  const grid = normalizeGridLayout(containerInstance?.gridLayout, {
    col: 0,
    row: 0,
    colSpan: 1,
    rowSpan: 1
  });
  const clampedCol = clamp(grid.col, 0, Math.max(0, home.gridColumns - 1));
  const clampedRow = clamp(grid.row, 0, Math.max(0, home.gridRows - 1));
  const maxCols = Math.max(1, home.gridColumns - clampedCol);
  const maxRows = Math.max(1, home.gridRows - clampedRow);

  return {
    cols: clamp(cols, 1, maxCols),
    rows: clamp(rows, 1, maxRows)
  };
}

function resolveContainerCapacity(containerInstance) {
  const span = resolveContainerSpan(containerInstance);
  return Math.max(1, span.cols * span.rows);
}

function resolveWidgetSpanInContainer(widgetInstance, containerSpan) {
  const def = widgetRegistry[widgetInstance?.type];
  const fallback = widgetDefaultGridSize(widgetInstance?.type, def);
  const grid = normalizeGridLayout(widgetInstance?.gridLayout, {
    col: 0,
    row: 0,
    colSpan: fallback.colSpan,
    rowSpan: fallback.rowSpan
  });

  return {
    cols: clamp(Math.max(1, grid.colSpan), 1, Math.max(1, containerSpan.cols)),
    rows: clamp(Math.max(1, grid.rowSpan), 1, Math.max(1, containerSpan.rows))
  };
}

function countContainedWidgetUnits(containerId, containerSpan, { excludeWidgetId = "" } = {}) {
  const targetId = normalizeContainerId(containerId);
  if (!targetId) {
    return 0;
  }

  let units = 0;
  for (const instance of state.instances || []) {
    if (!instance || instance.enabled === false || instance.type === "container") {
      continue;
    }
    if (excludeWidgetId && String(instance.id) === String(excludeWidgetId)) {
      continue;
    }
    if (normalizeContainerId(instance.containerId) !== targetId) {
      continue;
    }
    const span = resolveWidgetSpanInContainer(instance, containerSpan);
    units += span.cols * span.rows;
  }

  return units;
}

function canPlaceWidgetInContainer(widgetId, containerId) {
  const target = instanceById(containerId);
  if (!target || target.enabled === false || target.type !== "container") {
    return false;
  }

  const incoming = instanceById(widgetId);
  if (!incoming || incoming.type === "container" || String(incoming.id) === String(target.id)) {
    return false;
  }

  if (normalizeContainerId(incoming.containerId) === String(target.id)) {
    return true;
  }

  const targetSpan = resolveContainerSpan(target);
  const capacity = resolveContainerCapacity(target);
  const currentUnits = countContainedWidgetUnits(target.id, targetSpan, { excludeWidgetId: incoming.id });
  const incomingSpan = resolveWidgetSpanInContainer(incoming, targetSpan);
  const incomingUnits = incomingSpan.cols * incomingSpan.rows;
  return currentUnits + incomingUnits <= capacity;
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

function dockSlotCount(home = state?.ui?.home) {
  return Math.max(1, buildDockConfig(home).lengthUnits);
}

function isHorizontalDock(config = buildDockConfig(state?.ui?.home)) {
  return config.position === "top" || config.position === "bottom";
}

function dockSlotOccupants({ excludeWidgetId = "" } = {}) {
  const slotCount = dockSlotCount();
  const excluded = normalizeText(excludeWidgetId);
  const occupied = new Map();
  for (const instance of state?.instances || []) {
    if (!instance || instance.enabled === false || !isWidgetDocked(instance) || isWidgetInContainer(instance)) {
      continue;
    }
    if (excluded && String(instance.id) === excluded) {
      continue;
    }
    const slot = normalizeDockOrder(instance.dockOrder, null);
    if (slot === null || slot < 0 || slot >= slotCount || occupied.has(slot)) {
      continue;
    }
    occupied.set(slot, instance);
  }
  return occupied;
}

function firstAvailableDockSlot({ excludeWidgetId = "" } = {}) {
  const slotCount = dockSlotCount();
  const occupied = dockSlotOccupants({ excludeWidgetId });
  for (let slot = 0; slot < slotCount; slot += 1) {
    if (!occupied.has(slot)) {
      return slot;
    }
  }
  return null;
}

function dockSlotIndexAtPoint(clientX, clientY, { clampToRange = false } = {}) {
  const strip = elements.dockWidgetStrip;
  if (!(strip instanceof HTMLElement)) {
    return null;
  }

  const config = buildDockConfig(state?.ui?.home);
  if (!config.enabled) {
    return null;
  }

  const slotCount = Math.max(1, config.lengthUnits);
  const rect = strip.getBoundingClientRect();
  if (!pointInsideRect(clientX, clientY, rect) && !clampToRange) {
    return null;
  }

  const stripStyle = window.getComputedStyle(strip);
  const gapFallback = cssPixelValue(stripStyle.gap, 6);
  const horizontal = isHorizontalDock(config);
  const gap = horizontal
    ? cssPixelValue(stripStyle.columnGap, gapFallback)
    : cssPixelValue(stripStyle.rowGap, gapFallback);
  const step = Math.max(1, Number(config.heightPx) + gap);
  const local = horizontal
    ? clamp(clientX - rect.left, 0, Math.max(0, rect.width - 1))
    : clamp(clientY - rect.top, 0, Math.max(0, rect.height - 1));

  const slot = Math.floor((local + gap * 0.5) / step);
  if (slot < 0 || slot >= slotCount) {
    if (!clampToRange) {
      return null;
    }
    return clamp(slot, 0, slotCount - 1);
  }
  return slot;
}

function dockSlotRectRelativeToHost(slotIndex) {
  const dockHost = elements.persistentDockBody ?? elements.persistentDock;
  const strip = elements.dockWidgetStrip;
  if (!(dockHost instanceof HTMLElement) || !(strip instanceof HTMLElement)) {
    return null;
  }

  const config = buildDockConfig(state?.ui?.home);
  const slotCount = Math.max(1, config.lengthUnits);
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) {
    return null;
  }

  const stripStyle = window.getComputedStyle(strip);
  const gapFallback = cssPixelValue(stripStyle.gap, 6);
  const horizontal = isHorizontalDock(config);
  const gap = horizontal
    ? cssPixelValue(stripStyle.columnGap, gapFallback)
    : cssPixelValue(stripStyle.rowGap, gapFallback);
  const unit = Math.max(1, Number(config.heightPx) || 44);

  const dockRect = dockHost.getBoundingClientRect();
  const stripRect = strip.getBoundingClientRect();
  const baseX = stripRect.left - dockRect.left;
  const baseY = stripRect.top - dockRect.top;
  const offset = slotIndex * (unit + gap);

  return {
    x: Math.round(baseX + (horizontal ? offset : 0)),
    y: Math.round(baseY + (horizontal ? 0 : offset)),
    w: unit,
    h: unit,
    borderRadius: Math.round(unit * 0.28)
  };
}

function resolveDockDropSlotIndex(clientX, clientY, draggedInstance = null) {
  const config = buildDockConfig(state?.ui?.home);
  if (!config.enabled) {
    return null;
  }

  const direct = dockSlotIndexAtPoint(clientX, clientY, { clampToRange: true });
  if (direct !== null) {
    return direct;
  }

  const current = normalizeDockOrder(draggedInstance?.dockOrder, null);
  if (current !== null && current < config.lengthUnits) {
    return current;
  }

  return firstAvailableDockSlot({ excludeWidgetId: draggedInstance?.id }) ?? 0;
}

function moveWidgetToDockSlot(instance, targetSlot, { record = true } = {}) {
  if (!instance || !Number.isFinite(targetSlot)) {
    return false;
  }

  const config = buildDockConfig(state?.ui?.home);
  const slotCount = Math.max(1, config.lengthUnits);
  const clampedSlot = clamp(Math.floor(targetSlot), 0, slotCount - 1);

  if (!isDockEligibleWidget(instance)) {
    return false;
  }

  const previousSlot = normalizeDockOrder(instance.dockOrder, null);
  const occupied = dockSlotOccupants({ excludeWidgetId: instance.id });
  const occupant = occupied.get(clampedSlot) || null;

  if (previousSlot === clampedSlot && !isWidgetInContainer(instance)) {
    return false;
  }

  if (occupant && previousSlot !== null && previousSlot >= 0 && previousSlot < slotCount) {
    occupant.dockOrder = previousSlot;
  } else if (occupant) {
    const fallback = firstAvailableDockSlot({ excludeWidgetId: instance.id });
    if (fallback === null) {
      return false;
    }
    occupant.dockOrder = fallback;
  }

  if (record) {
    recordHistorySnapshot("Dock widget");
  } else {
    touchUserMutationClock();
  }

  if (isWidgetInContainer(instance)) {
    setWidgetContainer(instance.id, "", {
      record: false,
      rerender: false,
      save: false
    });
  }

  instance.dockOrder = clampedSlot;
  normalizeDockedWidgetOrders(state.instances, state?.ui?.home);
  setDockActiveId(instance.id, { rerender: false });

  if (state.selectedWidgetId === instance.id) {
    state.selectedWidgetId = "";
  }
  if (modalState.open && modalState.widgetId === instance.id) {
    closeWidgetModal(false);
  }

  return true;
}

function normalizeDockActiveId(instances, candidate = dockUiState.activeId) {
  if (!Array.isArray(instances) || !instances.length) {
    return "";
  }
  const candidateId = normalizeText(candidate);
  if (candidateId && instances.some((item) => String(item.id) === candidateId)) {
    return candidateId;
  }
  const selected = normalizeText(state?.selectedWidgetId);
  if (selected && instances.some((item) => String(item.id) === selected)) {
    return selected;
  }
  return String(instances[0].id);
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

function dockUnitLayoutSize() {
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

function isDockEligibleWidget(instance) {
  if (!instance || instance.enabled === false) {
    return false;
  }
  if (instance.type === "container") {
    return false;
  }

  const def = widgetRegistry[instance.type];
  const fallback = widgetDefaultGridSize(instance.type, def);
  const grid = normalizeGridLayout(instance.gridLayout, {
    col: 0,
    row: 0,
    colSpan: fallback.colSpan,
    rowSpan: fallback.rowSpan
  });
  return grid.colSpan === 1 && grid.rowSpan === 1;
}

/** @returns {DockConfig} */
function buildDockConfig(home = state?.ui?.home) {
  const normalizedHome = normalizeHomeLayout(home || defaultHomeLayout());
  return {
    enabled: normalizedHome.dockEnabled !== false,
    shape: normalizeDockShape(normalizedHome.dockShape, "raised"),
    visibility: normalizeDockVisibility(normalizedHome.dockVisibility, "fixed"),
    lengthUnits: normalizeDockLength(normalizedHome.dockLength, 6),
    heightPx: normalizeDockHeight(normalizedHome.dockHeight, 44),
    position: "bottom"
  };
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

function normalizeLauncherPageIndexList(value, pageCount = 1) {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = new Set();
  for (const item of value) {
    const page = normalizeWidgetPage(item, pageCount, 0);
    normalized.add(page);
  }
  return Array.from(normalized).sort((left, right) => left - right);
}

function remapLauncherPageIndexList(list, remap, pageCount = 1) {
  if (!(remap instanceof Map)) {
    return normalizeLauncherPageIndexList(list, pageCount);
  }
  const remapped = [];
  for (const rawPage of Array.isArray(list) ? list : []) {
    const page = Math.floor(Number(rawPage));
    if (!Number.isFinite(page)) {
      continue;
    }
    const mapped = remap.get(page);
    if (Number.isFinite(mapped)) {
      remapped.push(mapped);
    }
  }
  return normalizeLauncherPageIndexList(remapped, pageCount);
}

function shiftLauncherPageIndexListOnInsert(list, { addLeft = false, pageCount = 1, insertedPage = 0 } = {}) {
  const shifted = normalizeLauncherPageIndexList(list, Math.max(1, pageCount - 1)).map((page) =>
    addLeft ? page + 1 : page
  );
  shifted.push(insertedPage);
  return normalizeLauncherPageIndexList(shifted, pageCount);
}

function shiftLauncherPageIndexListOnDelete(list, deletedPage, pageCount = 1) {
  const target = normalizeWidgetPage(deletedPage, pageCount + 1, 0);
  const shifted = [];
  for (const page of normalizeLauncherPageIndexList(list, pageCount + 1)) {
    if (page === target) {
      continue;
    }
    shifted.push(page > target ? page - 1 : page);
  }
  return normalizeLauncherPageIndexList(shifted, pageCount);
}

function resolvePageTowardHomeDirection(keptPages, currentPage, homePage) {
  if (!Array.isArray(keptPages) || !keptPages.length) {
    return 0;
  }
  const sorted = [...keptPages].sort((left, right) => left - right);
  if (sorted.includes(currentPage)) {
    return currentPage;
  }

  if (currentPage < homePage) {
    const towardHome = sorted.find((page) => page > currentPage);
    if (Number.isFinite(towardHome)) {
      return towardHome;
    }
    return sorted[sorted.length - 1];
  }

  if (currentPage > homePage) {
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      if (sorted[index] < currentPage) {
        return sorted[index];
      }
    }
    return sorted[0];
  }

  const atOrAfterHome = sorted.find((page) => page >= homePage);
  if (Number.isFinite(atOrAfterHome)) {
    return atOrAfterHome;
  }
  return sorted[sorted.length - 1];
}

function remapPageForDeletion(page, deletedPage, pageCountAfter) {
  const normalizedDeletedPage = normalizeWidgetPage(deletedPage, pageCountAfter + 1, 0);
  const normalizedPage = normalizeWidgetPage(page, pageCountAfter + 1, normalizedDeletedPage);
  if (normalizedPage < normalizedDeletedPage) {
    return normalizeWidgetPage(normalizedPage, pageCountAfter, 0);
  }
  if (normalizedPage > normalizedDeletedPage) {
    return normalizeWidgetPage(normalizedPage - 1, pageCountAfter, 0);
  }
  return normalizeWidgetPage(normalizedDeletedPage, pageCountAfter, normalizedDeletedPage - 1);
}

function applyLauncherHomeMetadata(home) {
  if (!home || typeof home !== "object") {
    return home;
  }
  const pageCount = normalizePageCount(home.pageCount, 1);
  home.homePage = normalizeActivePage(home.homePage, pageCount, 0);
  home.manualPages = normalizeLauncherPageIndexList(home.manualPages, pageCount);
  return home;
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
  const homePage = normalizeActivePage(base.homePage, pageCount, 0);
  const manualPages = normalizeLauncherPageIndexList(base.manualPages, pageCount);

  return {
    mode: normalizeHomeMode(base.mode, "grid"),
    gridColumns: clamp(Number(base.gridColumns) || 4, 1, GRID_MAX_COLUMNS),
    gridRows: clamp(Number(base.gridRows) || 3, 1, GRID_MAX_ROWS),
    marginHorizontal: normalizeMarginPreset(base.marginHorizontal, "medium"),
    marginVertical: normalizeMarginPreset(base.marginVertical, "medium"),
    itemGap: normalizeGapPreset(base.itemGap, "narrow"),
    pageCount,
    activePage: normalizeActivePage(base.activePage, pageCount, 0),
    homePage,
    manualPages,
    dockEnabled: base.dockEnabled !== false,
    dockShape: normalizeDockShape(base.dockShape, "raised"),
    dockVisibility: normalizeDockVisibility(base.dockVisibility, "fixed"),
    dockPosition: normalizeDockPosition(base.dockPosition, "bottom"),
    dockLength: normalizeDockLength(base.dockLength, 6),
    dockHeight: normalizeDockHeight(base.dockHeight ?? base.dockSize, 44),
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
        viewMode: isHeadlessDefaultType(type) ? "headless" : "window",
        surfaceMode: isHeadlessTransparentDefaultType(type) ? "transparent" : "normal",
        transparentAutoContrast: true,
        transparentGhostStrength: 100,
        backdropBlur: defaultWidgetBackdropBlur(type),
        edgeRoundness: 12,
        transparency: 0.94,
        titleAlign: defaultWidgetTitleAlign(),
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
  const cloned = {
    ui: {
      theme: { ...(snapshot?.ui?.theme || {}) },
      background: { ...(snapshot?.ui?.background || {}) },
      home: { ...(snapshot?.ui?.home || {}) },
      widgetCommonMaster: { ...(snapshot?.ui?.widgetCommonMaster || {}) },
      shortcuts: { ...(snapshot?.ui?.shortcuts || {}) },
      monday: { ...(snapshot?.ui?.monday || {}) }
    },
    instances: Array.isArray(snapshot?.instances)
      ? snapshot.instances.map((instance) => ({ ...instance, config: { ...(instance.config || {}) } }))
      : []
  };

  applyRuntimeOnlyPolicyToPresetSnapshot(cloned);
  return cloned;
}

function createStateSnapshot() {
  return {
    ui: {
      theme: structuredClone(state.ui.theme),
      background: structuredClone(state.ui.background),
      home: structuredClone(state.ui.home),
      widgetCommonMaster: structuredClone(state.ui.widgetCommonMaster),
      shortcuts: structuredClone(state.ui.shortcuts),
      monday: structuredClone(state.ui.monday)
    },
    instances: state.instances.map((instance) => ({
      ...structuredClone(instance),
      zIndex: Math.max(1, Number(instance.zIndex) || 1),
      surfaceMode: normalizeSurfaceMode(instance.surfaceMode, "normal"),
      edgeRoundness: normalizeEdgeRoundness(instance.edgeRoundness, 12),
      titleAlign: normalizeTitleAlign(instance.titleAlign, defaultWidgetTitleAlign()),
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
      monday: {
        ...state.ui.monday,
        ...(applyGlobal ? snapshot.ui?.monday || {} : {})
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
  state.ui.monday = normalizeMondayGlobalSettings(hydrated.ui.monday);

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

function normalizeSensitiveKeyPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isSensitiveExportKey(key) {
  const normalizedKey = normalizeSensitiveKeyPart(key);
  if (!normalizedKey) {
    return false;
  }
  return SENSITIVE_EXPORT_KEYWORD_PARTS.some((part) => normalizedKey.includes(part));
}

function isVolatileBackgroundExportKey(key) {
  const normalizedKey = normalizeSensitiveKeyPart(key);
  if (!normalizedKey) {
    return false;
  }
  return VOLATILE_BACKGROUND_KEYWORD_PARTS.some((part) => normalizedKey.includes(part));
}

function sanitizeCredentialQueryParamsInString(value) {
  if (typeof value !== "string") {
    return value;
  }

  const queryIndex = value.indexOf("?");
  if (queryIndex < 0) {
    return value;
  }

  const hashIndex = value.indexOf("#", queryIndex);
  const queryStart = queryIndex + 1;
  const queryEnd = hashIndex >= 0 ? hashIndex : value.length;
  const queryText = value.slice(queryStart, queryEnd);
  if (!queryText) {
    return value;
  }

  const params = new URLSearchParams(queryText);
  let changed = false;
  for (const key of [...params.keys()]) {
    if (!isSensitiveExportKey(key)) {
      continue;
    }
    params.set(key, REDACTED_EXPORT_VALUE);
    changed = true;
  }

  if (!changed) {
    return value;
  }

  const prefix = value.slice(0, queryStart);
  const suffix = hashIndex >= 0 ? value.slice(hashIndex) : "";
  return `${prefix}${params.toString()}${suffix}`;
}

function sanitizeStateExportValue(value, pathParts = []) {
  if (typeof value === "string") {
    return sanitizeCredentialQueryParamsInString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeStateExportValue(entry, pathParts));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const isBackgroundBranch = pathParts.length >= 2 && pathParts[0] === "ui" && pathParts[1] === "background";
  const sanitized = {};

  for (const [key, rawValue] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    const isExactMondayAccessTokenPath = nextPath.length === 3 && nextPath[0] === "ui" && nextPath[1] === "monday" && nextPath[2] === "accessToken";
    if (isExactMondayAccessTokenPath || isSensitiveExportKey(key)) {
      sanitized[key] = REDACTED_EXPORT_VALUE;
      continue;
    }
    if (isBackgroundBranch && isVolatileBackgroundExportKey(key)) {
      continue;
    }
    sanitized[key] = sanitizeStateExportValue(rawValue, nextPath);
  }

  return sanitized;
}

function buildSanitizedStateExportSnapshot() {
  return sanitizeStateExportValue(buildPersistSnapshot());
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function exportCurrentStateToFile() {
  if (!state) {
    return;
  }

  try {
    const sanitizedSnapshot = buildSanitizedStateExportSnapshot();
    const json = JSON.stringify(sanitizedSnapshot, null, 2);
    downloadTextFile(EXPORT_SNAPSHOT_FILENAME, json);
  } catch (error) {
    console.warn("Failed to export current state", error);
  }
}

function hydrate(raw) {
  const base = defaultState();
  const hasExplicitInstances = Array.isArray(raw.instances);
  const instances = hasExplicitInstances ? raw.instances : base.instances;
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
    const headlessByDefault = isHeadlessDefaultType(item.type);
    const isAiChat = item.type === "aiChat";
    const isContainerWidget = item.type === "container";
    const viewMode =
      item.viewMode === "headless" || item.viewMode === "window"
        ? item.viewMode
        : headlessByDefault
          ? "headless"
          : "window";
    const legacySurfaceFallback = headlessTransparentByDefault ? "transparent" : "normal";
    let surfaceMode = normalizeSurfaceMode(item.surfaceMode, legacySurfaceFallback);
    if (
      !legacyHeadlessSurfaceMigrated &&
      headlessTransparentByDefault &&
      viewMode === "headless" &&
      item.surfaceMode === "normal"
    ) {
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

    applyRuntimeOnlyWidgetConfigDefaults(item.type, mergedConfig);

    const normalizedGrid = normalizeGridLayout(item.gridLayout, {
      col: normalized.length % 4,
      row: Math.floor(normalized.length / 4),
      ...widgetDefaultGridSize(item.type, def)
    });
    if (item.type === "weather") {
      const detailMode = normalizeText(mergedConfig.detailMode, "simple").toLowerCase();
      normalizedGrid.rowSpan = detailMode === "advanced" ? 2 : 1;
    }
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
      titleAlign: normalizeTitleAlign(item.titleAlign, defaultWidgetTitleAlign()),
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

  const rawUi = raw?.ui || {};
  normalizeDockedWidgetOrders(normalized, rawUi.home);
  normalizeContainerAssignments(normalized);

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
  const monday = normalizeMondayGlobalSettings(rawUi.monday);
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
        snapshot: clonePresetSnapshot(snapshot)
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
  background.localMediaDataUrl = normalizeText(background.localMediaDataUrl);
  background.localMediaType = normalizeLocalMediaType(background.localMediaType, "");
  if (!background.localMediaType && background.localMediaDataUrl) {
    background.localMediaType = inferLocalMediaTypeFromDataUrl(background.localMediaDataUrl);
  }
  background.localMediaName = normalizeText(background.localMediaName);
  background.localMediaBackgroundColor = normalizeHexColor(
    background.localMediaBackgroundColor,
    defaultBackground().localMediaBackgroundColor
  );
  background.localMediaFit = normalizeLocalMediaFit(background.localMediaFit, "stretch");
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
      theme,
      background,
      home,
      widgetCommonMaster,
      shortcuts,
      monday,
      defaultProfileSnapshot,
      defaultProfileUpdatedAt
    },
    presets,
    instances: hasExplicitInstances ? normalized : base.instances
  };
}

function persistLatestSnapshot({ allowNonUserMutation = false } = {}) {
  if (!state) {
    return;
  }

  const userMutationAt = readUserMutationClock(state);
  if (!allowNonUserMutation && userMutationAt <= lastSavedUserMutationAt) {
    return;
  }

  const snapshot = buildPersistSnapshot();

  const fingerprint = nextPersistFingerprint(snapshot, userMutationAt, allowNonUserMutation);
  if (!fingerprint) {
    return;
  }

  if (fingerprint === lastSavedFingerprint || fingerprint === saveInFlightFingerprint) {
    return;
  }

  saveInFlightFingerprint = fingerprint;

  const executeSave = async () => {
    try {
      await saveSnapshotIfNotStale(snapshot, fingerprint, userMutationAt);
    } catch (error) {
      console.warn("Failed to persist dashboard state", error);
    } finally {
      if (saveInFlightFingerprint === fingerprint) {
        saveInFlightFingerprint = "";
      }
    }
  };

  saveChain = saveChain.then(executeSave, executeSave);
}

function flushPendingSave(options = {}) {
  if (!state) {
    return;
  }

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const allowNonUserMutation =
    saveAllowsNonUserMutation || options.allowWithoutUserMutation === true;
  saveAllowsNonUserMutation = false;
  persistLatestSnapshot({ allowNonUserMutation });
}

function queueSave(options = {}) {
  if (!state) {
    return;
  }

  const allowWithoutUserMutation = options.allowWithoutUserMutation === true;
  saveAllowsNonUserMutation = saveAllowsNonUserMutation || allowWithoutUserMutation;

  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    flushPendingSave();
  }, 150);
}

function buildSessionSnapshot() {
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

function buildPersistSnapshot() {
  const snapshot = buildSessionSnapshot();
  applyRuntimeOnlyPolicyToSnapshot(snapshot);
  return snapshot;
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
    localMediaType: source.localMediaType,
    localMediaName: source.localMediaName,
    localMediaBackgroundColor: source.localMediaBackgroundColor,
    localMediaFit: source.localMediaFit,
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
    dockSize: source.dockSize,
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
      monday: state.ui.monday,
      defaultProfileSnapshot: state.ui.defaultProfileSnapshot,
      defaultProfileUpdatedAt: state.ui.defaultProfileUpdatedAt
    },
    presets: state.presets,
    instances: state.instances
  });
}

function materializeHistorySnapshot(historySnapshotInput) {
  const base = buildSessionSnapshot();
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

  if (isStateObject(historyUi.monday)) {
    merged.ui.monday = normalizeMondayGlobalSettings(historyUi.monday);
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

function nextPersistFingerprint(snapshot, userMutationAt, allowNonUserMutation) {
  if (!allowNonUserMutation && userMutationAt > 0) {
    return `u:${userMutationAt}`;
  }
  return snapshotFingerprint(snapshot);
}

function isStateObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeStateObjects(base, patch) {
  const output = isStateObject(base) ? structuredClone(base) : {};
  if (!isStateObject(patch)) {
    return output;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      output[key] = value.slice();
      continue;
    }

    if (isStateObject(value) && isStateObject(output[key])) {
      output[key] = mergeStateObjects(output[key], value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

function normalizeStoredSnapshot(value) {
  if (!isStateObject(value)) {
    return null;
  }
  const normalized = structuredClone(value);
  applyRuntimeOnlyPolicyToSnapshot(normalized);
  return normalized;
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
  closeBoardContextMenu();
  setDragDeleteZoneActive(false);

  const label = elements.modeToggleBtn.querySelector(".btn-label");
  if (label) {
    label.textContent = isEdit ? "Use Mode" : "Edit Mode";
  }
  const modeTitle = isEdit ? "Switch to Use Mode" : "Switch to Edit Mode";
  elements.modeToggleBtn.title = modeTitle;
  elements.modeToggleBtn.setAttribute("aria-label", modeTitle);

  if (!isEdit) {
    clearPendingPlaceholderDrop({ clearVirtualPage: true });
    closeWidgetModal(false);
    closeAddWidgetModal();
    closeDockSettingsModal(false);
    runtimeSettingsPanelOpen = false;
  } else {
    renderLauncherPageAffordances();
  }

  syncSettingsPanelVisibility();
  syncPersistentDock();
  syncHomePageAnchorButton();
}

function resolveHomeAnchorTargetPage() {
  const pageCount = currentLauncherPageCount();
  const viewportPage = currentLauncherViewportPage();
  if (isPlaceholderLauncherPage(viewportPage, pageCount)) {
    return null;
  }
  return normalizeWidgetPage(viewportPage, pageCount, currentLauncherActivePage());
}

function syncHomePageAnchorButton() {
  const button = elements.homePageAnchorBtn;
  if (!(button instanceof HTMLButtonElement) || !state?.ui?.home) {
    return;
  }

  const isEdit = state.mode === "edit";
  const targetPage = resolveHomeAnchorTargetPage();
  const pageCount = currentLauncherPageCount();
  const homePage = normalizeActivePage(state.ui.home.homePage, pageCount, 0);
  const isHomeTarget = Number.isFinite(targetPage) && targetPage === homePage;
  const onPlaceholder = targetPage === null;

  let label = "Set current page as home";
  if (!isEdit) {
    label = "Set home page (Edit mode only)";
  } else if (onPlaceholder) {
    label = "Placeholder page cannot be home";
  } else if (isHomeTarget) {
    label = "Current page is home";
  }

  button.classList.toggle("is-active", isHomeTarget);
  button.disabled = !isEdit || onPlaceholder;
  button.tabIndex = isEdit ? 0 : -1;
  button.title = label;
  button.setAttribute("aria-label", label);
}

function setLauncherHomePage(page = currentLauncherActivePage()) {
  if (!state?.ui?.home) {
    return false;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const targetPage = normalizeWidgetPage(page, home.pageCount, home.activePage);
  const nextHomePage = normalizeActivePage(targetPage, home.pageCount, home.homePage);
  if (nextHomePage === home.homePage) {
    syncHomePageAnchorButton();
    return false;
  }

  recordHistorySnapshot("Set home page");
  home.homePage = nextHomePage;
  home.manualPages = normalizeLauncherPageIndexList(home.manualPages, home.pageCount);
  state.ui.home = home;

  renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
  renderSettings();
  queueSave();
  return true;
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
  const open = Boolean(state?.mode === "edit" && runtimeSettingsPanelOpen);
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

function blurFocusedElementInOverlay(overlay) {
  if (!(overlay instanceof Element)) {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && overlay.contains(activeElement)) {
    activeElement.blur();
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

function isInsideWidgetTitleRenameOverlay(target) {
  return target instanceof Element && Boolean(target.closest("#widgetTitleRenameOverlay"));
}

function isInsideBoardContextMenu(target) {
  return target instanceof Element && Boolean(target.closest("#boardContextMenu"));
}

function closeBoardContextMenu() {
  if (!boardContextMenuState.open) {
    return;
  }
  boardContextMenuState.open = false;
  elements.boardContextMenu?.classList.remove("open");
  elements.boardContextMenu?.setAttribute("aria-hidden", "true");
}

function positionBoardContextMenu(clientX, clientY) {
  const menu = elements.boardContextMenu;
  if (!(menu instanceof HTMLElement)) {
    return;
  }

  const margin = 8;
  const width = Math.max(1, Math.round(menu.offsetWidth || 0));
  const height = Math.max(1, Math.round(menu.offsetHeight || 0));
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  const left = clamp(Math.round(clientX), margin, maxLeft);
  const top = clamp(Math.round(clientY), margin, maxTop);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function canOpenBoardContextMenuFromTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (!target.closest(".workspace")) {
    return false;
  }

  const blockedSelector = [
    ".widget-card",
    ".widget-folder-panel",
    ".widget-folder-item-card",
    ".widget-modal-overlay",
    ".settings-panel",
    ".settings-panel-backdrop",
    ".persistent-dock",
    ".corner-controls",
    ".corner-controls-bottom",
    ".add-widget-fab",
    ".edit-dock",
    ".drag-delete-zone",
    ".board-context-menu"
  ].join(",");

  return !target.closest(blockedSelector);
}

function openBoardContextMenu(clientX, clientY) {
  if (
    modalState.open ||
    addWidgetModalOpen ||
    shortcutIconEditorState.open ||
    dockSettingsModalOpen ||
    widgetTitleRenameState.open ||
    dragDeleteUiState.active
  ) {
    return false;
  }

  const menu = elements.boardContextMenu;
  if (!(menu instanceof HTMLElement)) {
    return false;
  }

  boardContextMenuState.open = true;
  boardContextMenuState.anchorX = Math.round(clientX);
  boardContextMenuState.anchorY = Math.round(clientY);
  menu.classList.add("open");
  menu.setAttribute("aria-hidden", "false");
  positionBoardContextMenu(boardContextMenuState.anchorX, boardContextMenuState.anchorY);
  requestAnimationFrame(() => {
    if (!boardContextMenuState.open) {
      return;
    }
    positionBoardContextMenu(boardContextMenuState.anchorX, boardContextMenuState.anchorY);
  });
  return true;
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
        { value: "fixed", label: "Fixed" },
        { value: "collapsible", label: "Collapsible (reveal on hover)" }
      ]
    },
    {
      key: "dockLength",
      label: "Dock length (units)",
      type: "number",
      min: 5,
      max: 14,
      step: 1
    },
    {
      key: "dockSize",
      label: "Dock size (px)",
      type: "number",
      min: 36,
      max: 72,
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
  if (state.mode !== "edit") {
    return;
  }
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
  if (widgetTitleRenameState.open) {
    closeWidgetTitleRenameModal();
  }

  const home = normalizeHomeLayout(state.ui.home);
  dockModalState.draft = {
    dockShape: normalizeDockShape(home.dockShape, "raised"),
    dockVisibility: normalizeDockVisibility(home.dockVisibility, "fixed"),
    dockLength: normalizeDockLength(home.dockLength, 6),
    dockSize: normalizeDockSize(home.dockSize, 44)
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
  blurFocusedElementInOverlay(elements.dockSettingsModalOverlay);
  elements.dockSettingsModalOverlay?.classList.remove("open");
  elements.dockSettingsModalOverlay?.setAttribute("aria-hidden", "true");
  elements.dockSettingsModalBody?.replaceChildren();

  if (!modalState.open && !addWidgetModalOpen && !shortcutIconEditorState.open && !widgetTitleRenameState.open) {
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
    dockLength: defaults.dockLength,
    dockSize: defaults.dockSize
  };
  renderDockSettingsModal();
}

function applyDockSettingsModal() {
  if (!dockSettingsModalOpen || !dockModalState.draft) {
    return;
  }

  const patch = {
    dockShape: normalizeDockShape(dockModalState.draft.dockShape, "raised"),
    dockVisibility: normalizeDockVisibility(dockModalState.draft.dockVisibility, "fixed"),
    dockPosition: "bottom",
    dockLength: normalizeDockLength(dockModalState.draft.dockLength, 6),
    dockSize: normalizeDockSize(dockModalState.draft.dockSize, 44)
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
  blurFocusedElementInOverlay(elements.shortcutIconEditorOverlay);
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
  if (!modalState.open && !addWidgetModalOpen && !shortcutIconEditorState.open && !dockSettingsModalOpen && !widgetTitleRenameState.open) {
    return;
  }
  if (dockSettingsModalOpen && isInsideDockSettingsModalOverlay(event.target)) {
    return;
  }
  if (widgetTitleRenameState.open && isInsideWidgetTitleRenameOverlay(event.target)) {
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
  const titleAlign = normalizeTitleAlign(instance.titleAlign, defaultWidgetTitleAlign());
  instance.titleAlign = titleAlign;
  card.dataset.titleAlign = titleAlign;
  card.style.setProperty("--widget-title-align", titleAlign);
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
  card.style.setProperty("--widget-head-offset", instance.viewMode === "headless" ? "0px" : "44px");
  instance.contentPaddingTop = padding.top;
  instance.contentPaddingRight = padding.right;
  instance.contentPaddingBottom = padding.bottom;
  instance.contentPaddingLeft = padding.left;
  instance.contentPaddingTopRight = normalizeContentPadding((padding.top + padding.right) / 2, padding.uniform);
  instance.contentPaddingBottomLeft = normalizeContentPadding((padding.bottom + padding.left) / 2, padding.uniform);
  instance.contentPadding = normalizeContentPadding((padding.top + padding.right + padding.bottom + padding.left) / 4, padding.uniform);
  instance.contentFontScale = normalizeWidgetContentFontScale(instance.contentFontScale, 1);
  const widgetContentFontScale = SHORT_TEXT_WIDGET_TYPES.has(instance.type)
    ? Math.max(instance.contentFontScale, SHORT_TEXT_MIN_CONTENT_FONT_SCALE)
    : instance.contentFontScale;
  card.style.setProperty("--widget-content-font-scale", String(widgetContentFontScale));
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

function resetBackgroundMediaFrame(target) {
  target.style.inset = "0";
  target.style.left = "0";
  target.style.top = "0";
  target.style.width = "100%";
  target.style.height = "100%";
  target.style.maxWidth = "none";
  target.style.maxHeight = "none";
  target.style.transform = "none";
  target.style.objectFit = "cover";
}

function applyBackgroundLocalFit(target, fitMode) {
  resetBackgroundMediaFrame(target);
  const mode = normalizeLocalMediaFit(fitMode, "stretch");
  if (mode === "stretch") {
    target.style.objectFit = "fill";
    return;
  }

  target.style.objectFit = "contain";

  if (mode === "fit-height") {
    target.style.inset = "auto";
    target.style.left = "50%";
    target.style.top = "0";
    target.style.width = "auto";
    target.style.height = "100%";
    target.style.transform = "translateX(-50%)";
    return;
  }

  if (mode === "fit-width") {
    target.style.inset = "auto";
    target.style.left = "0";
    target.style.top = "50%";
    target.style.width = "100%";
    target.style.height = "auto";
    target.style.transform = "translateY(-50%)";
    return;
  }

  target.style.inset = "auto";
  target.style.left = "50%";
  target.style.top = "50%";
  target.style.width = "auto";
  target.style.height = "auto";
  target.style.objectFit = "none";
  target.style.transform = "translate(-50%, -50%)";
}

function applyBackgroundMediaFitStyles(cfg) {
  if (cfg?.mode === "video" && normalizeText(cfg?.localMediaDataUrl)) {
    const fitMode = normalizeLocalMediaFit(cfg.localMediaFit, "stretch");
    applyBackgroundLocalFit(elements.bgImage, fitMode);
    applyBackgroundLocalFit(elements.bgVideo, fitMode);
    return;
  }
  resetBackgroundMediaFrame(elements.bgImage);
  resetBackgroundMediaFrame(elements.bgVideo);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(normalizeText(reader.result));
    };
    reader.onerror = () => {
      reject(new Error("local-media-read-failed"));
    };
    reader.readAsDataURL(file);
  });
}

async function importLocalBackgroundFile(file) {
  if (!file) {
    return;
  }
  const mimeType = normalizeText(file.type).toLowerCase();
  const mediaType = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "";
  if (!mediaType) {
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const inferredType = normalizeLocalMediaType(mediaType || inferLocalMediaTypeFromDataUrl(dataUrl), "");
    if (!dataUrl || !inferredType) {
      return;
    }
    patchBackground({
      localMediaDataUrl: dataUrl,
      localMediaType: inferredType,
      localMediaName: normalizeText(file.name)
    });
  } catch (error) {
    console.warn("Local media import failed", error);
  }
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
function sampleImageBaseLuminanceFromElement(image) {
  if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("backdrop-luminance:image-not-ready");
  }

  const sampleSize = 24;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("backdrop-luminance:no-canvas");
  }

  ctx.drawImage(image, 0, 0, sampleSize, sampleSize);
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

    return;
  }

  const token = ++wallpaperSampleToken;
  void (async () => {
    try {
      let baseLum;
      const currentSrc = normalizeText(elements.bgImage.currentSrc || elements.bgImage.getAttribute("src"));
      const canSampleCurrentImage =
        currentSrc === source &&
        elements.bgImage.complete &&
        elements.bgImage.naturalWidth > 0 &&
        elements.bgImage.naturalHeight > 0;

      if (canSampleCurrentImage) {
        try {
          baseLum = sampleImageBaseLuminanceFromElement(elements.bgImage);
        } catch {
          baseLum = await sampleImageBaseLuminanceFromUrl(source);
        }
      } else {
        baseLum = await sampleImageBaseLuminanceFromUrl(source);
      }
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

function normalizeLocalMediaType(value, fallback = "") {
  const normalized = normalizeText(value, fallback);
  if (normalized === "image" || normalized === "video") {
    return normalized;
  }
  return fallback;
}

function inferLocalMediaTypeFromDataUrl(dataUrl) {
  const source = normalizeText(dataUrl);
  if (source.startsWith("data:image/")) {
    return "image";
  }
  if (source.startsWith("data:video/")) {
    return "video";
  }
  return "";
}

function normalizeLocalMediaFit(value, fallback = "stretch") {
  const normalized = normalizeText(value, fallback);
  if (
    normalized === "stretch" ||
    normalized === "fit-height" ||
    normalized === "fit-width" ||
    normalized === "original-resolution"
  ) {
    return normalized;
  }
  return fallback;
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
function isLoopVideoCacheRequest(request) {
  if (!request) {
    return false;
  }
  const key = typeof request === "string" ? request : request.url;
  return normalizeText(key).startsWith(VIDEO_CACHE_KEY_PREFIX);
}

async function pruneLoopVideoCache(cache, keepCount = VIDEO_CACHE_MAX_ENTRIES) {
  const boundedKeepCount = clamp(Number(keepCount) || VIDEO_CACHE_MAX_ENTRIES, 1, 24);
  const keys = await cache.keys();
  const videoKeys = keys.filter((request) => isLoopVideoCacheRequest(request));
  const overflow = Math.max(0, videoKeys.length - boundedKeepCount);
  if (!overflow) {
    return;
  }

  const staleEntries = videoKeys.slice(0, overflow);
  await Promise.all(staleEntries.map((request) => cache.delete(request)));
}

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
      await cache.put(cacheKey, cached.clone());
      try {
        await pruneLoopVideoCache(cache);
      } catch {
      }

  const response = await fetchLoopVideoResponse(remoteUrl);
  const clone = response.clone();
  await cache.put(cacheKey, clone);
  return response;
}

  try {
    await pruneLoopVideoCache(cache);
  } catch {
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
    queueSave({ allowWithoutUserMutation: true });
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
  queueSave({ allowWithoutUserMutation: true });

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
  const localMediaUrl = normalizeText(state?.ui?.background?.localMediaDataUrl);
  const remoteVideoReady = bgMode === "video" && !localMediaUrl && (state?.ui?.background?.videoSource === "reddit" || Boolean(manualUrl));
  const canRefresh = bgMode === "wallpaper" || remoteVideoReady;
  elements.bgRefreshBtn.disabled = !canRefresh;
  elements.bgRefreshBtn.classList.toggle("is-disabled", !canRefresh);
  const title = bgMode === "video" ? "Refresh local file" : "Refresh wallpaper";
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
  applyBackgroundMediaFitStyles(cfg);
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
    const localMediaUrl = normalizeText(cfg.localMediaDataUrl);
    elements.bgLayer.style.background = localMediaUrl
      ? normalizeHexColor(cfg.localMediaBackgroundColor, defaultBackground().localMediaBackgroundColor)
      : theme.background;
    const localMediaType = normalizeLocalMediaType(cfg.localMediaType, inferLocalMediaTypeFromDataUrl(localMediaUrl));
    if (localMediaUrl && localMediaType === "image") {
      elements.bgImage.src = localMediaUrl;
      elements.bgImage.classList.add("visible");
      return;
    }
    if (localMediaUrl && localMediaType === "video") {
      elements.bgVideo.src = localMediaUrl;
      elements.bgVideo.load();
      void elements.bgVideo.play().catch(() => {});
      elements.bgVideo.classList.add("visible");
      return;
    }
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

  if (elements.addWidgetTitleInput) {
    elements.addWidgetTitleInput.placeholder = `Default: ${def.title}`;
    elements.addWidgetTitleInput.value = "";
  }
}

function showAddWidgetToast(message, { duration = 2800 } = {}) {
  const toast = elements.addWidgetToast;
  const text = normalizeText(message);
  if (!toast || !text) {
    return;
  }

  if (addWidgetToastTimer) {
    clearTimeout(addWidgetToastTimer);
    addWidgetToastTimer = null;
  }

  toast.textContent = text;
  toast.classList.add("show");
  toast.setAttribute("aria-hidden", "false");

  const timeout = clamp(Math.round(Number(duration) || 2800), 1200, 8000);
  addWidgetToastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
    toast.setAttribute("aria-hidden", "true");
    addWidgetToastTimer = null;
  }, timeout);
}

function openAddWidgetModal() {
  closeBoardContextMenu();
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
  if (widgetTitleRenameState.open) {
    closeWidgetTitleRenameModal();
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
  blurFocusedElementInOverlay(elements.addWidgetModalOverlay);
  elements.addWidgetModalOverlay?.classList.remove("open");
  elements.addWidgetModalOverlay?.setAttribute("aria-hidden", "true");
  if (!modalState.open && !dockSettingsModalOpen && !shortcutIconEditorState.open && !widgetTitleRenameState.open) {
    setModalInteractionLock(false);
  }
}

function openWidgetTitleRenameModal(instanceId) {
  const instance = instanceById(instanceId);
  if (!instance || !elements.widgetTitleRenameOverlay || !elements.widgetTitleRenameInput) {
    return;
  }

  if (modalState.open || addWidgetModalOpen || dockSettingsModalOpen || shortcutIconEditorState.open) {
    return;
  }

  const def = widgetRegistry[instance.type];
  const fallbackTitle = def?.title || "Widget";

  widgetTitleRenameState.open = true;
  widgetTitleRenameState.widgetId = instance.id;
  elements.widgetTitleRenameInput.value = instance.title || fallbackTitle;
  elements.widgetTitleRenameOverlay.classList.add("open");
  elements.widgetTitleRenameOverlay.setAttribute("aria-hidden", "false");
  setModalInteractionLock(true);

  requestAnimationFrame(() => {
    elements.widgetTitleRenameInput?.focus();
    elements.widgetTitleRenameInput?.select();
  });
}

function closeWidgetTitleRenameModal() {
  if (!widgetTitleRenameState.open) {
    return;
  }

  widgetTitleRenameState.open = false;
  widgetTitleRenameState.widgetId = "";
  blurFocusedElementInOverlay(elements.widgetTitleRenameOverlay);
  elements.widgetTitleRenameOverlay?.classList.remove("open");
  elements.widgetTitleRenameOverlay?.setAttribute("aria-hidden", "true");

  if (!modalState.open && !addWidgetModalOpen && !shortcutIconEditorState.open && !dockSettingsModalOpen) {
    setModalInteractionLock(false);
  }
}

function applyWidgetTitleRenameModal() {
  if (!widgetTitleRenameState.open || !widgetTitleRenameState.widgetId) {
    return;
  }

  const instance = instanceById(widgetTitleRenameState.widgetId);
  if (!instance) {
    closeWidgetTitleRenameModal();
    return;
  }

  const def = widgetRegistry[instance.type];
  const fallbackTitle = def?.title || "Widget";
  const nextTitle = normalizeText(elements.widgetTitleRenameInput?.value, fallbackTitle);
  if (instance.title === nextTitle) {
    closeWidgetTitleRenameModal();
    return;
  }

  recordHistorySnapshot("Rename widget title");
  instance.title = nextTitle;

  const rt = runtime.get(instance.id);
  if (rt?.card) {
    const titleEl = rt.card.querySelector(".widget-title");
    if (titleEl) {
      titleEl.textContent = nextTitle;
    }
  }

  if (modalState.open && modalState.widgetId === instance.id && modalState.draft) {
    modalState.draft.title = nextTitle;
    renderWidgetModal();
  }

  if (isWidgetInContainer(instance)) {
    refreshWidgetsByType("container");
  }
  if (isWidgetDocked(instance)) {
    renderDockWidgets();
  }

  renderSettings();
  queueSave();
  closeWidgetTitleRenameModal();
}

function applyAddWidgetModal() {
  const type = elements.widgetTypeSelect?.value;
  const def = widgetRegistry[type];
  if (!def) {
    return;
  }

  const defaultSize = widgetDefaultGridSize(type, def);
  const colSpan = type === "container" ? 1 : defaultSize.colSpan;
  const rowSpan = type === "container" ? 1 : defaultSize.rowSpan;
  const title = normalizeText(elements.addWidgetTitleInput?.value, def.title);

  const added = addWidget(type, {
    colSpan,
    rowSpan,
    title
  });
  if (added) {
    closeAddWidgetModal();
  }
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
  applyLauncherHomeMetadata(home);

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

function isBoardWidgetInstance(instance) {
  return Boolean(instance && !isWidgetDocked(instance) && !isWidgetInContainer(instance));
}

function launcherPageWidgetCounts(pageCount = currentLauncherPageCount()) {
  const counts = Array.from({ length: Math.max(1, pageCount) }, () => 0);
  for (const instance of state.instances || []) {
    if (!isBoardWidgetInstance(instance)) {
      continue;
    }
    const page = normalizeWidgetPage(instance.page, pageCount, 0);
    counts[page] += 1;
  }
  return counts;
}

function isPlaceholderLauncherPage(page, pageCount = currentLauncherPageCount()) {
  return page === -1 || page === pageCount;
}

function isLauncherPlaceholderPolicyActive() {
  return state?.mode === "edit" || launcherPageUiState.dragPlaceholderPolicyActive;
}

function shouldRenderLauncherPlaceholderPage() {
  return isLauncherPlaceholderPolicyActive() || Boolean(launcherPageUiState.pendingPlaceholderDrop);
}

function setLauncherDragPlaceholderPolicy(active, { animate = false } = {}) {
  const next = Boolean(active);
  if (launcherPageUiState.dragPlaceholderPolicyActive === next) {
    return;
  }

  launcherPageUiState.dragPlaceholderPolicyActive = next;
  if (!next && state.mode !== "edit" && !launcherPageUiState.pendingPlaceholderDrop) {
    launcherPageUiState.virtualPage = null;
    renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });
  }
}

function clearPendingPlaceholderDrop({ clearVirtualPage = false } = {}) {
  launcherPageUiState.pendingPlaceholderDrop = null;
  if (clearVirtualPage) {
    launcherPageUiState.virtualPage = null;
  }
}

function currentLauncherViewportPage() {
  const pageCount = currentLauncherPageCount();
  const active = currentLauncherActivePage();
  const virtualRaw = launcherPageUiState.virtualPage;
  const hasVirtualPage = virtualRaw !== null && virtualRaw !== undefined && virtualRaw !== "";
  const virtual = hasVirtualPage ? Number(virtualRaw) : NaN;
  if (shouldRenderLauncherPlaceholderPage() && Number.isFinite(virtual)) {
    return clamp(Math.floor(virtual), -1, pageCount);
  }
  return active;
}

function setLauncherVirtualPage(page, { animate = true } = {}) {
  const pageCount = currentLauncherPageCount();
  const next = Number(page);
  if (!Number.isFinite(next) || !shouldRenderLauncherPlaceholderPage()) {
    launcherPageUiState.virtualPage = null;
    renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });
    return;
  }
  launcherPageUiState.virtualPage = clamp(Math.floor(next), -1, pageCount);
  renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });
}

function compactEmptyLauncherPagesForUseMode() {
  if (!state?.ui?.home || state.mode !== "use") {
    return false;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const pageCount = home.pageCount;
  if (pageCount <= 1) {
    return false;
  }

  const counts = launcherPageWidgetCounts(pageCount);
  const homePage = normalizeActivePage(home.homePage, pageCount, 0);
  const manualPages = normalizeLauncherPageIndexList(home.manualPages, pageCount);
  const keptPagesSet = new Set([homePage, ...manualPages]);
  for (let page = 0; page < counts.length; page += 1) {
    if (counts[page] > 0) {
      keptPagesSet.add(page);
    }
  }

  const keptPages = Array.from(keptPagesSet).sort((left, right) => left - right);

  const targetPageCount = Math.max(1, keptPages.length);
  if (targetPageCount === pageCount) {
    home.homePage = homePage;
    home.manualPages = manualPages;
    state.ui.home = home;
    return false;
  }

  const remap = new Map();
  keptPages.forEach((oldPage, nextPage) => {
    remap.set(oldPage, nextPage);
  });

  for (const instance of state.instances || []) {
    if (!isBoardWidgetInstance(instance)) {
      continue;
    }
    const oldPage = normalizeWidgetPage(instance.page, pageCount, 0);
    const nextPage = remap.get(oldPage);
    if (Number.isFinite(nextPage)) {
      instance.page = nextPage;
    }
  }

  const activePage = normalizeActivePage(home.activePage, pageCount, homePage);
  const nextActiveOldPage = resolvePageTowardHomeDirection(keptPages, activePage, homePage);
  const nextHomeOldPage = resolvePageTowardHomeDirection(keptPages, homePage, homePage);

  home.pageCount = targetPageCount;
  home.homePage = normalizeActivePage(remap.get(nextHomeOldPage), home.pageCount, 0);
  home.activePage = normalizeActivePage(remap.get(nextActiveOldPage), home.pageCount, home.homePage);
  home.manualPages = remapLauncherPageIndexList(manualPages, remap, home.pageCount);
  state.ui.home = home;
  return true;
}

function deleteLauncherPageAt(pageIndex) {
  if (state.mode !== "edit") {
    return false;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const pageCount = home.pageCount;
  if (pageCount <= 1) {
    return false;
  }

  const targetPage = normalizeWidgetPage(pageIndex, pageCount, 0);
  const homePageBefore = normalizeActivePage(home.homePage, pageCount, 0);
  const activePageBefore = normalizeActivePage(home.activePage, pageCount, homePageBefore);
  const keptOldPages = [];
  for (let page = 0; page < pageCount; page += 1) {
    if (page !== targetPage) {
      keptOldPages.push(page);
    }
  }
  const nextActiveOldPage = resolvePageTowardHomeDirection(keptOldPages, activePageBefore, homePageBefore);
  const nextHomeOldPage = resolvePageTowardHomeDirection(keptOldPages, homePageBefore, homePageBefore);

  recordHistorySnapshot("Delete launcher page");

  for (const instance of state.instances || []) {
    if (!isBoardWidgetInstance(instance)) {
      continue;
    }
    const page = normalizeWidgetPage(instance.page, pageCount, 0);
    if (page === targetPage) {
      instance.page = remapPageForDeletion(page, targetPage, pageCount - 1);
      continue;
    }
    if (page > targetPage) {
      instance.page = page - 1;
    }
  }

  home.pageCount = normalizePageCount(pageCount - 1, pageCount - 1);
  home.homePage = normalizeActivePage(
    remapPageForDeletion(nextHomeOldPage, targetPage, home.pageCount),
    home.pageCount,
    0
  );
  home.activePage = normalizeActivePage(
    remapPageForDeletion(nextActiveOldPage, targetPage, home.pageCount),
    home.pageCount,
    home.homePage
  );
  home.manualPages = shiftLauncherPageIndexListOnDelete(home.manualPages, targetPage, home.pageCount);
  state.ui.home = home;

  clearPendingPlaceholderDrop({ clearVirtualPage: true });
  refreshBoardCardsAfterLauncherPageMutation({ animate: true });
  queueSave();
  return true;
}

function queuePlaceholderPageDrop(instanceId, payload = {}, placeholderPage = null) {
  if (!isLauncherPlaceholderPolicyActive()) {
    return false;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const pageCount = home.pageCount;
  const targetPlaceholder = Number.isFinite(Number(placeholderPage))
    ? Math.floor(Number(placeholderPage))
    : Math.floor(Number(payload?.page));

  if (!isPlaceholderLauncherPage(targetPlaceholder, pageCount)) {
    return false;
  }

  const instance = instanceById(instanceId);
  if (!instance) {
    return false;
  }

  launcherPageUiState.pendingPlaceholderDrop = {
    widgetId: instance.id,
    placeholderPage: targetPlaceholder,
    clientX: Number.isFinite(payload?.clientX) ? payload.clientX : null,
    clientY: Number.isFinite(payload?.clientY) ? payload.clientY : null
  };
  launcherPageUiState.virtualPage = targetPlaceholder;
  renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
  return true;
}

function materializePendingPlaceholderPage() {
  const pending = launcherPageUiState.pendingPlaceholderDrop;
  if (!pending) {
    return false;
  }

  const instance = instanceById(pending.widgetId);
  if (!instance) {
    clearPendingPlaceholderDrop({ clearVirtualPage: true });
    renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
    return false;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const oldPageCount = home.pageCount;
  if (oldPageCount >= MAX_LAUNCHER_PAGES) {
    return false;
  }

  const addLeft = pending.placeholderPage < 0;
  const homePageBefore = normalizeActivePage(home.homePage, oldPageCount, 0);
  const manualPagesBefore = normalizeLauncherPageIndexList(home.manualPages, oldPageCount);

  recordHistorySnapshot("Create launcher page by drop");

  if (addLeft) {
    for (const entry of state.instances || []) {
      if (!isBoardWidgetInstance(entry)) {
        continue;
      }
      entry.page = normalizeWidgetPage(entry.page, oldPageCount, 0) + 1;
    }
  }

  home.pageCount = normalizePageCount(oldPageCount + 1, oldPageCount + 1);
  const targetPage = addLeft ? 0 : oldPageCount;
  home.activePage = targetPage;
  home.homePage = addLeft ? normalizeWidgetPage(homePageBefore + 1, home.pageCount, 1) : homePageBefore;
  home.manualPages = addLeft
    ? normalizeLauncherPageIndexList(manualPagesBefore.map((page) => page + 1), home.pageCount)
    : normalizeLauncherPageIndexList(manualPagesBefore, home.pageCount);
  state.ui.home = home;

  if (isWidgetDocked(instance)) {
    instance.dockOrder = null;
  }
  if (isWidgetInContainer(instance)) {
    instance.containerId = "";
  }
  normalizeDockedWidgetOrders(state.instances);
  normalizeContainerAssignments(state.instances);

  const projection = projectWidgetBoardDropLayout(
    instance,
    {
      clientX: pending.clientX,
      clientY: pending.clientY,
      page: targetPage
    },
    { pageFallback: targetPage }
  );
  if (projection) {
    instance.page = projection.page;
    instance.layout = {
      ...instance.layout,
      ...projection.layout
    };
    if (projection.gridLayout) {
      instance.gridLayout = projection.gridLayout;
    }
  } else {
    instance.page = targetPage;
  }

  state.selectedWidgetId = instance.id;
  clearPendingPlaceholderDrop({ clearVirtualPage: true });
  renderBoard();
  queueSave();
  return true;
}

function materializeLauncherPlaceholderPage(placeholderPage) {
  if (!isLauncherPlaceholderPolicyActive()) {
    return false;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const oldPageCount = home.pageCount;
  const targetPlaceholder = Number.isFinite(Number(placeholderPage))
    ? Math.floor(Number(placeholderPage))
    : oldPageCount;

  if (!isPlaceholderLauncherPage(targetPlaceholder, oldPageCount) || oldPageCount >= MAX_LAUNCHER_PAGES) {
    return false;
  }

  const addLeft = targetPlaceholder < 0;
  const homePageBefore = normalizeActivePage(home.homePage, oldPageCount, 0);
  const manualPagesBefore = normalizeLauncherPageIndexList(home.manualPages, oldPageCount);
  recordHistorySnapshot("Create empty launcher page");

  if (addLeft) {
    for (const entry of state.instances || []) {
      if (!isBoardWidgetInstance(entry)) {
        continue;
      }
      entry.page = normalizeWidgetPage(entry.page, oldPageCount, 0) + 1;
    }
  }

  home.pageCount = normalizePageCount(oldPageCount + 1, oldPageCount + 1);
  const createdPage = addLeft ? 0 : oldPageCount;
  home.activePage = createdPage;
  home.homePage = addLeft ? normalizeWidgetPage(homePageBefore + 1, home.pageCount, 1) : homePageBefore;
  home.manualPages = shiftLauncherPageIndexListOnInsert(manualPagesBefore, {
    addLeft,
    pageCount: home.pageCount,
    insertedPage: createdPage
  });
  state.ui.home = home;

  launcherPageUiState.virtualPage = null;
  clearPendingPlaceholderDrop();
  renderBoard();
  queueSave();
  return true;
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

function setDragDeleteZoneHover(hovering) {
  const next = Boolean(hovering);
  dragDeleteUiState.hovering = next;
  elements.dragDeleteZone?.classList.toggle("is-hover", next);
}

function setDragDeleteZoneActive(active) {
  const next = Boolean(active);
  dragDeleteUiState.active = next;
  elements.dragDeleteZone?.classList.toggle("is-active", next);
  elements.dragDeleteZone?.setAttribute("aria-hidden", String(!next));
  if (!next) {
    setDragDeleteZoneHover(false);
  }
}

function isPointOverDragDeleteZone(clientX, clientY) {
  if (!dragDeleteUiState.active || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return false;
  }
  const zone = elements.dragDeleteZone;
  if (!(zone instanceof HTMLElement)) {
    return false;
  }
  return pointInsideRect(clientX, clientY, zone.getBoundingClientRect());
}

function updateDragDeleteZoneHover(clientX, clientY) {
  const hovering = isPointOverDragDeleteZone(clientX, clientY);
  setDragDeleteZoneHover(hovering);
  return hovering;
}

function getPersistentDockHitRect() {
  const host = elements.persistentDock;
  const body = elements.persistentDockBody;
  if (!(host instanceof HTMLElement)) {
    return null;
  }

  const config = buildDockConfig(state?.ui?.home);
  const visibility = normalizeDockVisibility(host.dataset.visibility || config.visibility, "fixed");
  const hostRect = host.getBoundingClientRect();
  const bodyRect = body?.getBoundingClientRect();

  if (visibility === "collapsible") {
    const expanded = host.matches(":hover") || host.matches(":focus-within") || host.classList.contains("is-drop-target");
    if (!expanded) {
      const handleRect = host.querySelector(".persistent-dock-handle")?.getBoundingClientRect();
      if (handleRect) {
        return handleRect;
      }
      return hostRect;
    }
  }

  if (!(body instanceof HTMLElement) || !bodyRect) {
    return hostRect;
  }

  return {
    left: Math.min(hostRect.left, bodyRect.left),
    right: Math.max(hostRect.right, bodyRect.right),
    top: Math.min(hostRect.top, bodyRect.top),
    bottom: Math.max(hostRect.bottom, bodyRect.bottom)
  };
}

function getLauncherViewportRect() {
  const workspaceRect = elements.workspace?.getBoundingClientRect();
  if (workspaceRect) {
    return workspaceRect;
  }
  return elements.board?.getBoundingClientRect() ?? null;
}

function createWidgetDragPreview(instance, options = {}) {
  const sourceCard = options?.sourceCard;
  if (sourceCard instanceof HTMLElement) {
    const rect = sourceCard.getBoundingClientRect();
    const preview = sourceCard.cloneNode(true);
    preview.classList.remove("is-active", "dock-widget-item-dragging", "widget-drag-origin-hidden", "widget-drag-active");
    preview.classList.add("widget-drag-preview-card");
    preview.removeAttribute("aria-current");
    preview.removeAttribute("tabindex");
    preview.style.left = `${Math.round(rect.left)}px`;
    preview.style.top = `${Math.round(rect.top)}px`;
    preview.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    preview.style.height = `${Math.max(1, Math.round(rect.height))}px`;
    preview.style.position = "fixed";
    preview.style.zIndex = "9000";
    preview.style.pointerEvents = "none";

    const pointerX = Number.isFinite(Number(options?.pointerX))
      ? Number(options.pointerX)
      : Number(options?.pointerEvent?.clientX);
    const pointerY = Number.isFinite(Number(options?.pointerY))
      ? Number(options.pointerY)
      : Number(options?.pointerEvent?.clientY);
    const offsetX = Number.isFinite(pointerX) ? clamp(pointerX - rect.left, 0, rect.width) : rect.width / 2;
    const offsetY = Number.isFinite(pointerY) ? clamp(pointerY - rect.top, 0, rect.height) : rect.height / 2;

    preview.dataset.dragOffsetX = String(offsetX);
    preview.dataset.dragOffsetY = String(offsetY);

    document.body.append(preview);
    return preview;
  }

  const preview = document.createElement("div");
  preview.className = "widget-drag-preview";
  const fallbackTitle = widgetRegistry?.[instance?.type]?.title || "Widget";
  preview.textContent = normalizeText(instance?.title, fallbackTitle);
  preview.style.position = "fixed";
  preview.style.zIndex = "9000";
  preview.style.pointerEvents = "none";
  document.body.append(preview);
  return preview;
}

function positionWidgetDragPreview(preview, clientX, clientY) {
  if (!(preview instanceof HTMLElement)) {
    return;
  }
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return;
  }
  const offsetX = Number(preview.dataset.dragOffsetX);
  const offsetY = Number(preview.dataset.dragOffsetY);
  if (Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
    preview.style.left = `${Math.round(clientX - offsetX)}px`;
    preview.style.top = `${Math.round(clientY - offsetY)}px`;
    return;
  }
  preview.style.left = `${Math.round(clientX + 14)}px`;
  preview.style.top = `${Math.round(clientY + 14)}px`;
}

function createDragPreviewSession(instance, options = {}) {
  const sourceCard = options?.sourceCard;
  const pointerEvent = options?.pointerEvent;
  const pointerX = Number.isFinite(Number(options?.pointerX))
    ? Number(options.pointerX)
    : Number(pointerEvent?.clientX);
  const pointerY = Number.isFinite(Number(options?.pointerY))
    ? Number(options.pointerY)
    : Number(pointerEvent?.clientY);

  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
    return null;
  }

  const pointerId = Number.isFinite(pointerEvent?.pointerId) ? pointerEvent.pointerId : null;
  if (pointerId !== null && sourceCard instanceof HTMLElement) {
    sourceCard.setPointerCapture?.(pointerId);
  }

  const preview = createWidgetDragPreview(instance, {
    sourceCard,
    pointerEvent,
    pointerX,
    pointerY
  });
  positionWidgetDragPreview(preview, pointerX, pointerY);

  let disposed = false;
  return {
    preview,
    update(clientX, clientY) {
      positionWidgetDragPreview(preview, clientX, clientY);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (pointerId !== null && sourceCard instanceof HTMLElement) {
        sourceCard.releasePointerCapture?.(pointerId);
      }
      preview.remove();
    }
  };
}

function cssPixelValue(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clearWidgetDropGuideHost(host) {
  if (!(host instanceof HTMLElement)) {
    return;
  }
  host.classList.remove("is-drop-guide-active");
  host.removeAttribute("data-drop-guide-mode");
  host.style.removeProperty("--drop-guide-left");
  host.style.removeProperty("--drop-guide-top");
  host.style.removeProperty("--drop-guide-width");
  host.style.removeProperty("--drop-guide-height");
  host.style.removeProperty("--drop-guide-radius");
}

function clearWidgetDropGuide() {
  if (!dragGuideUiState.host) {
    return;
  }
  clearWidgetDropGuideHost(dragGuideUiState.host);
  dragGuideUiState.host = null;
}

function applyWidgetDropGuide(host, { mode = "full", rect = null, borderRadius = null } = {}) {
  if (!(host instanceof HTMLElement)) {
    clearWidgetDropGuide();
    return;
  }

  if (dragGuideUiState.host && dragGuideUiState.host !== host) {
    clearWidgetDropGuideHost(dragGuideUiState.host);
  }

  const hasSlotRect =
    mode === "slot" &&
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.w) &&
    Number.isFinite(rect.h);

  host.classList.add("is-drop-guide-active");
  host.dataset.dropGuideMode = hasSlotRect ? "slot" : "full";

  if (hasSlotRect) {
    host.style.setProperty("--drop-guide-left", `${Math.round(rect.x)}px`);
    host.style.setProperty("--drop-guide-top", `${Math.round(rect.y)}px`);
    host.style.setProperty("--drop-guide-width", `${Math.max(1, Math.round(rect.w))}px`);
    host.style.setProperty("--drop-guide-height", `${Math.max(1, Math.round(rect.h))}px`);
  } else {
    host.style.removeProperty("--drop-guide-left");
    host.style.removeProperty("--drop-guide-top");
    host.style.removeProperty("--drop-guide-width");
    host.style.removeProperty("--drop-guide-height");
  }

  if (Number.isFinite(borderRadius)) {
    host.style.setProperty("--drop-guide-radius", `${Math.max(0, Math.round(borderRadius))}px`);
  } else {
    host.style.removeProperty("--drop-guide-radius");
  }

  dragGuideUiState.host = host;
}

function boardPageDropGuideRect(page) {
  const board = elements.board;
  if (!(board instanceof HTMLElement)) {
    return null;
  }
  return {
    x: widgetPageOffsetX(page),
    y: 0,
    w: Math.max(1, Math.round(board.clientWidth || 1)),
    h: Math.max(1, Math.round(board.clientHeight || 1))
  };
}

function projectedBoardSlotRect(layout, page = 0) {
  if (!layout) {
    return null;
  }
  return {
    x: Math.round((Number(layout.x) || 0) + widgetPageOffsetX(page)),
    y: Math.round(Number(layout.y) || 0),
    w: Math.max(1, Math.round(Number(layout.w) || 1)),
    h: Math.max(1, Math.round(Number(layout.h) || 1))
  };
}

function dockDropGuideSlotRect(draggedInstance, clientX, clientY) {
  const slotIndex = resolveDockDropSlotIndex(clientX, clientY, draggedInstance);
  if (slotIndex === null) {
    return null;
  }
  return dockSlotRectRelativeToHost(slotIndex);
}

function containerDropGuideSlotRect(containerId, draggedInstance, host, pointer = {}) {
  if (!(host instanceof HTMLElement) || !host.classList.contains("widget-folder-panel") || !draggedInstance) {
    return null;
  }

  const body = host.querySelector(".widget-folder-panel-body");
  if (!(body instanceof HTMLElement)) {
    return null;
  }

  const targetContainerId = normalizeContainerId(containerId);
  if (!targetContainerId) {
    return null;
  }

  const containerInstance = instanceById(targetContainerId);
  if (!containerInstance || containerInstance.type !== "container") {
    return null;
  }

  const draggedId = normalizeText(draggedInstance.id);
  if (!draggedId) {
    return null;
  }

  const containerSpan = resolveContainerSpan(containerInstance);
  const cols = Math.max(1, Math.floor(containerSpan.cols || 1));
  const rows = Math.max(1, Math.floor(containerSpan.rows || 1));
  const occupancy = Array.from({ length: rows }, () => Array(cols).fill(false));

  const siblingIds = [];
  const siblingIdSet = new Set();
  const pushSiblingId = (value) => {
    const id = normalizeText(value);
    if (!id || id === draggedId || siblingIdSet.has(id)) {
      return;
    }
    siblingIdSet.add(id);
    siblingIds.push(id);
  };

  const panelCards = Array.from(body.querySelectorAll(".widget-folder-item-card[data-widget-id]"));
  for (const card of panelCards) {
    pushSiblingId(card?.dataset?.widgetId);
  }

  if (!siblingIds.length) {
    for (const item of state.instances || []) {
      if (!item || item.enabled === false || item.type === "container") {
        continue;
      }
      if (normalizeContainerId(item.containerId) !== targetContainerId) {
        continue;
      }
      pushSiblingId(item.id);
    }
  }

  const insertIndex = resolveContainerInsertIndexFromPointer(targetContainerId, pointer?.clientX, pointer?.clientY, {
    excludeWidgetId: draggedId,
    panelElement: body
  });
  const clampedInsertIndex = clamp(Math.round(Number(insertIndex) || 0), 0, siblingIds.length);

  const orderedIds = siblingIds.slice();
  orderedIds.splice(clampedInsertIndex, 0, draggedId);

  const orderedWidgets = [];
  for (const widgetId of orderedIds) {
    const widget = instanceById(widgetId);
    if (!widget || widget.enabled === false || widget.type === "container") {
      continue;
    }
    if (normalizeText(widget.id) !== draggedId && normalizeContainerId(widget.containerId) !== targetContainerId) {
      continue;
    }
    orderedWidgets.push(widget);
  }

  const canFit = (row, col, rowSpan, colSpan) => {
    if (row < 0 || col < 0 || row + rowSpan > rows || col + colSpan > cols) {
      return false;
    }
    for (let y = row; y < row + rowSpan; y += 1) {
      for (let x = col; x < col + colSpan; x += 1) {
        if (occupancy[y][x]) {
          return false;
        }
      }
    }
    return true;
  };

  const occupy = (row, col, rowSpan, colSpan) => {
    for (let y = row; y < row + rowSpan; y += 1) {
      for (let x = col; x < col + colSpan; x += 1) {
        occupancy[y][x] = true;
      }
    }
  };

  let targetPlacement = null;

  for (const item of orderedWidgets) {
    const itemId = normalizeText(item.id);
    const span = resolveWidgetSpanInContainer(item, containerSpan);
    const colSpan = clamp(Math.round(span.cols || 1), 1, cols);
    const rowSpan = clamp(Math.round(span.rows || 1), 1, rows);

    let placed = null;
    for (let row = 0; row < rows && !placed; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!canFit(row, col, rowSpan, colSpan)) {
          continue;
        }
        placed = { row, col };
        break;
      }
    }

    if (!placed) {
      continue;
    }

    occupy(placed.row, placed.col, rowSpan, colSpan);

    if (itemId === draggedId) {
      targetPlacement = {
        row: placed.row,
        col: placed.col,
        rowSpan,
        colSpan
      };
      break;
    }
  }

  if (!targetPlacement) {
    return null;
  }

  const hostRect = host.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  const bodyStyle = window.getComputedStyle(body);
  const gapX = cssPixelValue(bodyStyle.columnGap, cssPixelValue(bodyStyle.gap, 0));
  const gapY = cssPixelValue(bodyStyle.rowGap, cssPixelValue(bodyStyle.gap, 0));
  const padLeft = cssPixelValue(bodyStyle.paddingLeft, 0);
  const padRight = cssPixelValue(bodyStyle.paddingRight, 0);
  const padTop = cssPixelValue(bodyStyle.paddingTop, 0);
  const padBottom = cssPixelValue(bodyStyle.paddingBottom, 0);

  const usableWidth = Math.max(1, bodyRect.width - padLeft - padRight - gapX * Math.max(0, cols - 1));
  const usableHeight = Math.max(1, bodyRect.height - padTop - padBottom - gapY * Math.max(0, rows - 1));
  const cellW = usableWidth / cols;
  const cellH = usableHeight / rows;
  if (!Number.isFinite(cellW) || !Number.isFinite(cellH) || cellW <= 0 || cellH <= 0) {
    return null;
  }

  const bodyLocalLeft = bodyRect.left - hostRect.left;
  const bodyLocalTop = bodyRect.top - hostRect.top;

  return {
    x: Math.round(bodyLocalLeft + padLeft + targetPlacement.col * (cellW + gapX)),
    y: Math.round(bodyLocalTop + padTop + targetPlacement.row * (cellH + gapY)),
    w: Math.max(1, Math.round(cellW * targetPlacement.colSpan + gapX * Math.max(0, targetPlacement.colSpan - 1))),
    h: Math.max(1, Math.round(cellH * targetPlacement.rowSpan + gapY * Math.max(0, targetPlacement.rowSpan - 1))),
    borderRadius: 10
  };
}

function createWidgetDropSilhouette(sourceElement = null, options = {}) {
  const silhouette = document.createElement("div");
  silhouette.className = "widget-drop-silhouette";
  silhouette.style.position = "fixed";
  silhouette.style.zIndex = "8990";

  const sourceRect = sourceElement?.getBoundingClientRect?.();
  if (sourceRect) {
    silhouette.style.width = `${Math.max(1, Math.round(sourceRect.width))}px`;
    silhouette.style.height = `${Math.max(1, Math.round(sourceRect.height))}px`;
    const radius = (() => {
      if (Number.isFinite(Number(options?.borderRadius))) {
        return Math.max(0, Math.round(Number(options.borderRadius)));
      }

      if (!sourceElement || !Number.isFinite(sourceRect.width) || !Number.isFinite(sourceRect.height)) {
        return NaN;
      }

      const sourceStyle = typeof window === "undefined" ? null : window.getComputedStyle?.(sourceElement);
      const rawRadius = Number.parseFloat(String(sourceStyle?.borderRadius || "0"));
      if (Number.isFinite(rawRadius)) {
        return Math.max(0, Math.round(rawRadius));
      }

      return NaN;
    })();

    if (Number.isFinite(radius) && radius > 0) {
      silhouette.style.borderRadius = `${radius}px`;
    }
  }

  document.body.append(silhouette);
  return silhouette;
}

function setWidgetDropSilhouetteVisible(silhouette, visible) {
  if (!(silhouette instanceof HTMLElement)) {
    return;
  }
  silhouette.classList.toggle("is-visible", Boolean(visible));
}

function positionWidgetDropSilhouette(silhouette, layout, page = 0) {
  if (!(silhouette instanceof HTMLElement) || !layout) {
    return;
  }

  const boardRect = elements.board?.getBoundingClientRect();
  if (!boardRect) {
    return;
  }

  const boardX = Math.round((Number(layout.x) || 0) + widgetPageOffsetX(page));
  const boardY = Math.round(Number(layout.y) || 0);
  silhouette.style.left = `${Math.round(boardRect.left + boardX)}px`;
  silhouette.style.top = `${Math.round(boardRect.top + boardY)}px`;
  silhouette.style.width = `${Math.max(1, Math.round(Number(layout.w) || 1))}px`;
  silhouette.style.height = `${Math.max(1, Math.round(Number(layout.h) || 1))}px`;
}

function updateWidgetDragGuideAtPointer(
  draggedInstance,
  clientX,
  clientY,
  { boardLayout = null, boardPage = null, showGuide = true } = {}
) {
  if (!draggedInstance || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return {
      containerDropTargetId: "",
      dockDropActive: false
    };
  }

  const containerDropTargetId = containerDropTargetAtPoint(clientX, clientY, draggedInstance);
  const dockDropActive = !containerDropTargetId && isDockDropPoint(clientX, clientY);

  setContainerDropTargetActive(containerDropTargetId);
  setDockDropTargetActive(dockDropActive);

  if (!showGuide) {
    clearWidgetDropGuide();
    return {
      containerDropTargetId,
      dockDropActive
    };
  }

  const freeMode = !isGridLayoutMode();

  if (containerDropTargetId) {
    const entry = containerDropUiState.targets.get(containerDropTargetId);
    const host = entry?.element;
    if (host instanceof HTMLElement) {
      if (freeMode) {
        applyWidgetDropGuide(host, { mode: "full" });
      } else {
        const rect = containerDropGuideSlotRect(containerDropTargetId, draggedInstance, host, {
          clientX,
          clientY
        });
        if (rect) {
          applyWidgetDropGuide(host, {
            mode: "slot",
            rect,
            borderRadius: rect.borderRadius
          });
        } else {
          applyWidgetDropGuide(host, { mode: "full" });
        }
      }
    } else {
      clearWidgetDropGuide();
    }

    return {
      containerDropTargetId,
      dockDropActive
    };
  }

  if (dockDropActive) {
    const host = elements.persistentDockBody ?? elements.persistentDock;
    if (!(host instanceof HTMLElement)) {
      clearWidgetDropGuide();
    } else if (freeMode) {
      applyWidgetDropGuide(host, { mode: "full" });
    } else {
      const rect = dockDropGuideSlotRect(draggedInstance, clientX, clientY);
      if (rect) {
        applyWidgetDropGuide(host, {
          mode: "slot",
          rect,
          borderRadius: rect.borderRadius
        });
      } else {
        applyWidgetDropGuide(host, { mode: "full" });
      }
    }

    return {
      containerDropTargetId,
      dockDropActive
    };
  }

  const board = elements.board;
  if (!(board instanceof HTMLElement)) {
    clearWidgetDropGuide();
    return {
      containerDropTargetId,
      dockDropActive
    };
  }

  const resolvedBoardPage = Number.isFinite(boardPage) ? boardPage : draggedInstance.page;

  if (freeMode) {
    const rect = boardPageDropGuideRect(resolvedBoardPage);
    if (rect) {
      applyWidgetDropGuide(board, {
        mode: "full",
        rect,
        borderRadius: 14
      });
    } else {
      applyWidgetDropGuide(board, { mode: "full" });
    }
  } else {
    const fallbackLayout = {
      x: Number(draggedInstance.layout?.x) || 0,
      y: Number(draggedInstance.layout?.y) || 0,
      w: Number(draggedInstance.layout?.w) || 1,
      h: Number(draggedInstance.layout?.h) || 1
    };
    const rect = projectedBoardSlotRect(boardLayout || fallbackLayout, resolvedBoardPage);
    if (rect) {
      applyWidgetDropGuide(board, {
        mode: "slot",
        rect,
        borderRadius: 12
      });
    } else {
      clearWidgetDropGuide();
    }
  }

  return {
    containerDropTargetId,
    dockDropActive
  };
}

function clearWidgetDragGuideState() {
  setDockDropTargetActive(false);
  setContainerDropTargetActive("");
  clearWidgetDropGuide();
}

function registerContainerDropTarget(containerId, element, options = {}) {
  const id = normalizeContainerId(containerId);
  if (!id || !(element instanceof HTMLElement)) {
    return;
  }
  containerDropUiState.targets.set(id, {
    element,
    acceptCollapsed: options?.acceptCollapsed === true
  });
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
    if (targetInstance.config?.expanded !== true && entry?.acceptCollapsed !== true) {
      continue;
    }
    if (draggedInstance && !canPlaceWidgetInContainer(draggedInstance.id, targetInstance.id)) {
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
  const dockRect = getPersistentDockHitRect();
  if (!dockRect) {
    return false;
  }
  return pointInsideRect(x, y, dockRect);
}

function resolveDockInsertIndexFromPointer(clientX, draggedWidgetId = "") {
  const docked = dockedInstances(state.instances);
  const normalizedDraggedId = normalizeText(draggedWidgetId);
  const ordered = normalizedDraggedId
    ? docked.filter((item) => String(item.id) !== normalizedDraggedId)
    : docked;

  if (!ordered.length) {
    return 0;
  }

  const strip = elements.dockWidgetStrip;
  if (!(strip instanceof HTMLElement)) {
    return ordered.length;
  }

  const buttonById = new Map(
    Array.from(strip.querySelectorAll(".dock-widget-item")).map((button) => [normalizeText(button.dataset.widgetId), button])
  );

  if (!Number.isFinite(clientX)) {
    return ordered.length;
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const id = String(ordered[index].id);
    const button = buttonById.get(id);
    if (!(button instanceof HTMLElement)) {
      continue;
    }
    const rect = button.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    if (clientX < midpoint) {
      return index;
    }
  }

  return ordered.length;
}

function setDockWidgetOrderByIndex(widgetId, insertIndex, { record = true } = {}) {
  const id = normalizeText(widgetId);
  const instance = instanceById(id);
  if (!id || !instance || !isWidgetDocked(instance)) {
    return false;
  }

  const docked = dockedInstances(state.instances);
  const currentIndex = docked.findIndex((item) => String(item.id) === id);
  if (currentIndex < 0) {
    return false;
  }

  const without = docked.filter((item) => String(item.id) !== id);
  const targetIndex = clamp(Math.round(Number(insertIndex) || 0), 0, without.length);
  if (currentIndex === targetIndex) {
    return false;
  }

  if (record) {
    recordHistorySnapshot("Reorder dock widget");
  } else {
    touchUserMutationClock();
  }

  without.splice(targetIndex, 0, instance);
  for (let i = 0; i < without.length; i += 1) {
    without[i].dockOrder = i;
  }
  return true;
}

function resolveContainerInsertIndexFromPointer(
  containerId,
  clientX,
  clientY,
  { excludeWidgetId = "", panelElement = null, cardSelector = ".widget-folder-item-card[data-widget-id]" } = {}
) {
  const targetId = normalizeContainerId(containerId);
  if (!targetId) {
    return 0;
  }

  const resolvedPanelElement = (() => {
    if (panelElement instanceof HTMLElement) {
      return panelElement;
    }
    const entry = containerDropUiState.targets.get(targetId);
    const host = entry?.element;
    if (!(host instanceof HTMLElement)) {
      return null;
    }
    if (host.classList.contains("widget-folder-panel")) {
      const body = host.querySelector(".widget-folder-panel-body");
      return body instanceof HTMLElement ? body : host;
    }
    return host;
  })();

  const cards =
    resolvedPanelElement instanceof HTMLElement
      ? Array.from(resolvedPanelElement.querySelectorAll(cardSelector))
      : [];
  const filteredCards = cards.filter((card) => {
    const cardWidgetId = normalizeText(card?.dataset?.widgetId);
    return cardWidgetId && cardWidgetId !== normalizeText(excludeWidgetId);
  });

  if (filteredCards.length && Number.isFinite(clientX) && Number.isFinite(clientY)) {
    for (let index = 0; index < filteredCards.length; index += 1) {
      const rect = filteredCards[index].getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const centerX = rect.left + rect.width / 2;
      if (clientY < centerY || (Math.abs(clientY - centerY) <= Math.max(6, rect.height * 0.25) && clientX < centerX)) {
        return index;
      }
    }
    return filteredCards.length;
  }

  const siblings = (state.instances || []).filter((entry) => {
    if (!entry || entry.type === "container") {
      return false;
    }
    if (normalizeContainerId(entry.containerId) !== targetId) {
      return false;
    }
    return normalizeText(entry.id) !== normalizeText(excludeWidgetId);
  });
  return siblings.length;
}

function tryContainerWidgetByDrop(instance, pointerEvent, { record = true } = {}) {
  if (!instance || !pointerEvent) {
    return false;
  }

  const targetContainerId = containerDropTargetAtPoint(pointerEvent.clientX, pointerEvent.clientY, instance);
  if (!targetContainerId) {
    return false;
  }

  const insertIndex = resolveContainerInsertIndexFromPointer(targetContainerId, pointerEvent.clientX, pointerEvent.clientY, {
    excludeWidgetId: instance.id,
    panelElement: pointerEvent?.panelElement
  });

  if (normalizeContainerId(instance.containerId) === targetContainerId) {
    return reorderWidgetInContainerByIndex(instance.id, targetContainerId, insertIndex, {
      record,
      rerender: true,
      save: true
    });
  }

  const sourceBoardPage = isBoardWidgetInstance(instance)
    ? normalizeWidgetPage(instance.page, currentLauncherPageCount(), currentLauncherActivePage())
    : null;

  const moved = setWidgetContainer(instance.id, targetContainerId, {
    record,
    rerender: false,
    save: false
  });
  if (!moved) {
    return false;
  }

  reorderWidgetInContainerByIndex(instance.id, targetContainerId, insertIndex, {
    record: false,
    rerender: false,
    save: false
  });

  if (Number.isFinite(sourceBoardPage)) {
    compactEmptyLauncherPagesForUseMode();
  }

  renderBoard();
  renderSettings();
  queueSave();
  return true;
}

function setDockDropTargetActive(active) {
  elements.persistentDock?.classList.toggle("is-drop-target", Boolean(active));
}

function tryDockWidgetByDrop(instance, pointerEvent, { record = true } = {}) {
  if (!instance || !pointerEvent || !isDockDropPoint(pointerEvent.clientX, pointerEvent.clientY)) {
    return false;
  }
  if (!isDockEligibleWidget(instance)) {
    return false;
  }

  const wasDocked = isWidgetDocked(instance);
  const wasInContainer = isWidgetInContainer(instance);
  const sourceBoardPage = !wasDocked && !wasInContainer
    ? normalizeWidgetPage(instance.page, currentLauncherPageCount(), currentLauncherActivePage())
    : null;
  const targetSlot = resolveDockDropSlotIndex(pointerEvent.clientX, pointerEvent.clientY, instance);
  if (targetSlot === null) {
    return false;
  }

  if (record) {
    if (wasDocked) {
      recordHistorySnapshot("Move dock widget");
    } else if (wasInContainer) {
      recordHistorySnapshot("Move widget from folder to dock");
    } else {
      recordHistorySnapshot("Dock widget");
    }
  } else {
    touchUserMutationClock();
  }

  const moved = moveWidgetToDockSlot(instance, targetSlot, { record: false });
  if (!moved) {
    return false;
  }
  renderDockWidgets();

  if (Number.isFinite(sourceBoardPage)) {
    compactEmptyLauncherPagesForUseMode();
  }
  return true;
}

function applyWidgetDropPlan(instance, plan, payload = {}, { record = true } = {}) {
  if (!instance || !plan || plan.kind === DROP_PLAN_KIND.NONE) {
    return false;
  }

  if (plan.kind === DROP_PLAN_KIND.DELETE_ZONE) {
    clearPendingPlaceholderDrop({ clearVirtualPage: true });
    removeWidget(instance.id);
    return true;
  }

  if (!isContainerDropPlan(plan) && !isBoardRealPageDropPlan(plan) && !isBoardPlaceholderDropPlan(plan)) {
    return false;
  }

  if (isContainerDropPlan(plan)) {
    clearPendingPlaceholderDrop({ clearVirtualPage: true });
    if (plan.space.container.kind === DROP_CONTAINER_KIND.DOCK) {
      const moved = tryDockWidgetByDrop(instance, payload, { record });
      if (moved) {
        renderBoard();
        queueSave();
      }
      return moved;
    }

    if (plan.space.container.kind === DROP_CONTAINER_KIND.FOLDER) {
      return tryContainerWidgetByDrop(instance, payload, { record });
    }
    return false;
  }

  if (isBoardPlaceholderDropPlan(plan)) {
    const pageCount = currentLauncherPageCount();
    const edge = plan.space.board.edge;
    const placeholderPage = Number.isFinite(Number(plan.space.board.internalPlaceholderPage))
      ? Math.floor(Number(plan.space.board.internalPlaceholderPage))
      : internalPlaceholderFromPlaceholderEdge(edge, pageCount);
    return queuePlaceholderPageDrop(
      instance.id,
      {
        ...payload,
        page: placeholderPage
      },
      placeholderPage
    );
  }

  if (isBoardRealPageDropPlan(plan)) {
    clearPendingPlaceholderDrop({ clearVirtualPage: true });
    const targetPage = normalizeWidgetPage(plan.space.board.internalPage, currentLauncherPageCount(), currentLauncherActivePage());
    const boardPayload = {
      ...payload,
      page: targetPage
    };
    if (isWidgetDocked(instance)) {
      return releaseWidgetFromDockByDrop(instance.id, boardPayload);
    }
    if (isWidgetInContainer(instance)) {
      return releaseWidgetFromContainerByDrop(instance.id, boardPayload);
    }

    const targetLayoutPatch =
      plan.projection?.layout && typeof plan.projection.layout === "object"
        ? plan.projection.layout
        : null;
    const targetGridLayout =
      plan.projection?.gridLayout && typeof plan.projection.gridLayout === "object"
        ? plan.projection.gridLayout
        : null;

    const nextLayout = targetLayoutPatch
      ? {
          ...instance.layout,
          ...targetLayoutPatch
        }
      : instance.layout;

    const layoutChanged =
      nextLayout.x !== instance.layout.x ||
      nextLayout.y !== instance.layout.y ||
      nextLayout.w !== instance.layout.w ||
      nextLayout.h !== instance.layout.h;

    const gridChanged = Boolean(targetGridLayout) && (
      !instance.gridLayout ||
      instance.gridLayout.col !== targetGridLayout.col ||
      instance.gridLayout.row !== targetGridLayout.row ||
      instance.gridLayout.colSpan !== targetGridLayout.colSpan ||
      instance.gridLayout.rowSpan !== targetGridLayout.rowSpan
    );

    const changed = targetPage !== instance.page || layoutChanged || gridChanged;
    if (!changed) {
      return false;
    }

    if (record) {
      recordHistorySnapshot("Move widget");
    } else {
      touchUserMutationClock();
    }

    instance.page = targetPage;
    if (targetLayoutPatch) {
      instance.layout = nextLayout;
    }
    if (targetGridLayout) {
      instance.gridLayout = targetGridLayout;
    }
    state.ui.home.activePage = targetPage;

    if (isGridLayoutMode()) {
      applyGridLayout({ commitFreeLayout: false, shouldSave: false });
    } else {
      const rt = runtime.get(instance.id);
      if (rt?.card) {
        applyLayout(rt.card, instance.layout, instance.page);
        if (instance.type === "container") {
          rt.controller?.refresh?.();
        }
      }
      renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
    }

    compactEmptyLauncherPagesForUseMode();
    renderSettings();
    queueSave();
    return true;
  }

  return false;
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
  const dockBody = elements.persistentDockBody;

  if (!config?.enabled || !dock || dock.classList.contains("is-disabled")) {
    root.style.setProperty("--persistent-dock-height", "0px");
    root.style.setProperty("--persistent-dock-content-padding", "0px");
    root.style.setProperty("--persistent-dock-clearance", "0px");
    return;
  }

  const measured = Math.ceil((dockBody ?? dock).getBoundingClientRect().height || 0);
  const dockHeight = Math.max(config.heightPx, measured);
  const visibility = normalizeDockVisibility(config.visibility, "fixed");
  const contentPadding = visibility === "collapsible" ? 0 : dockHeight + 12;

  root.style.setProperty("--persistent-dock-height", `${dockHeight}px`);
  root.style.setProperty("--persistent-dock-content-padding", `${contentPadding}px`);
  root.style.setProperty("--persistent-dock-clearance", `${contentPadding}px`);
}

function destroyDockEmbeddedControllers() {
  for (const entry of dockEmbeddedUiState.controllers.values()) {
    entry?.destroy?.();
  }
  dockEmbeddedUiState.controllers.clear();
}

function renderDockWidgets() {
  const strip = elements.dockWidgetStrip;
  if (!strip) {
    return;
  }

  destroyDockEmbeddedControllers();
  strip.replaceChildren();
  const changedByNormalization = normalizeDockedWidgetOrders(state.instances, state?.ui?.home);
  if (changedByNormalization) {
    renderBoard();
  }
  const config = buildDockConfig(state?.ui?.home);
  const horizontalDock = isHorizontalDock(config);
  const items = dockedInstances();
  strip.classList.toggle("is-empty", items.length === 0);

  if (!items.length) {
    dockUiState.activeId = "";
    syncDockOverflowState();
    return;
  }

  const activeId = normalizeDockActiveId(items);
  dockUiState.activeId = activeId;

  for (const item of items) {
    const slotIndex = normalizeDockOrder(item.dockOrder, null);
    if (slotIndex === null || slotIndex < 0 || slotIndex >= config.lengthUnits) {
      continue;
    }

    const label = normalizeText(item.title, widgetRegistry?.[item.type]?.title || "Widget");

    const card = document.createElement("article");
    card.className = "dock-widget-item widget-card widget-folder-item-card";
    card.dataset.widgetId = item.id;
    card.dataset.widgetType = item.type;
    card.dataset.dockSlot = String(slotIndex);
    card.style.gridColumnStart = horizontalDock ? String(slotIndex + 1) : "1";
    card.style.gridRowStart = horizontalDock ? "1" : String(slotIndex + 1);
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", label);
    card.title = label;

    const shell = document.createElement("div");
    shell.className = "widget-shell";

    const body = document.createElement("section");
    body.className = "widget-body";

    const host = document.createElement("div");
    host.className = "widget-content-host";

    const slot = document.createElement("div");
    slot.className = "widget-content-slot dock-widget-content";

    host.append(slot);
    body.append(host);
    shell.append(body);
    card.append(shell);

    applyCardVisual(card, item);

    const def = widgetRegistry[item.type];
    if (def && typeof def.create === "function") {
      const controller = def.create({
        container: slot,
        getConfig: () => item.config,
        getUi: () => state.ui,
        getWidget: () => item,
        getAllWidgets: () => state.instances,
        getWidgetDefinition: (type) => widgetRegistry[type] || null,
        getGridMetrics: () => gridMetrics(),
        getWidgetRuntimeCard: (widgetId) => runtime.get(widgetId)?.card || null,
        patchConfig: (patch, options = {}) => patchWidgetConfig(item.id, patch, options),
        patchWidgetConfigById: (widgetId, patch, options = {}) => patchWidgetConfig(widgetId, patch, options),
        setWidgetContainer: (widgetId, containerId) => setWidgetContainer(widgetId, containerId),
        releaseWidgetFromContainerByDrop: (widgetId, payload) => releaseWidgetFromContainerByDrop(widgetId, payload),
        reorderWidgetInContainerByIndex: (widgetId, containerId, index, options = {}) =>
          reorderWidgetInContainerByIndex(widgetId, containerId, index, options),
        resolveContainerInsertIndexFromPointer: (containerId, clientX, clientY, options = {}) =>
          resolveContainerInsertIndexFromPointer(containerId, clientX, clientY, options),
        tryContainerWidgetByDrop: (widget, pointerEvent, options = {}) => tryContainerWidgetByDrop(widget, pointerEvent, options),
        tryDockWidgetByDrop: (widget, pointerEvent, options = {}) => tryDockWidgetByDrop(widget, pointerEvent, options),
        projectWidgetBoardDropLayout: (widget, payload = {}, options = {}) =>
          projectWidgetBoardDropLayout(widget, payload, options),
        updateCrossSurfaceDropIndicators: (widget, clientX, clientY, options = {}) =>
          updateCrossSurfaceDropIndicators(widget, clientX, clientY, options),
        renderBoardViewport,
        setActiveLauncherPage,
        currentLauncherActivePage,
        currentLauncherPageCount,
        registerContainerDropTarget: (containerId, element, options = {}) =>
          registerContainerDropTarget(containerId, element, options),
        unregisterContainerDropTarget: (containerId) => unregisterContainerDropTarget(containerId),
        createDragPreviewSession: (widget, options = {}) => createDragPreviewSession(widget, options),
        createWidgetDragPreview: (widget, options = {}) => createWidgetDragPreview(widget, options),
        positionWidgetDragPreview,
        updateWidgetDragGuideAtPointer: (widget, clientX, clientY, options = {}) =>
          updateWidgetDragGuideAtPointer(widget, clientX, clientY, options),
        clearWidgetDragGuideState,
        projectWidgetBoardDropLayout: (widget, clientX, clientY, options = {}) =>
          projectWidgetBoardDropLayout(widget, clientX, clientY, options),
        dropWidgetToContainerByPointer: (widget, pointerEvent, options = {}) =>
          tryContainerWidgetByDrop(widget, pointerEvent, options),
        dropWidgetToDockByPointer: (widget, pointerEvent, options = {}) => {
          const moved = tryDockWidgetByDrop(widget, pointerEvent, options);
          if (moved) {
            renderBoard();
            queueSave();
          }
          return moved;
        },
        isEditMode: () => state.mode === "edit",
        openSettings: () => {
          if (state.mode !== "edit") {
            return;
          }
          setSelected(item.id);
          openWidgetModal(item.id);
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

      dockEmbeddedUiState.controllers.set(item.id, {
        destroy() {
          controller?.destroy?.();
        }
      });
    } else {
      const fallback = document.createElement("span");
      fallback.className = "dock-item-icon";
      fallback.textContent = normalizeText(label).slice(0, 1).toUpperCase() || "W";
      slot.append(fallback);
    }

    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      if (event.target.closest("button, input, textarea, select, [contenteditable='true']")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeBoardContextMenu();

      card.classList.add("widget-drag-active");


      const previewSession = createDragPreviewSession(item, {
        sourceCard: card,
        pointerEvent: event,
        pointerX: event.clientX,
        pointerY: event.clientY
      });
      if (!previewSession) {
        card.classList.remove("widget-drag-active");
        return;
      }

      card.classList.add("dock-widget-item-dragging");
      card.classList.add("widget-drag-origin-hidden");
      card.style.animation = "widget-drag-jiggle 340ms cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite";
      card.style.transformOrigin = "50% 0%";
      setLauncherDragPlaceholderPolicy(true);
      const sourceCard = runtime.get(item.id)?.card;
      sourceCard?.classList.add("widget-drag-active");
      sourceCard?.classList.add("widget-drag-origin-hidden");

      const dropSilhouette = createWidgetDropSilhouette(sourceCard || card);
      setDragDeleteZoneActive(true);

      let lastPointerX = event.clientX;
      let lastPointerY = event.clientY;
      updateDragDeleteZoneHover(lastPointerX, lastPointerY);
      const pageSwitchThreshold = 42;
      const pageSwitchHoldMs = 280;
      const pageSwitchCooldownMs = 190;
      let lastPageSwitchAt = 0;
      let pendingPageSwitchDirection = 0;
      let pendingPageSwitchSince = 0;
      let pendingPageSwitchTimer = 0;
      let dragReleasePage = currentLauncherActivePage();
      let lastDropPlan = createNoneDropPlan();

      const edgeDirectionFromPointer = (clientX) => {
        const viewportRect = getLauncherViewportRect();
        if (!viewportRect || !Number.isFinite(clientX) || viewportRect.width < pageSwitchThreshold * 2) {
          return 0;
        }
        if (clientX <= viewportRect.left + pageSwitchThreshold) {
          return -1;
        }
        if (clientX >= viewportRect.right - pageSwitchThreshold) {
          return 1;
        }
        return 0;
      };

      const resetPendingPageSwitch = () => {
        pendingPageSwitchDirection = 0;
        pendingPageSwitchSince = 0;
        if (pendingPageSwitchTimer) {
          window.clearTimeout(pendingPageSwitchTimer);
          pendingPageSwitchTimer = 0;
        }
      };

      const commitPageSwitch = (direction) => {
        if (!direction) {
          return false;
        }

        const now = performance.now();
        if (now - lastPageSwitchAt < pageSwitchCooldownMs) {
          return false;
        }

        const home = syncLauncherPagingState({ expandToFitInstances: true });
        let pageCount = home.pageCount;
        const minPage = isLauncherPlaceholderPolicyActive() ? -1 : 0;
        let nextPage = dragReleasePage + direction;

        const maxPage = isLauncherPlaceholderPolicyActive() ? pageCount : pageCount - 1;

        if (nextPage < minPage || nextPage > maxPage) {
          return false;
        }

        dragReleasePage = nextPage;
        lastPageSwitchAt = now;

        if (isPlaceholderLauncherPage(nextPage, currentLauncherPageCount())) {
          setLauncherVirtualPage(nextPage, { animate: true });
        } else {
          launcherPageUiState.virtualPage = null;
          setActiveLauncherPage(nextPage, { shouldSave: false, animate: true });
        }
        return true;
      };

      const schedulePageSwitch = (direction) => {
        if (!direction) {
          resetPendingPageSwitch();
          return false;
        }

        if (direction === pendingPageSwitchDirection && pendingPageSwitchTimer) {
          return false;
        }

        resetPendingPageSwitch();
        pendingPageSwitchDirection = direction;
        pendingPageSwitchSince = performance.now();
        pendingPageSwitchTimer = window.setTimeout(() => {
          pendingPageSwitchTimer = 0;
          const currentDirection = edgeDirectionFromPointer(lastPointerX);
          if (currentDirection !== direction) {
            resetPendingPageSwitch();
            return;
          }

          const switched = commitPageSwitch(direction);
          if (switched) {
            schedulePageSwitch(direction);
            return;
          }

          resetPendingPageSwitch();
        }, pageSwitchHoldMs);

        return false;
      };

      const updateGhost = (clientX, clientY) => {
        previewSession.update(clientX, clientY);
        lastPointerX = clientX;
        lastPointerY = clientY;
        const insideDock = isDockDropPoint(clientX, clientY);
        elements.persistentDock?.classList.toggle("is-drag-out-active", !insideDock);

        if (!insideDock) {
          schedulePageSwitch(edgeDirectionFromPointer(clientX));
        }

        const boardProjection = isPlaceholderLauncherPage(dragReleasePage, currentLauncherPageCount())
          ? null
          : projectWidgetBoardDropLayout(item, {
            clientX,
            clientY,
            page: dragReleasePage
          }, {
            pageFallback: dragReleasePage
          });

        const nextDropPlan = resolveWidgetDropPlan(item, {
          clientX,
          clientY,
          page: dragReleasePage
        }, {
          boardProjection,
          suppressSurfaceTargets: false,
          allowDeleteZone: true
        });
        lastDropPlan = nextDropPlan;
        const deleteHovering = nextDropPlan.kind === DROP_PLAN_KIND.DELETE_ZONE;

        updateCrossSurfaceDropIndicators(item, clientX, clientY, {
          silhouette: dropSilhouette,
          boardProjection,
          suppressSurfaceTargets: false,
          dropPlan: nextDropPlan
        });
        const boardGuideProjection = isBoardRealPageDropPlan(nextDropPlan) ? nextDropPlan.projection : null;
        if (deleteHovering || !boardGuideProjection?.layout) {
          clearWidgetDragGuideState();
        } else {
          updateWidgetDragGuideAtPointer(item, clientX, clientY, {
            boardLayout: boardGuideProjection.layout,
            boardPage: boardGuideProjection.page,
            showGuide: false
          });
        }
      };

      updateGhost(event.clientX, event.clientY);

      const finish = (upEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);

        resetPendingPageSwitch();
        setLauncherDragPlaceholderPolicy(false);
        const dropX = Number.isFinite(upEvent?.clientX) ? upEvent.clientX : event.clientX;
        const dropY = Number.isFinite(upEvent?.clientY) ? upEvent.clientY : event.clientY;
        const finalBoardProjection = isPlaceholderLauncherPage(dragReleasePage, currentLauncherPageCount())
          ? null
          : projectWidgetBoardDropLayout(item, {
            clientX: dropX,
            clientY: dropY,
            page: dragReleasePage
          }, {
            pageFallback: dragReleasePage
          });
        const finalDropPlan = resolveWidgetDropPlan(item, {
          clientX: dropX,
          clientY: dropY,
          page: dragReleasePage
        }, {
          boardProjection: finalBoardProjection,
          suppressSurfaceTargets: false,
          allowDeleteZone: true
        });
        lastDropPlan = finalDropPlan;

        elements.persistentDock?.classList.remove("is-drag-out-active");
        clearWidgetDragGuideState();
        setDockDropTargetActive(false);
        setContainerDropTargetActive("");
        setWidgetDropSilhouetteVisible(dropSilhouette, false);
        dropSilhouette?.remove();
        setDragDeleteZoneActive(false);
        card.classList.remove("dock-widget-item-dragging");
        card.classList.remove("widget-drag-active");
        card.classList.remove("widget-drag-origin-hidden");
        card.style.removeProperty("animation");
        card.style.removeProperty("transform-origin");
        sourceCard?.classList.remove("widget-drag-active");
        sourceCard?.classList.remove("widget-drag-origin-hidden");
        previewSession.dispose();

        card.dataset.suppressClick = "true";
        lastDragEndAt = Date.now();
        if (
          applyWidgetDropPlan(
            item,
            lastDropPlan,
            {
              clientX: dropX,
              clientY: dropY,
              page: dragReleasePage
            },
            { record: true }
          )
        ) {
          return;
        }

        releaseWidgetFromDockByDrop(item.id, {
          clientX: dropX,
          clientY: dropY,
          page: dragReleasePage
        });
      };

      const move = (moveEvent) => {
        updateGhost(moveEvent.clientX, moveEvent.clientY);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    }, true);

    card.addEventListener("click", () => {
      if (card.dataset.suppressClick === "true") {
        card.dataset.suppressClick = "false";
        return;
      }
      setDockActiveId(item.id, { rerender: false });
      applyDockActiveVisual(item.id);
      if (state.mode === "edit") {
        setSelected(item.id);
        openWidgetModal(item.id);
      }
    });

    strip.append(card);
  }

  applyDockActiveVisual(activeId);
  syncDockOverflowState();
}

function syncPersistentDock() {
  const dock = elements.persistentDock;
  if (!dock) {
    syncDockContentPadding({ enabled: false, heightPx: 0 });
    return;
  }

  const config = buildDockConfig(state?.ui?.home);
  if (!config.enabled) {
    clearWidgetDragGuideState();
    destroyDockEmbeddedControllers();
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

  if (elements.dockSettingsBtn) {
    const canEditDock = state.mode === "edit";
    const settingsTitle = canEditDock
      ? (dockSettingsModalOpen ? "Close dock settings" : "Open dock settings")
      : "Dock settings (Edit mode only)";
    elements.dockSettingsBtn.title = settingsTitle;
    elements.dockSettingsBtn.setAttribute("aria-label", settingsTitle);
    elements.dockSettingsBtn.disabled = !canEditDock;
    elements.dockSettingsBtn.tabIndex = canEditDock ? 0 : -1;
    elements.dockSettingsBtn.classList.toggle("is-hidden", !canEditDock);
    elements.dockSettingsBtn.classList.toggle("is-active", dockSettingsModalOpen);
  }

  renderDockWidgets();
  syncDockContentPadding(config);
  requestAnimationFrame(() => {
    syncDockContentPadding(config);
  });
}

function renderBoardViewport({ dragOffsetX = 0, animate = true, dragging = false } = {}) {
  if (!elements.board || !state?.ui?.home) {
    return;
  }

  const pageCount = currentLauncherPageCount();
  const activePage = currentLauncherViewportPage();
  const boardW = Math.max(1, Math.floor(elements.board.clientWidth));
  const allowPlaceholderPaging = shouldRenderLauncherPlaceholderPage();
  const minPage = allowPlaceholderPaging ? -1 : 0;
  const maxPage = allowPlaceholderPaging ? pageCount : Math.max(0, pageCount - 1);

  let offset = Number(dragOffsetX) || 0;
  if ((activePage <= minPage && offset > 0) || (activePage >= maxPage && offset < 0)) {
    offset *= 0.34;
  }

  const translateX = Math.round(-(activePage * boardW) + offset);
  elements.board.style.setProperty("--board-page-translate-x", `${translateX}px`);
  elements.board.classList.toggle("no-page-transition", !animate);
  elements.board.classList.toggle("is-page-dragging", dragging);

  if (!dragging) {
    syncPersistentDock();
  }

  refreshWidgetsByType("container");
  if (!dragging) {
    renderLauncherPageAffordances();
    syncHomePageAnchorButton();
  }
}

function setActiveLauncherPage(page, { animate = true } = {}) {
  if (!state?.ui?.home) {
    return false;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const nextPage = normalizeActivePage(page, home.pageCount, home.activePage);
  const changed = home.activePage !== nextPage;

  home.activePage = nextPage;
  state.ui.home = home;
  launcherPageUiState.virtualPage = null;
  clearPendingPlaceholderDrop();

  renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });

  return changed;
}

function refreshBoardCardsAfterLauncherPageMutation({ animate = true } = {}) {
  for (const instance of state.instances || []) {
    if (!isBoardWidgetInstance(instance)) {
      continue;
    }
    const rt = runtime.get(instance.id);
    if (!rt?.card) {
      continue;
    }
    applyLayout(rt.card, instance.layout, instance.page);
    if (instance.type === "container") {
      rt.controller?.refresh?.();
    }
  }
  renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });
  renderSettings();
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
  const manualPages = normalizeLauncherPageIndexList(home.manualPages, home.pageCount);
  home.pageCount = normalizePageCount(home.pageCount + 1, home.pageCount + 1);
  const createdPage = home.pageCount - 1;
  home.activePage = createdPage;
  home.manualPages = shiftLauncherPageIndexListOnInsert(manualPages, {
    addLeft: false,
    pageCount: home.pageCount,
    insertedPage: createdPage
  });
  state.ui.home = home;
  clearPendingPlaceholderDrop({ clearVirtualPage: true });

  renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
  renderSettings();
  queueSave();
}

function removeLauncherPage() {
  if (state.mode !== "edit") {
    return;
  }

  deleteLauncherPageAt(currentLauncherActivePage());
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

function patchMondayGlobalSettings(patch) {
  recordHistorySnapshot("Update Monday global settings");
  state.ui.monday = normalizeMondayGlobalSettings({
    ...state.ui.monday,
    ...patch
  });
  refreshWidgetsByType("mondayAssigned");
  refreshWidgetsByType("mondayMeetingNote");
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
  state.ui.background.localMediaDataUrl = normalizeText(state.ui.background.localMediaDataUrl);
  state.ui.background.localMediaType = normalizeLocalMediaType(state.ui.background.localMediaType, "");
  if (!state.ui.background.localMediaType && state.ui.background.localMediaDataUrl) {
    state.ui.background.localMediaType = inferLocalMediaTypeFromDataUrl(state.ui.background.localMediaDataUrl);
  }
  state.ui.background.localMediaName = normalizeText(state.ui.background.localMediaName);
  state.ui.background.localMediaBackgroundColor = normalizeHexColor(
    state.ui.background.localMediaBackgroundColor,
    defaultBackground().localMediaBackgroundColor
  );
  state.ui.background.localMediaFit = normalizeLocalMediaFit(state.ui.background.localMediaFit, "stretch");
  const videoFieldsTouched =
    patch && typeof patch === "object"
      ? [
          "videoSource",
          "videoUrl",
          "redditVideoSubreddit",
          "redditVideoTime",
          "localMediaDataUrl",
          "localMediaType",
          "localMediaName"
        ].some((key) => key in patch)
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

function patchWidgetConfig(instanceId, patch, { record = true, mutationKind = "user" } = {}) {
  const instance = instanceById(instanceId);
  if (!instance) {
    return;
  }

  const patchObject = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  const persistablePatch = buildPersistableWidgetConfigPatch(instance.type, patchObject);
  const shouldPersist = Object.keys(persistablePatch).length > 0;

  if (record && shouldPersist) {
    recordHistorySnapshot("Update widget settings");
  } else if (!record && shouldPersist && mutationKind !== "system") {
    touchUserMutationClock();
  }

  instance.config = { ...instance.config, ...patchObject };
  runtime.get(instanceId)?.controller?.refresh?.();
  renderSettings();
  if (shouldPersist) {
    queueSave();
  }
}

function moveInstanceToStateIndex(instanceId, destinationIndex) {
  const list = state.instances;
  if (!Array.isArray(list) || !list.length) {
    return false;
  }

  const fromIndex = list.findIndex((item) => String(item?.id) === String(instanceId));
  if (fromIndex < 0) {
    return false;
  }

  const boundedIndex = clamp(Math.round(Number(destinationIndex) || 0), 0, list.length);
  const targetIndex = fromIndex < boundedIndex ? boundedIndex - 1 : boundedIndex;
  if (fromIndex === targetIndex) {
    return false;
  }

  const [moved] = list.splice(fromIndex, 1);
  list.splice(clamp(targetIndex, 0, list.length), 0, moved);
  return true;
}

function appendWidgetToContainerOrder(instanceId, containerId) {
  const targetContainerId = normalizeContainerId(containerId);
  if (!targetContainerId) {
    return false;
  }

  const siblings = (state.instances || []).filter((entry) => {
    return (
      entry &&
      String(entry.id) !== String(instanceId) &&
      entry.type !== "container" &&
      normalizeContainerId(entry.containerId) === targetContainerId
    );
  });

  if (siblings.length) {
    const lastSiblingId = String(siblings[siblings.length - 1].id);
    const lastSiblingIndex = state.instances.findIndex((entry) => String(entry?.id) === lastSiblingId);
    if (lastSiblingIndex >= 0) {
      return moveInstanceToStateIndex(instanceId, lastSiblingIndex + 1);
    }
  }

  const containerIndex = state.instances.findIndex((entry) => String(entry?.id) === targetContainerId);
  if (containerIndex >= 0) {
    return moveInstanceToStateIndex(instanceId, containerIndex + 1);
  }
  return false;
}

function reorderWidgetInContainerByIndex(
  widgetId,
  containerId,
  insertIndex,
  { record = true, rerender = true, save = true } = {}
) {
  const targetContainerId = normalizeContainerId(containerId);
  const instance = instanceById(widgetId);
  if (!instance || instance.type === "container" || !targetContainerId) {
    return false;
  }
  if (normalizeContainerId(instance.containerId) !== targetContainerId) {
    return false;
  }

  const siblings = (state.instances || []).filter((entry) => {
    return (
      entry &&
      entry.type !== "container" &&
      normalizeContainerId(entry.containerId) === targetContainerId &&
      String(entry.id) !== String(widgetId)
    );
  });
  const clampedInsertIndex = clamp(Math.round(Number(insertIndex) || 0), 0, siblings.length);

  let changed = false;
  if (clampedInsertIndex < siblings.length) {
    const beforeId = String(siblings[clampedInsertIndex].id);
    const destinationIndex = state.instances.findIndex((entry) => String(entry?.id) === beforeId);
    if (destinationIndex >= 0) {
      changed = moveInstanceToStateIndex(widgetId, destinationIndex);
    }
  } else if (siblings.length) {
    const lastSiblingId = String(siblings[siblings.length - 1].id);
    const destinationIndex = state.instances.findIndex((entry) => String(entry?.id) === lastSiblingId);
    if (destinationIndex >= 0) {
      changed = moveInstanceToStateIndex(widgetId, destinationIndex + 1);
    }
  }

  if (!changed) {
    return false;
  }

  if (record) {
    recordHistorySnapshot("Reorder folder widget");
  } else {
    touchUserMutationClock();
  }

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

function projectWidgetBoardDropLayout(instance, payload = {}, { pageFallback = null } = {}) {
  const viewportRect = getLauncherViewportRect();
  const board = elements.board;
  if (!instance || !viewportRect || !(board instanceof HTMLElement)) {
    return null;
  }

  const boardWidth = Math.max(1, Math.floor(board.clientWidth || viewportRect.width));
  const boardHeight = Math.max(1, Math.floor(board.clientHeight || viewportRect.height));

  const pageCount = currentLauncherPageCount();
  const activePage = currentLauncherActivePage();
  const defaultPage = Number.isFinite(pageFallback) ? pageFallback : activePage;
  const page = normalizeWidgetPage(payload?.page, pageCount, defaultPage);
  const pointerX = Number.isFinite(payload?.clientX) ? payload.clientX : viewportRect.left + boardWidth / 2;
  const pointerY = Number.isFinite(payload?.clientY) ? payload.clientY : viewportRect.top + boardHeight / 2;

  if (isGridLayoutMode()) {
    const metrics = gridMetrics();
    const def = widgetRegistry[instance.type];
    const fallback = widgetDefaultGridSize(instance.type, def);
    const grid = normalizeGridLayout(instance.gridLayout, {
      col: 0,
      row: 0,
      colSpan: fallback.colSpan,
      rowSpan: fallback.rowSpan
    });
    const spanWidth = metrics.cellW * grid.colSpan + metrics.gapX * (grid.colSpan - 1);
    const spanHeight = metrics.cellH * grid.rowSpan + metrics.gapY * (grid.rowSpan - 1);
    const stepX = Math.max(1, metrics.cellW + metrics.gapX);
    const stepY = Math.max(1, metrics.cellH + metrics.gapY);
    const localX = clamp(pointerX - viewportRect.left - spanWidth / 2, 0, Math.max(0, boardWidth - spanWidth));
    const localY = clamp(pointerY - viewportRect.top - spanHeight / 2, 0, Math.max(0, boardHeight - spanHeight));

    grid.col = clamp(Math.round((localX - metrics.marginX) / stepX), 0, Math.max(0, metrics.cols - grid.colSpan));
    grid.row = clamp(Math.round((localY - metrics.marginY) / stepY), 0, Math.max(0, metrics.rows - grid.rowSpan));

    return {
      page,
      gridLayout: grid,
      layout: {
        x: metrics.marginX + grid.col * stepX,
        y: metrics.marginY + grid.row * stepY,
        w: spanWidth,
        h: spanHeight
      }
    };
  }

  const maxW = Math.max(80, boardWidth);
  const maxH = Math.max(80, boardHeight);
  const width = clamp(Number(instance.layout.w) || 320, 80, maxW);
  const height = clamp(Number(instance.layout.h) || 220, 80, maxH);
  const maxX = Math.max(0, boardWidth - width);
  const maxY = Math.max(0, boardHeight - height);
  const nextX = clamp(pointerX - viewportRect.left - width / 2, 0, maxX);
  const nextY = clamp(pointerY - viewportRect.top - height / 2, 0, maxY);

  return {
    page,
    gridLayout: null,
    layout: {
      x: Math.round(nextX / SNAP) * SNAP,
      y: Math.round(nextY / SNAP) * SNAP,
      w: width,
      h: height
    }
  };
}

function viewportRectToBoardLayout(rect) {
  const boardRect = elements.board?.getBoundingClientRect();
  if (!boardRect || !rect) {
    return null;
  }

  return {
    x: Math.round(rect.left - boardRect.left),
    y: Math.round(rect.top - boardRect.top),
    w: Math.max(1, Math.round(rect.width)),
    h: Math.max(1, Math.round(rect.height))
  };
}

function projectDockSilhouetteLayoutFromPointer(clientX, clientY, draggedWidgetId = "") {
  if (!isDockDropPoint(clientX, clientY)) {
    return null;
  }

  const dockHost = elements.persistentDockBody ?? elements.persistentDock;
  if (!(dockHost instanceof HTMLElement)) {
    return null;
  }

  const draggedId = normalizeText(draggedWidgetId);
  const draggedInstance = draggedId ? instanceById(draggedId) || { id: draggedId } : null;
  const slotRect = dockDropGuideSlotRect(draggedInstance, clientX, clientY);
  if (!slotRect) {
    return null;
  }

  const hostRect = dockHost.getBoundingClientRect();
  return viewportRectToBoardLayout({
    left: hostRect.left + slotRect.x,
    top: hostRect.top + slotRect.y,
    width: slotRect.w,
    height: slotRect.h
  });
}

function projectContainerSilhouetteLayoutFromPointer(containerId, clientX, clientY, draggedWidgetId = "") {
  const targetId = normalizeContainerId(containerId);
  if (!targetId) {
    return null;
  }

  const entry = containerDropUiState.targets.get(targetId);
  const targetElement = entry?.element;
  if (!(targetElement instanceof HTMLElement)) {
    return null;
  }

  if (!targetElement.classList.contains("widget-folder-panel")) {
    return viewportRectToBoardLayout(targetElement.getBoundingClientRect());
  }

  const panelBody = targetElement.querySelector(".widget-folder-panel-body");
  if (!(panelBody instanceof HTMLElement)) {
    return viewportRectToBoardLayout(targetElement.getBoundingClientRect());
  }

  const guideSlotRect = containerDropGuideSlotRect(targetId, { id: draggedWidgetId }, targetElement, {
    clientX,
    clientY
  });
  if (
    guideSlotRect &&
    Number.isFinite(guideSlotRect.x) &&
    Number.isFinite(guideSlotRect.y) &&
    Number.isFinite(guideSlotRect.w) &&
    Number.isFinite(guideSlotRect.h)
  ) {
    const panelRect = targetElement.getBoundingClientRect();
    return viewportRectToBoardLayout({
      left: panelRect.left + guideSlotRect.x,
      top: panelRect.top + guideSlotRect.y,
      width: guideSlotRect.w,
      height: guideSlotRect.h
    });
  }

  const cards = Array.from(panelBody.querySelectorAll(".widget-folder-item-card[data-widget-id]"))
    .filter((card) => normalizeText(card?.dataset?.widgetId) !== normalizeText(draggedWidgetId));

  if (!cards.length) {
    return viewportRectToBoardLayout(panelBody.getBoundingClientRect());
  }

  const insertIndex = resolveContainerInsertIndexFromPointer(targetId, clientX, clientY, {
    excludeWidgetId: draggedWidgetId,
    panelElement: panelBody
  });
  const anchor = cards[Math.min(cards.length - 1, Math.max(0, insertIndex))] || cards[0];
  return viewportRectToBoardLayout(anchor.getBoundingClientRect());
}

function buildDropPlanProjection(layout = null, page = 0, gridLayout = null) {
  if (!layout) {
    return null;
  }
  return {
    layout,
    page: Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 0,
    gridLayout: gridLayout || null
  };
}

function resolveWidgetDropPlan(
  instance,
  payload = {},
  {
    boardProjection = null,
    suppressSurfaceTargets = false,
    allowDeleteZone = true
  } = {}
) {
  if (suppressSurfaceTargets) {
    return createNoneDropPlan();
  }

  const clientX = Number(payload?.clientX);
  const clientY = Number(payload?.clientY);
  const pageCount = currentLauncherPageCount();
  const requestedPage = Number(payload?.page);

  if (allowDeleteZone && isPointOverDragDeleteZone(clientX, clientY)) {
    return createDeleteZoneDropPlan();
  }

  const containerDropTargetId = containerDropTargetAtPoint(clientX, clientY, instance);
  if (containerDropTargetId) {
    const insertIndex = resolveContainerInsertIndexFromPointer(containerDropTargetId, clientX, clientY, {
      excludeWidgetId: instance?.id,
      panelElement: payload?.panelElement
    });
    const projection = buildDropPlanProjection(
      projectContainerSilhouetteLayoutFromPointer(containerDropTargetId, clientX, clientY, instance?.id),
      0,
      null
    );
    return createContainerDropPlan({
      containerKind: DROP_CONTAINER_KIND.FOLDER,
      containerId: containerDropTargetId,
      insertIndex,
      projection
    });
  }

  const dockDropActive = isDockDropPoint(clientX, clientY) && isDockEligibleWidget(instance);
  if (dockDropActive) {
    const projection = buildDropPlanProjection(projectDockSilhouetteLayoutFromPointer(clientX, clientY, instance?.id), 0, null);
    const insertIndex = resolveDockDropSlotIndex(clientX, clientY, instance) ?? 0;
    return createContainerDropPlan({
      containerKind: DROP_CONTAINER_KIND.DOCK,
      insertIndex,
      projection
    });
  }

  const requestedInternalPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : null;
  if (requestedInternalPage !== null && isPlaceholderLauncherPage(requestedInternalPage, pageCount)) {
    const edge = placeholderEdgeFromInternalPlaceholder(requestedInternalPage, pageCount);
    return createBoardPlaceholderDropPlan({
      edge,
      policyPlaceholderPage: policyPlaceholderPageFromInternalPlaceholder(requestedInternalPage, pageCount),
      internalPlaceholderPage: requestedInternalPage,
      projection: null
    });
  }

  const fallbackProjection = projectWidgetBoardDropLayout(instance, payload, {
    pageFallback: currentLauncherActivePage()
  });
  const projected = boardProjection || fallbackProjection;
  if (!projected?.layout) {
    return createNoneDropPlan();
  }

  const internalPage = normalizeWidgetPage(projected.page, pageCount, currentLauncherActivePage());
  const projection = buildDropPlanProjection(projected.layout, internalPage, projected.gridLayout || null);

  if (isPlaceholderLauncherPage(internalPage, pageCount)) {
    const edge = placeholderEdgeFromInternalPlaceholder(internalPage, pageCount);
    return createBoardPlaceholderDropPlan({
      edge,
      policyPlaceholderPage: policyPlaceholderPageFromInternalPlaceholder(internalPage, pageCount),
      internalPlaceholderPage: internalPage,
      projection
    });
  }

  return createBoardPageDropPlan({
    policyPage: policyRealPageFromInternalPage(internalPage),
    internalPage,
    projection
  });
}

function applyDropPlanIndicators(plan, { silhouette = null } = {}) {
  const safePlan = plan || createNoneDropPlan();
  const deleteHovering = safePlan.kind === DROP_PLAN_KIND.DELETE_ZONE;

  let containerDropTargetId = "";
  let dockDropActive = false;
  let projectedLayout = null;
  let projectedPage = 0;
  let showBoardSilhouette = false;

  if (isContainerDropPlan(safePlan)) {
    if (safePlan.space.container.kind === DROP_CONTAINER_KIND.FOLDER) {
      containerDropTargetId = normalizeContainerId(safePlan.space.container.folderId);
    } else if (safePlan.space.container.kind === DROP_CONTAINER_KIND.DOCK) {
      dockDropActive = true;
    }
  } else if (isBoardRealPageDropPlan(safePlan) || isBoardPlaceholderDropPlan(safePlan)) {
    showBoardSilhouette = true;
  }

  if (safePlan.projection?.layout) {
    projectedLayout = safePlan.projection.layout;
    projectedPage = normalizeWidgetPage(
      safePlan.projection.page,
      currentLauncherPageCount(),
      currentLauncherActivePage()
    );
  }

  setContainerDropTargetActive(containerDropTargetId);
  setDockDropTargetActive(dockDropActive);
  setDragDeleteZoneHover(deleteHovering);

  const visible = Boolean(projectedLayout);
  if (visible) {
    positionWidgetDropSilhouette(silhouette, projectedLayout, projectedPage);
  }
  setWidgetDropSilhouetteVisible(silhouette, visible);

  return {
    plan: safePlan,
    deleteHovering,
    containerDropTargetId,
    dockDropActive,
    showBoardSilhouette: visible && showBoardSilhouette
  };
}

function updateCrossSurfaceDropIndicators(
  instance,
  clientX,
  clientY,
  {
    silhouette = null,
    boardProjection = null,
    suppressSurfaceTargets = false,
    dropPlan = null
  } = {}
) {
  const resolvedPlan =
    dropPlan ||
    resolveWidgetDropPlan(instance, { clientX, clientY }, {
      boardProjection,
      suppressSurfaceTargets,
      allowDeleteZone: !suppressSurfaceTargets
    });
  return applyDropPlanIndicators(resolvedPlan, { silhouette });
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

  if (nextContainerId && !canPlaceWidgetInContainer(instance.id, nextContainerId)) {
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
    appendWidgetToContainerOrder(instance.id, nextContainerId);
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

  const sourceContainer = instanceById(currentContainerId);
  const releasePage = normalizeWidgetPage(
    payload?.page,
    currentLauncherPageCount(),
    normalizeWidgetPage(sourceContainer?.page, currentLauncherPageCount(), currentLauncherActivePage())
  );

  const requestedPage = Number.isFinite(Number(payload?.page)) ? Math.floor(Number(payload.page)) : releasePage;
  if (isLauncherPlaceholderPolicyActive() && isPlaceholderLauncherPage(requestedPage, currentLauncherPageCount())) {
    return queuePlaceholderPageDrop(widgetId, payload, requestedPage);
  }

  recordHistorySnapshot("Move widget out of folder");
  clearPendingPlaceholderDrop({ clearVirtualPage: true });

  setWidgetContainer(widgetId, "", { record: false, rerender: false, save: false });

  instance.page = releasePage;
  state.ui.home.activePage = releasePage;

  const projection = projectWidgetBoardDropLayout(instance, payload, { pageFallback: releasePage });
  if (!projection) {
    return false;
  }

  instance.page = projection.page;
  instance.layout = {
    ...instance.layout,
    ...projection.layout
  };
  if (projection.gridLayout) {
    instance.gridLayout = projection.gridLayout;
  }

  state.selectedWidgetId = instance.id;
  renderBoard();
  queueSave();
  return true;
}

function releaseWidgetFromDockByDrop(widgetId, payload = {}) {
  const instance = instanceById(widgetId);
  if (!instance || instance.type === "container" || !isWidgetDocked(instance)) {
    return false;
  }

  const boardRect = elements.board?.getBoundingClientRect();
  if (!boardRect) {
    return false;
  }

  const requestedPage = Number.isFinite(Number(payload?.page))
    ? Math.floor(Number(payload.page))
    : currentLauncherActivePage();
  if (isLauncherPlaceholderPolicyActive() && isPlaceholderLauncherPage(requestedPage, currentLauncherPageCount())) {
    return queuePlaceholderPageDrop(widgetId, payload, requestedPage);
  }

  recordHistorySnapshot("Undock widget");
  clearPendingPlaceholderDrop({ clearVirtualPage: true });

  instance.dockOrder = null;
  instance.containerId = "";
  normalizeDockedWidgetOrders(state.instances);

  const releasePage = normalizeWidgetPage(payload?.page, currentLauncherPageCount(), currentLauncherActivePage());
  instance.page = releasePage;
  state.ui.home.activePage = releasePage;

  const projection = projectWidgetBoardDropLayout(instance, payload, { pageFallback: releasePage });
  if (!projection) {
    return false;
  }

  instance.page = projection.page;
  instance.layout = {
    ...instance.layout,
    ...projection.layout
  };
  if (projection.gridLayout) {
    instance.gridLayout = projection.gridLayout;
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

  const removedBoardPage = isBoardWidgetInstance(removed)
    ? normalizeWidgetPage(removed.page, currentLauncherPageCount(), currentLauncherActivePage())
    : null;

  if (state.selectedWidgetId === instanceId) {
    state.selectedWidgetId = "";
  }

  if (modalState.open && modalState.widgetId === instanceId) {
    closeWidgetModal(false);
  }

  const compacted = Number.isFinite(removedBoardPage) ? compactEmptyLauncherPagesForUseMode() : false;

  renderDockWidgets();
  renderSettings();
  if (compacted || removed?.type === "container" || isWidgetInContainer(removed)) {
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
  const inlineActionsBottom = fragment.querySelector(".widget-inline-actions-bottom");
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
    reorderWidgetInContainerByIndex: (widgetId, containerId, index, options = {}) =>
      reorderWidgetInContainerByIndex(widgetId, containerId, index, options),
    createWidgetDropSilhouette: (sourceElement, options = {}) => createWidgetDropSilhouette(sourceElement, options),
    resolveContainerInsertIndexFromPointer: (containerId, clientX, clientY, options = {}) =>
      resolveContainerInsertIndexFromPointer(containerId, clientX, clientY, options),
    tryContainerWidgetByDrop: (widget, pointerEvent, options = {}) => tryContainerWidgetByDrop(widget, pointerEvent, options),
    tryDockWidgetByDrop: (widget, pointerEvent, options = {}) => tryDockWidgetByDrop(widget, pointerEvent, options),
    projectWidgetBoardDropLayout: (widget, payload = {}, options = {}) =>
      projectWidgetBoardDropLayout(widget, payload, options),
    updateCrossSurfaceDropIndicators: (widget, clientX, clientY, options = {}) =>
      updateCrossSurfaceDropIndicators(widget, clientX, clientY, options),
    renderBoardViewport,
    setActiveLauncherPage,
    currentLauncherActivePage,
    currentLauncherPageCount,
    registerContainerDropTarget: (containerId, element, options = {}) =>
      registerContainerDropTarget(containerId, element, options),
    unregisterContainerDropTarget: (containerId) => unregisterContainerDropTarget(containerId),
    createDragPreviewSession: (widget, options = {}) => createDragPreviewSession(widget, options),
    createWidgetDragPreview: (widget, options = {}) => createWidgetDragPreview(widget, options),
    positionWidgetDragPreview,
    updateWidgetDragGuideAtPointer: (widget, clientX, clientY, options = {}) =>
      updateWidgetDragGuideAtPointer(widget, clientX, clientY, options),
    clearWidgetDragGuideState,
    projectWidgetBoardDropLayout: (widget, clientX, clientY, options = {}) =>
      projectWidgetBoardDropLayout(widget, clientX, clientY, options),
    dropWidgetToContainerByPointer: (widget, pointerEvent, options = {}) =>
      tryContainerWidgetByDrop(widget, pointerEvent, options),
    dropWidgetToDockByPointer: (widget, pointerEvent, options = {}) => {
      const moved = tryDockWidgetByDrop(widget, pointerEvent, options);
      if (moved) {
        renderBoard();
        queueSave();
      }
      return moved;
    },
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

  const placeFloatTopAction = (btn) => {
    if (floatSelectBtn?.parentElement === inlineActions) {
      inlineActions.insertBefore(btn, floatSelectBtn);
    } else {
      inlineActions?.prepend(btn);
    }
  };

  const placeFloatBottomAction = (btn) => {
    inlineActionsBottom?.append(btn);
  };

  if (instance.type === "bookmarks") {
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

    if (typeof controller?.goBack === "function") {
      const floatBack = makeActionButton("icon-btn widget-float-back", "Go back", "i-undo", () => controller.goBack?.());
      placeFloatBottomAction(floatBack);

      const syncBackState = (canGoBack) => {
        const enabled = Boolean(canGoBack);
        floatBack.disabled = !enabled;
        floatBack.title = enabled ? "Go back" : "Go back (root folder)";
      };

      if (typeof controller?.onBackStateChange === "function") {
        controller.onBackStateChange(syncBackState);
      } else {
        syncBackState(typeof controller?.canGoBack === "function" ? controller.canGoBack() : true);
      }
    }

    if (typeof controller?.refresh === "function") {
      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        "Refresh bookmarks",
        "i-reset",
        () => controller.refresh?.()
      );
      placeFloatBottomAction(floatRefresh);
    }
  }

  if (instance.type === "mondayAssigned" || instance.type === "mondayMeetingNote") {
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
        const iconUse = btn.querySelector("use");
        if (iconUse) {
          iconUse.setAttribute("href", connected ? "#i-disconnect" : "#i-connect");
        }
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
        "Refresh Monday data",
        "i-reset",
        runRefresh,
        syncAuthButtonState
      );
      placeHeadAction(headRefresh);

      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        "Refresh Monday data",
        "i-reset",
        runRefresh,
        syncAuthButtonState
      );
      placeFloatBottomAction(floatRefresh);
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
      placeFloatTopAction(floatOpen);
    }

    if (typeof controller?.toggleConnection === "function") {
      const headAuth = makeActionButton(
        "icon-btn widget-auth-toggle-btn",
        "Connect Monday",
        "i-connect",
        runToggleAuth,
        syncAuthButtonState
      );
      const floatAuth = makeActionButton(
        "icon-btn widget-float-auth-toggle",
        "Connect Monday",
        "i-connect",
        runToggleAuth,
        syncAuthButtonState
      );
      authButtons.push(headAuth, floatAuth);
      placeHeadAction(headAuth);
      placeFloatTopAction(floatAuth);
      syncAuthButtonState();
    }
  }

  if (instance.type === "gmail" || instance.type === "calendar") {
    const refreshTitle = instance.type === "gmail" ? "Refresh unread mail" : "Refresh events";
    const openTitle = instance.type === "gmail" ? "Open Gmail" : "Open Google Calendar";
    const switchTitle = instance.type === "gmail" ? "Switch Gmail account" : "Switch Calendar account";

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

    const runRefresh = () => {
      if (typeof controller?.manualRefresh === "function") {
        return controller.manualRefresh();
      }
      if (typeof controller?.refresh === "function") {
        return controller.refresh();
      }
      return null;
    };

    const runOpen = () => {
      if (typeof controller?.openGmail === "function") {
        return controller.openGmail();
      }
      if (typeof controller?.openCalendar === "function") {
        return controller.openCalendar();
      }
      return null;
    };

    const runSwitchAccount = () => {
      if (typeof controller?.switchAccount === "function") {
        return controller.switchAccount();
      }
      return null;
    };

    const canSwitchAccount = () => {
      if (typeof controller?.canSwitchAccount === "function") {
        return Boolean(controller.canSwitchAccount());
      }
      return true;
    };

    if (typeof controller?.manualRefresh === "function" || typeof controller?.refresh === "function") {
      const headRefresh = makeActionButton(
        "icon-btn widget-refresh-btn",
        refreshTitle,
        "i-reset",
        runRefresh
      );
      placeHeadAction(headRefresh);

      const floatRefresh = makeActionButton(
        "icon-btn widget-float-refresh",
        refreshTitle,
        "i-reset",
        runRefresh
      );
      placeFloatBottomAction(floatRefresh);
    }

    if (typeof controller?.openGmail === "function" || typeof controller?.openCalendar === "function") {
      const headOpen = makeActionButton(
        "icon-btn widget-open-btn",
        openTitle,
        "i-open",
        runOpen
      );
      placeHeadAction(headOpen);

      const floatOpen = makeActionButton(
        "icon-btn widget-float-open",
        openTitle,
        "i-open",
        runOpen
      );
      placeFloatTopAction(floatOpen);
    }

    if (typeof controller?.switchAccount === "function") {
      const headSwitch = makeActionButton(
        "icon-btn widget-switch-account-btn",
        switchTitle,
        "i-redo",
        runSwitchAccount
      );
      placeHeadAction(headSwitch);

      const floatSwitch = makeActionButton(
        "icon-btn widget-float-switch-account",
        switchTitle,
        "i-redo",
        runSwitchAccount
      );
      placeFloatTopAction(floatSwitch);

      const syncSwitchState = () => {
        const enabled = canSwitchAccount();
        headSwitch.disabled = !enabled;
        floatSwitch.disabled = !enabled;
        headSwitch.hidden = !enabled;
        floatSwitch.hidden = !enabled;
      };

      syncSwitchState();
    }
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
      placeFloatBottomAction(floatRefresh);
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
      placeFloatTopAction(floatOpen);
    }
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
    closeBoardContextMenu();

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

    bringWidgetToFront(instance.id);
    card.classList.add("widget-drag-active");
    const previewSession = createDragPreviewSession(instance, {
      sourceCard: card,
      pointerEvent: event,
      pointerX: dragStartX,
      pointerY: dragStartY
    });
    if (!previewSession) {
      card.classList.remove("widget-drag-active");
      return false;
    }


    card.classList.add("widget-drag-origin-hidden");
    const dropSilhouette = createWidgetDropSilhouette(card);
    const hideAndRemoveDropSilhouette = () => {
      setWidgetDropSilhouetteVisible(dropSilhouette, false);
      dropSilhouette?.remove();
    };
    setDragDeleteZoneActive(true);
    setLauncherDragPlaceholderPolicy(true);
    updateDragDeleteZoneHover(dragStartX, dragStartY);

    previewSession.update(dragStartX, dragStartY);

    const pageSwitchThreshold = 42;
    const pageSwitchHoldMs = 280;
    const pageSwitchCooldownMs = 190;
    let lastPageSwitchAt = 0;
    let pageChangedDuringDrag = false;
    let pendingPageSwitchDirection = 0;
    let pendingPageSwitchSince = 0;
    let pendingPageSwitchTimer = 0;
    let dragReleasePage = normalizeWidgetPage(instance.page, currentLauncherPageCount(), currentLauncherActivePage());
    let lastDropPlan = createNoneDropPlan();

    const edgeDirectionFromPointer = (clientX) => {
      const rect = getLauncherViewportRect();
      if (!rect || !Number.isFinite(clientX) || rect.width < pageSwitchThreshold * 2) {
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

    const resetPendingPageSwitch = () => {
      pendingPageSwitchDirection = 0;
      pendingPageSwitchSince = 0;
      if (pendingPageSwitchTimer) {
        window.clearTimeout(pendingPageSwitchTimer);
        pendingPageSwitchTimer = 0;
      }
    };

    const commitPageSwitch = (direction, moveEvent, onSwitched = null) => {
      if (!direction) {
        return false;
      }

      const now = performance.now();
      if (now - lastPageSwitchAt < pageSwitchCooldownMs) {
        return false;
      }

      const home = syncLauncherPagingState({ expandToFitInstances: true });
      let pageCount = home.pageCount;
      const minPage = isLauncherPlaceholderPolicyActive() ? -1 : 0;
      const currentPage = dragReleasePage;
      let nextPage = currentPage + direction;

      const maxPage = isLauncherPlaceholderPolicyActive() ? pageCount : pageCount - 1;

      if (nextPage < minPage || nextPage > maxPage) {
        return false;
      }

      dragReleasePage = nextPage;
      if (isPlaceholderLauncherPage(nextPage, currentLauncherPageCount())) {
        setLauncherVirtualPage(nextPage, { animate: true });
      } else {
        launcherPageUiState.virtualPage = null;
        instance.page = nextPage;
        state.ui.home.activePage = nextPage;
      }
      pageChangedDuringDrag = true;
      lastPageSwitchAt = now;

      if (typeof onSwitched === "function") {
        onSwitched(direction, nextPage, currentPage, moveEvent);
      }

      renderBoardViewport({ animate: true, dragging: false, dragOffsetX: 0 });
      return true;
    };

    const schedulePageSwitch = (direction, moveEvent, onSwitched = null) => {
      if (!direction) {
        resetPendingPageSwitch();
        return false;
      }

      if (direction === pendingPageSwitchDirection && pendingPageSwitchTimer) {
        return false;
      }

      resetPendingPageSwitch();
      pendingPageSwitchDirection = direction;
      pendingPageSwitchSince = performance.now();
      pendingPageSwitchTimer = window.setTimeout(() => {
        pendingPageSwitchTimer = 0;
        const currentDirection = edgeDirectionFromPointer(lastPointerX);
        if (currentDirection !== direction) {
          resetPendingPageSwitch();
          return;
        }

        const syntheticEvent = {
          clientX: lastPointerX,
          clientY: lastPointerY
        };
        const switched = commitPageSwitch(direction, syntheticEvent, onSwitched);
        if (switched) {
          schedulePageSwitch(direction, syntheticEvent, onSwitched);
          return;
        }

        resetPendingPageSwitch();
      }, pageSwitchHoldMs);

      return false;
    };



    const boardRect = elements.board.getBoundingClientRect();
    let lastPointerX = dragStartX;
    let lastPointerY = dragStartY;

    const placeDraftAtPointerInCurrentViewport = (clientX, clientY, { commit = false } = {}) => {
      const viewportRect = getLauncherViewportRect();
      if (!viewportRect || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
      }
      const maxLocalX = Math.max(0, boardRect.width - instance.layout.w);
      const maxLocalY = Math.max(0, boardRect.height - instance.layout.h);
      const nextX = clamp(clientX - viewportRect.left - instance.layout.w / 2, 0, maxLocalX);
      const nextY = clamp(clientY - viewportRect.top - instance.layout.h / 2, 0, maxLocalY);
      if (commit) {
        patchWidgetLayout(instance.id, {
          x: nextX,
          y: nextY
        }, { record: false });
        const rt = runtime.get(instance.id);
        if (rt?.card) {
          applyLayout(rt.card, instance.layout, instance.page);
        }
      } else {
        instance.layout.x = nextX;
        instance.layout.y = nextY;
      }
      lastPointerX = clientX;
      lastPointerY = clientY;
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
      const projectedGridDropLayout = () => {
        const currentGrid = normalizeGridLayout(instance.gridLayout, gridFallback);
        const maxCol = Math.max(0, metrics.cols - currentGrid.colSpan);
        const maxRow = Math.max(0, metrics.rows - currentGrid.rowSpan);
        const snappedCol = clamp(Math.round((instance.layout.x - metrics.marginX) / stepX), 0, maxCol);
        const snappedRow = clamp(Math.round((instance.layout.y - metrics.marginY) / stepY), 0, maxRow);

        return {
          grid: {
            ...currentGrid,
            col: snappedCol,
            row: snappedRow
          },
          layout: {
            x: metrics.marginX + snappedCol * stepX,
            y: metrics.marginY + snappedRow * stepY,
            w: metrics.cellW * currentGrid.colSpan + metrics.gapX * (currentGrid.colSpan - 1),
            h: metrics.cellH * currentGrid.rowSpan + metrics.gapY * (currentGrid.rowSpan - 1)
          }
        };
      };

      const snapLayoutToGrid = () => {
        const projected = projectedGridDropLayout();
        instance.gridLayout = projected.grid;
        instance.layout.x = projected.layout.x;
        instance.layout.y = projected.layout.y;
        instance.layout.w = projected.layout.w;
        instance.layout.h = projected.layout.h;
      };

      const move = (moveEvent) => {
        previewSession.update(moveEvent.clientX, moveEvent.clientY);
        const dx = moveEvent.clientX - lastPointerX;
        const dy = moveEvent.clientY - lastPointerY;
        lastPointerX = moveEvent.clientX;
        lastPointerY = moveEvent.clientY;

        const maxX = Math.max(0, boardRect.width - instance.layout.w);
        const maxY = Math.max(0, boardRect.height - instance.layout.h);

        instance.layout.x = clamp(instance.layout.x + dx, 0, maxX);
        instance.layout.y = clamp(instance.layout.y + dy, 0, maxY);

        const direction = edgeDirectionFromPointer(moveEvent.clientX);
        schedulePageSwitch(direction, moveEvent, () => {
          placeDraftAtPointerInCurrentViewport(moveEvent.clientX, moveEvent.clientY);
        });

        const boardProjection = isPlaceholderLauncherPage(dragReleasePage, currentLauncherPageCount())
          ? null
          : projectWidgetBoardDropLayout(
            instance,
            {
              clientX: moveEvent.clientX,
              clientY: moveEvent.clientY,
              page: dragReleasePage
            },
            { pageFallback: dragReleasePage }
          );
        const nextDropPlan = resolveWidgetDropPlan(instance, {
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
          page: dragReleasePage
        }, {
          boardProjection,
          suppressSurfaceTargets: false,
          allowDeleteZone: true
        });
        lastDropPlan = nextDropPlan;

        updateCrossSurfaceDropIndicators(instance, moveEvent.clientX, moveEvent.clientY, {
          silhouette: dropSilhouette,
          boardProjection,
          suppressSurfaceTargets: false,
          dropPlan: nextDropPlan
        });
        const deleteHovering = nextDropPlan.kind === DROP_PLAN_KIND.DELETE_ZONE;
        const boardGuideProjection = isBoardRealPageDropPlan(nextDropPlan) ? nextDropPlan.projection : null;
        if (deleteHovering || !boardGuideProjection?.layout) {
          clearWidgetDragGuideState();
        } else {
          updateWidgetDragGuideAtPointer(instance, moveEvent.clientX, moveEvent.clientY, {
            boardLayout: boardGuideProjection.layout,
            boardPage: boardGuideProjection.page,
            showGuide: false
          });
        }
      };

      const up = (upEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        resetPendingPageSwitch();
        hideAndRemoveDropSilhouette();
        clearWidgetDragGuideState();
        setDragDeleteZoneActive(false);
        setLauncherDragPlaceholderPolicy(false);
        card.classList.remove("longpress-drag-armed");
        card.classList.remove("widget-drag-active");
        card.classList.remove("widget-drag-origin-hidden");
        previewSession.dispose();
        lastDragEndAt = Date.now();

        const dropX = Number.isFinite(upEvent?.clientX) ? upEvent.clientX : lastPointerX;
        const dropY = Number.isFinite(upEvent?.clientY) ? upEvent.clientY : lastPointerY;
        const finalBoardProjection = isPlaceholderLauncherPage(dragReleasePage, currentLauncherPageCount())
          ? null
          : projectWidgetBoardDropLayout(
            instance,
            {
              clientX: dropX,
              clientY: dropY,
              page: dragReleasePage
            },
            { pageFallback: dragReleasePage }
          );
        const finalDropPlan = resolveWidgetDropPlan(instance, {
          clientX: dropX,
          clientY: dropY,
          page: dragReleasePage
        }, {
          boardProjection: finalBoardProjection,
          suppressSurfaceTargets: false,
          allowDeleteZone: true
        });
        lastDropPlan = finalDropPlan;

        if (
          applyWidgetDropPlan(
            instance,
            lastDropPlan,
            {
              clientX: dropX,
              clientY: dropY,
              page: dragReleasePage
            },
            { record: false }
          )
        ) {
          return;
        }

        clearPendingPlaceholderDrop({ clearVirtualPage: true });

        snapLayoutToGrid();
        instance.page = normalizeWidgetPage(dragReleasePage, currentLauncherPageCount(), currentLauncherActivePage());
        applyGridLayout({ commitFreeLayout: false, shouldSave: false });
        compactEmptyLauncherPagesForUseMode();
        queueSave();
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      const initialBoardProjection = isPlaceholderLauncherPage(dragReleasePage, currentLauncherPageCount())
        ? null
        : projectWidgetBoardDropLayout(
          instance,
          {
            clientX: dragStartX,
            clientY: dragStartY,
            page: dragReleasePage
          },
          { pageFallback: dragReleasePage }
        );
      const initialDropPlan = resolveWidgetDropPlan(instance, {
        clientX: dragStartX,
        clientY: dragStartY,
        page: dragReleasePage
      }, {
        boardProjection: initialBoardProjection,
        suppressSurfaceTargets: false,
        allowDeleteZone: true
      });
      lastDropPlan = initialDropPlan;

      updateCrossSurfaceDropIndicators(instance, dragStartX, dragStartY, {
        silhouette: dropSilhouette,
        boardProjection: initialBoardProjection,
        suppressSurfaceTargets: false,
        dropPlan: initialDropPlan
      });
      const deleteHovering = initialDropPlan.kind === DROP_PLAN_KIND.DELETE_ZONE;
      const boardGuideProjection = isBoardRealPageDropPlan(initialDropPlan) ? initialDropPlan.projection : null;
      if (deleteHovering || !boardGuideProjection?.layout) {
        clearWidgetDragGuideState();
      } else {
        updateWidgetDragGuideAtPointer(instance, dragStartX, dragStartY, {
          boardLayout: boardGuideProjection.layout,
          boardPage: boardGuideProjection.page,
          showGuide: false
        });
      }

      return true;
    }

    const move = (moveEvent) => {
      previewSession.update(moveEvent.clientX, moveEvent.clientY);
      const dx = moveEvent.clientX - lastPointerX;
      const dy = moveEvent.clientY - lastPointerY;
      lastPointerX = moveEvent.clientX;
      lastPointerY = moveEvent.clientY;
      const maxX = Math.max(0, boardRect.width - instance.layout.w);
      const maxY = Math.max(0, boardRect.height - instance.layout.h);

      const nextX = Math.max(0, Math.min(maxX, instance.layout.x + dx));
      const nextY = Math.max(0, Math.min(maxY, instance.layout.y + dy));

      patchWidgetLayout(instance.id, {
        x: nextX,
        y: nextY
      }, { record: false });

      const direction = edgeDirectionFromPointer(moveEvent.clientX);
      schedulePageSwitch(direction, moveEvent, () => {
        placeDraftAtPointerInCurrentViewport(moveEvent.clientX, moveEvent.clientY, { commit: true });
      });


      const boardProjection = isPlaceholderLauncherPage(dragReleasePage, currentLauncherPageCount())
        ? null
        : projectWidgetBoardDropLayout(
          instance,
          {
            clientX: moveEvent.clientX,
            clientY: moveEvent.clientY,
            page: dragReleasePage
          },
          { pageFallback: dragReleasePage }
        );
      const nextDropPlan = resolveWidgetDropPlan(instance, {
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
        page: dragReleasePage
      }, {
        boardProjection,
        suppressSurfaceTargets: false,
        allowDeleteZone: true
      });
      lastDropPlan = nextDropPlan;

      updateCrossSurfaceDropIndicators(instance, moveEvent.clientX, moveEvent.clientY, {
        silhouette: dropSilhouette,
        boardProjection,
        suppressSurfaceTargets: false,
        dropPlan: nextDropPlan
      });
      const deleteHovering = nextDropPlan.kind === DROP_PLAN_KIND.DELETE_ZONE;
      const boardGuideProjection = isBoardRealPageDropPlan(nextDropPlan) ? nextDropPlan.projection : null;
      if (deleteHovering || !boardGuideProjection?.layout) {
        clearWidgetDragGuideState();
      } else {
        updateWidgetDragGuideAtPointer(instance, moveEvent.clientX, moveEvent.clientY, {
          boardLayout: boardGuideProjection.layout,
          boardPage: boardGuideProjection.page,
          showGuide: false
        });
      }
    };

    const up = (upEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      resetPendingPageSwitch();
      hideAndRemoveDropSilhouette();
      clearWidgetDragGuideState();
      setDragDeleteZoneActive(false);
      setLauncherDragPlaceholderPolicy(false);
      card.classList.remove("longpress-drag-armed");
      card.classList.remove("widget-drag-active");
      card.classList.remove("widget-drag-origin-hidden");
      previewSession.dispose();
      lastDragEndAt = Date.now();

      const dropX = Number.isFinite(upEvent?.clientX) ? upEvent.clientX : lastPointerX;
      const dropY = Number.isFinite(upEvent?.clientY) ? upEvent.clientY : lastPointerY;
      const finalBoardProjection = isPlaceholderLauncherPage(dragReleasePage, currentLauncherPageCount())
        ? null
        : projectWidgetBoardDropLayout(
          instance,
          {
            clientX: dropX,
            clientY: dropY,
            page: dragReleasePage
          },
          { pageFallback: dragReleasePage }
        );
      const finalDropPlan = resolveWidgetDropPlan(instance, {
        clientX: dropX,
        clientY: dropY,
        page: dragReleasePage
      }, {
        boardProjection: finalBoardProjection,
        suppressSurfaceTargets: false,
        allowDeleteZone: true
      });
      lastDropPlan = finalDropPlan;

      if (
        applyWidgetDropPlan(
          instance,
          lastDropPlan,
          {
            clientX: dropX,
            clientY: dropY,
            page: dragReleasePage
          },
          { record: true }
        )
      ) {
        return;
      }

      clearPendingPlaceholderDrop({ clearVirtualPage: true });
      instance.page = normalizeWidgetPage(dragReleasePage, currentLauncherPageCount(), currentLauncherActivePage());

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
        compactEmptyLauncherPagesForUseMode();
        updateBoardBounds();
        renderSettings();
        queueSave();
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    const initialBoardProjection = isPlaceholderLauncherPage(dragReleasePage, currentLauncherPageCount())
      ? null
      : projectWidgetBoardDropLayout(
        instance,
        {
          clientX: dragStartX,
          clientY: dragStartY,
          page: dragReleasePage
        },
        { pageFallback: dragReleasePage }
      );
    const initialDropPlan = resolveWidgetDropPlan(instance, {
      clientX: dragStartX,
      clientY: dragStartY,
      page: dragReleasePage
    }, {
      boardProjection: initialBoardProjection,
      suppressSurfaceTargets: false,
      allowDeleteZone: true
    });
    lastDropPlan = initialDropPlan;
    updateCrossSurfaceDropIndicators(instance, dragStartX, dragStartY, {
      silhouette: dropSilhouette,
      boardProjection: initialBoardProjection,
      suppressSurfaceTargets: false,
      dropPlan: initialDropPlan
    });
    const deleteHovering = initialDropPlan.kind === DROP_PLAN_KIND.DELETE_ZONE;
    const boardGuideProjection = isBoardRealPageDropPlan(initialDropPlan) ? initialDropPlan.projection : null;
    if (deleteHovering || !boardGuideProjection?.layout) {
      clearWidgetDragGuideState();
    } else {
      updateWidgetDragGuideAtPointer(instance, dragStartX, dragStartY, {
        boardLayout: boardGuideProjection.layout,
        boardPage: boardGuideProjection.page,
        showGuide: false
      });
    }

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

  title?.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openWidgetTitleRenameModal(instance.id);
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
  clearWidgetDragGuideState();
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

function renderLauncherPageAffordances() {
  if (!(elements.board instanceof HTMLElement) || !state?.ui?.home) {
    return;
  }

  const board = elements.board;
  const pageCount = currentLauncherPageCount();
  const boardW = Math.max(1, Math.floor(board.clientWidth || 1));
  const boardH = Math.max(1, Math.floor(board.clientHeight || 1));
  const activePage = currentLauncherViewportPage();

  let host = board.querySelector(".launcher-page-affordances");
  if (!(host instanceof HTMLElement)) {
    host = document.createElement("div");
    host.className = "launcher-page-affordances";
    board.append(host);
  }

  host.replaceChildren();

  const isEdit = state.mode === "edit";
  if (!isEdit && !shouldRenderLauncherPlaceholderPage()) {
    return;
  }

  const createPageLayer = (pageIndex, { placeholder = false } = {}) => {
    const layer = document.createElement("div");
    layer.className = "launcher-page-layer";
    if (placeholder) {
      layer.classList.add("is-placeholder");
    }
    if (pageIndex === activePage) {
      layer.classList.add("is-active");
    }
    layer.style.left = `${Math.round(pageIndex * boardW)}px`;
    layer.style.top = "0px";
    layer.style.width = `${boardW}px`;
    layer.style.height = `${boardH}px`;
    return layer;
  };

  for (let page = 0; page < pageCount; page += 1) {
    const layer = createPageLayer(page);
    if (isEdit && pageCount > 1) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "launcher-page-remove-btn";
      removeBtn.textContent = "X";
      removeBtn.title = "Delete page";
      removeBtn.setAttribute("aria-label", "Delete page");
      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteLauncherPageAt(page);
      });
      layer.append(removeBtn);
    }
    host.append(layer);
  }

  if (!shouldRenderLauncherPlaceholderPage()) {
    return;
  }

  const pending = launcherPageUiState.pendingPlaceholderDrop;
  const placeholderPages = [-1, pageCount];
  for (const page of placeholderPages) {
    const layer = createPageLayer(page, { placeholder: true });
    const hasPendingWidget = pending && pending.placeholderPage === page;
    const materializeBtn = document.createElement("button");
    materializeBtn.type = "button";
    materializeBtn.className = "launcher-page-materialize-btn";
    materializeBtn.innerHTML = '<span class="launcher-page-materialize-icon">+</span><span class="launcher-page-materialize-label">Create page</span>';
    materializeBtn.title = hasPendingWidget ? "Create page and place widget" : "Create empty page";
    materializeBtn.setAttribute("aria-label", hasPendingWidget ? "Create page and place widget" : "Create empty page");
    materializeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (hasPendingWidget) {
        materializePendingPlaceholderPage();
        return;
      }
      materializeLauncherPlaceholderPage(page);
    });
    layer.append(materializeBtn);

    host.append(layer);
  }
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

  const mondayTokenRow = createFormRow("Monday Access Token (Global)");
  const mondayTokenInput = createInputBySchema(
    {
      key: "accessToken",
      type: "password",
      placeholder: "Monday access token"
    },
    state.ui.monday?.accessToken || ""
  );
  mondayTokenInput.addEventListener("change", () => {
    patchMondayGlobalSettings({ accessToken: readFieldValue(mondayTokenInput, { type: "text" }) });
  });
  mondayTokenRow.append(mondayTokenInput);
  elements.settingsContent.append(mondayTokenRow);

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

  const exportRow = document.createElement("div");
  exportRow.className = "preset-actions";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn";
  exportBtn.textContent = "Export current state";
  exportBtn.addEventListener("click", () => {
    exportCurrentStateToFile();
  });
  exportRow.append(exportBtn);
  elements.settingsContent.append(exportRow);

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
      { value: "video", label: "Local File" }
    ]
  };
  const bg = state.ui.background;
  const bgFields = [];

  const appendBackgroundField = (schema) => {
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
  };

  if (bg.mode === "video") {
    appendBackgroundField(modeSchema);
  } else {
    bgFields.push(modeSchema);
  }

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
    const selectedFileName = normalizeText(
      bg.localMediaName,
      normalizeText(bg.localMediaDataUrl) ? "Local file selected" : "No file selected"
    );
    const localFileRow = createFormRow("Local file");
    const localFileStatus = document.createElement("span");
    localFileStatus.className = "muted";
    localFileStatus.textContent = selectedFileName;

    const localFileInput = document.createElement("input");
    localFileInput.type = "file";
    localFileInput.accept = "image/*,video/*";
    localFileInput.hidden = true;

    const localFileBtn = document.createElement("button");
    localFileBtn.type = "button";
    localFileBtn.className = "btn";
    localFileBtn.textContent = "Choose file";
    localFileBtn.addEventListener("click", () => {
      localFileInput.click();
    });

    localFileInput.addEventListener("change", () => {
      const file = localFileInput.files?.[0] || null;
      localFileInput.value = "";
      if (!file) {
        return;
      }
      void importLocalBackgroundFile(file);
    });

    const localFileControl = document.createElement("div");
    localFileControl.style.display = "flex";
    localFileControl.style.alignItems = "center";
    localFileControl.style.gap = "8px";
    localFileControl.style.minWidth = "0";
    localFileControl.append(localFileBtn, localFileStatus, localFileInput);

    localFileRow.append(localFileControl);
    elements.settingsContent.append(localFileRow);

    const selectedFileRow = createFormRow("Selected file");
    const selectedFileInput = document.createElement("input");
    selectedFileInput.type = "text";
    selectedFileInput.readOnly = true;
    selectedFileInput.value = selectedFileName;
    selectedFileRow.append(selectedFileInput);
    elements.settingsContent.append(selectedFileRow);

    const clearFileRow = createFormRow("Clear local file");
    const clearFileBtn = document.createElement("button");
    clearFileBtn.type = "button";
    clearFileBtn.className = "btn";
    clearFileBtn.textContent = "Clear";
    clearFileBtn.disabled = !normalizeText(bg.localMediaDataUrl);
    clearFileBtn.addEventListener("click", () => {
      patchBackground({
        localMediaDataUrl: "",
        localMediaType: "",
        localMediaName: ""
      });
    });
    clearFileRow.append(clearFileBtn);
    elements.settingsContent.append(clearFileRow);

    bgFields.push({
      key: "localMediaBackgroundColor",
      label: "Empty space color",
      type: "color"
    });

    bgFields.push({
      key: "localMediaFit",
      label: "Fit mode",
      type: "select",
      options: [
        { value: "stretch", label: "Stretch" },
        { value: "fit-height", label: "Fit height" },
        { value: "fit-width", label: "Fit width" },
        { value: "original-resolution", label: "Original resolution" }
      ]
    });
  }

  bgFields.push({ key: "overlayOpacity", label: "Overlay opacity", type: "number", min: 0, max: 0.85, step: 0.05 });

  for (const schema of bgFields) {
    appendBackgroundField(schema);
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
      key: "titleAlign",
      label: "Title align",
      type: "select",
      group: "base",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" }
      ]
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
      key: "titleAlign",
      label: "Default title align",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" }
      ]
    },
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
  draft.titleAlign = normalizeTitleAlign(master.titleAlign, defaultWidgetTitleAlign());
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
  blurFocusedElementInOverlay(elements.widgetModalOverlay);
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

  if (widgetTitleRenameState.open) {
    closeWidgetTitleRenameModal();
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
    titleAlign: normalizeTitleAlign(instance.titleAlign, defaultWidgetTitleAlign()),
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
  instance.titleAlign = normalizeTitleAlign(draft.titleAlign, defaultWidgetTitleAlign());
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

function canFitGridPlacement(occupancy, row, col, rowSpan, colSpan) {
  for (let y = row; y < row + rowSpan; y += 1) {
    for (let x = col; x < col + colSpan; x += 1) {
      if (occupancy[y][x]) {
        return false;
      }
    }
  }
  return true;
}

function occupyGridPlacement(occupancy, row, col, rowSpan, colSpan) {
  for (let y = row; y < row + rowSpan; y += 1) {
    for (let x = col; x < col + colSpan; x += 1) {
      occupancy[y][x] = true;
    }
  }
}

function findFirstAvailableBoardGridSlot(page, colSpan, rowSpan) {
  if (!isGridLayoutMode()) {
    return null;
  }

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const metrics = gridMetrics();
  const cols = Math.max(1, Math.floor(metrics.cols || 1));
  const rows = Math.max(1, Math.floor(metrics.rows || 1));
  const placementColSpan = clamp(Math.max(1, Math.floor(colSpan || 1)), 1, cols);
  const placementRowSpan = clamp(Math.max(1, Math.floor(rowSpan || 1)), 1, rows);
  const targetPage = normalizeWidgetPage(page, home.pageCount, 0);
  const occupancy = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (const instance of state.instances || []) {
    if (!instance || instance.enabled === false || isWidgetDocked(instance) || isWidgetInContainer(instance)) {
      continue;
    }
    if (normalizeWidgetPage(instance.page, home.pageCount, 0) !== targetPage) {
      continue;
    }

    const def = widgetRegistry[instance.type];
    const fallback = widgetDefaultGridSize(instance.type, def);
    const grid = normalizeGridLayout(instance.gridLayout, {
      col: 0,
      row: 0,
      colSpan: fallback.colSpan,
      rowSpan: fallback.rowSpan
    });

    if (instance.type === "container") {
      grid.colSpan = 1;
      grid.rowSpan = 1;
    }

    const occupiedColSpan = clamp(grid.colSpan, 1, cols);
    const occupiedRowSpan = clamp(grid.rowSpan, 1, rows);
    const occupiedCol = clamp(grid.col, 0, Math.max(0, cols - occupiedColSpan));
    const occupiedRow = clamp(grid.row, 0, Math.max(0, rows - occupiedRowSpan));
    occupyGridPlacement(occupancy, occupiedRow, occupiedCol, occupiedRowSpan, occupiedColSpan);
  }

  for (let row = 0; row <= rows - placementRowSpan; row += 1) {
    for (let col = 0; col <= cols - placementColSpan; col += 1) {
      if (!canFitGridPlacement(occupancy, row, col, placementRowSpan, placementColSpan)) {
        continue;
      }
      return {
        row,
        col,
        rowSpan: placementRowSpan,
        colSpan: placementColSpan
      };
    }
  }

  return null;
}

function addWidget(type, options = {}) {
  if (state.mode !== "edit") {
    return false;
  }

  const def = widgetRegistry[type];
  if (!def) {
    return false;
  }

  syncLauncherPagingState({ expandToFitInstances: true });
  const viewportPage = currentLauncherViewportPage();
  if (isPlaceholderLauncherPage(viewportPage, currentLauncherPageCount())) {
    const materialized = materializeLauncherPlaceholderPage(viewportPage);
    if (!materialized) {
      return false;
    }
    syncLauncherPagingState({ expandToFitInstances: true });
  }

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
  let gridPlacement = null;

  if (isGridLayoutMode()) {
    gridPlacement = findFirstAvailableBoardGridSlot(targetPage, colSpan, rowSpan);
    if (!gridPlacement) {
      showAddWidgetToast("빈 공간이 없어 위젯을 추가하지 못했습니다. 공간을 비우거나 새 페이지를 추가해 주세요.");
      return false;
    }
  }

  recordHistorySnapshot("Add widget");

  const defaultPadding = widgetPaddingFallback(type);

  const instance = {
    id: `${type}-${state.nextId}`,
    type,
    title: normalizeText(options.title, def.title),
    zIndex: zCounter + 1,
    viewMode: isHeadlessDefaultType(type) ? "headless" : "window",
    surfaceMode: isHeadlessTransparentDefaultType(type) ? "transparent" : "normal",
    transparentAutoContrast: true,
    transparentGhostStrength: 100,
    backdropBlur: defaultWidgetBackdropBlur(type),
    edgeRoundness: 12,
    transparency: 0.94,
    titleAlign: defaultWidgetTitleAlign(),
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
      col: gridPlacement ? gridPlacement.col : pageLocalIndex % 4,
      row: gridPlacement ? gridPlacement.row : Math.floor(pageLocalIndex / 4),
      colSpan: gridPlacement ? gridPlacement.colSpan : colSpan,
      rowSpan: gridPlacement ? gridPlacement.rowSpan : rowSpan
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
  return true;
}

async function resetState() {
  recordHistorySnapshot("Reset state");
  const resetMutationClock = readUserMutationClock(state);
  const keptPresets = Array.isArray(state?.presets) ? state.presets : [];
  const keptDefaultProfileSnapshot =
    state?.ui?.defaultProfileSnapshot && typeof state.ui.defaultProfileSnapshot === "object"
      ? clonePresetSnapshot(state.ui.defaultProfileSnapshot)
      : null;
  const keptDefaultProfileUpdatedAt = Math.max(0, Number(state?.ui?.defaultProfileUpdatedAt) || 0);
  state = await resolveStartupStateDefault();
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
    ".edit-dock",
    ".persistent-dock",
    ".board-context-menu",
    ".drag-delete-zone"
  ].join(",");

  if (target.closest(blockedZones)) {
    return false;
  }

  const widgetZones = [
    ".widget-card",
    ".dock-widget-item",
    ".widget-folder-panel",
    ".widget-folder-item-card"
  ].join(",");

  if (target.closest(widgetZones)) {
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

  const home = syncLauncherPagingState({ expandToFitInstances: true });
  const pageCount = home.pageCount;
  const activePage = state.mode === "edit" ? currentLauncherViewportPage() : currentLauncherActivePage();
  const minPage = state.mode === "edit" ? -1 : 0;
  const maxPage = state.mode === "edit" ? pageCount : Math.max(0, pageCount - 1);
  const threshold = Math.max(34, Math.min(130, Math.round((elements.board?.clientWidth || 1) * 0.14)));
  let nextPage = activePage;

  if (dx <= -threshold || velocity <= -0.42) {
    nextPage = activePage + 1;
  } else if (dx >= threshold || velocity >= 0.42) {
    nextPage = activePage - 1;
  }

  nextPage = clamp(nextPage, minPage, maxPage);
  if (state.mode === "edit" && isPlaceholderLauncherPage(nextPage, pageCount)) {
    setLauncherVirtualPage(nextPage, { animate: true });
  } else {
    setActiveLauncherPage(nextPage, { shouldSave: true, animate: true });
  }
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

  elements.workspace?.addEventListener(
    "pointerdown",
    (event) => {
      beginBoardSwipe(event);
    },
    true
  );

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
    runtimeSettingsPanelOpen = !runtimeSettingsPanelOpen;
    syncSettingsPanelVisibility();
  });

  elements.settingsPanelBackdrop?.addEventListener("click", () => {
    if (!runtimeSettingsPanelOpen) {
      return;
    }
    runtimeSettingsPanelOpen = false;
    syncSettingsPanelVisibility();
  });

  elements.bgRefreshBtn?.addEventListener("click", () => {
    refreshBackgroundNow();
  });

  elements.modeToggleBtn.addEventListener("click", () => {
    const nextMode = state.mode === "edit" ? "use" : "edit";
    let deferBoundsSync = false;

    if (state.mode === "edit" && nextMode === "use") {
      const pageCount = currentLauncherPageCount();
      const viewportPage = currentLauncherViewportPage();
      if (isPlaceholderLauncherPage(viewportPage, pageCount)) {
        setActiveLauncherPage(currentLauncherActivePage(), { animate: true });
        deferBoundsSync = true;
      }
    }

    state.mode = nextMode;
    if (state.mode === "use") {
      state.selectedWidgetId = "";
      compactEmptyLauncherPagesForUseMode();
    }
    setBodyMode();
    setSelected(state.selectedWidgetId);
    refreshAllWidgets();

    const syncBounds = () => {
      updateBoardBounds();
      requestAnimationFrame(() => {
        updateBoardBounds();
      });
    };

    if (deferBoundsSync) {
      window.setTimeout(syncBounds, BOARD_PAGE_TRANSITION_MS + 20);
    } else {
      syncBounds();
    }
  });

  elements.homePageAnchorBtn?.addEventListener("click", () => {
    if (state.mode !== "edit") {
      return;
    }
    const targetPage = resolveHomeAnchorTargetPage();
    if (!Number.isFinite(targetPage)) {
      showAddWidgetToast("실제 페이지에서만 홈 화면으로 지정할 수 있어요.");
      return;
    }
    setLauncherHomePage(targetPage);
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
  });

  elements.tabBackgroundBtn?.addEventListener("click", () => {
    state.ui.activeTab = "background";
    renderSettings();
  });

  elements.tabProfileBtn?.addEventListener("click", () => {
    state.ui.activeTab = "profile";
    renderSettings();
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

  elements.boardContextAddWidgetBtn?.addEventListener("click", () => {
    closeBoardContextMenu();
    if (state.mode !== "edit") {
      state.mode = "edit";
      setBodyMode();
      setSelected(state.selectedWidgetId);
      refreshAllWidgets();
      updateBoardBounds();
      requestAnimationFrame(() => {
        updateBoardBounds();
      });
      queueSave();
    }
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
    void resetState();
  });

  elements.undoBtn?.addEventListener("click", () => {
    undoLastChange();
  });

  elements.redoBtn?.addEventListener("click", () => {
    redoLastChange();
  });

  window.addEventListener("resize", () => {
    closeBoardContextMenu();
    if (elements.editDock?.classList.contains("is-positioned")) {
      const left = Number.parseFloat(elements.editDock.style.left) || 0;
      const top = Number.parseFloat(elements.editDock.style.top) || 0;
      applyEditDockPosition(left, top);
    }
    updateBoardBounds();
    syncPersistentDock();
  });


  const flushStateOnLifecycleEvent = () => {
    flushPendingSave({ allowWithoutUserMutation: true });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushStateOnLifecycleEvent();
    }
  });

  window.addEventListener("pagehide", () => {
    flushStateOnLifecycleEvent();
  });

  window.addEventListener("beforeunload", () => {
    flushStateOnLifecycleEvent();
  });

  window.addEventListener("blur", () => {
    closeBoardContextMenu();
  });

  elements.widgetModalCloseBtn?.addEventListener("click", () => {
    closeWidgetModal(false);
  });

  elements.widgetTitleRenameCloseBtn?.addEventListener("click", () => {
    closeWidgetTitleRenameModal();
  });

  elements.widgetTitleRenameCancelBtn?.addEventListener("click", () => {
    closeWidgetTitleRenameModal();
  });

  elements.widgetTitleRenameOkBtn?.addEventListener("click", () => {
    applyWidgetTitleRenameModal();
  });

  elements.widgetTitleRenameOverlay?.addEventListener("pointerdown", (event) => {
    if (event.target === elements.widgetTitleRenameOverlay) {
      closeWidgetTitleRenameModal();
    }
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

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!boardContextMenuState.open) {
        return;
      }
      if (isInsideBoardContextMenu(event.target)) {
        return;
      }
      closeBoardContextMenu();
    },
    true
  );
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
      const opened = canOpenBoardContextMenuFromTarget(event.target)
        ? openBoardContextMenu(event.clientX, event.clientY)
        : false;
      if (!opened) {
        closeBoardContextMenu();
      }
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

    if (boardContextMenuState.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeBoardContextMenu();
      }
      return;
    }

    if (widgetTitleRenameState.open) {
      if (!isInsideWidgetTitleRenameOverlay(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeWidgetTitleRenameModal();
        return;
      }

      if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        applyWidgetTitleRenameModal();
        return;
      }
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
  const startupState = await getStartupStateFromLocation();
  const loaded = startupState
    ? startupState
    : (await loadState(await resolveStartupStateDefault()));
  const normalizedLoaded = applyRuntimeOnlyPolicyToSnapshot(structuredClone(loaded));
  lastSavedFingerprint = snapshotFingerprint(normalizedLoaded);
  lastSavedUserMutationAt = readUserMutationClock(normalizedLoaded);
  saveInFlightFingerprint = "";
  state = hydrate(normalizedLoaded);
  const home = syncLauncherPagingState({ expandToFitInstances: true });
  home.activePage = normalizeActivePage(home.homePage, home.pageCount, home.activePage);
  state.ui.home = home;
  launcherPageUiState.virtualPage = null;
  runtimeSettingsPanelOpen = false;
  wireStorageSync();
  if (
    state.ui.home.legacyHeadlessSurfaceMigrated &&
    normalizedLoaded?.ui?.home?.legacyHeadlessSurfaceMigrated !== true
  ) {
    queueSave({ allowWithoutUserMutation: true });
  }

  applyTheme();
  applyBackground();
  wireEvents();
  renderBoard();
}

void init();
