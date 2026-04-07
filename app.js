import { STORAGE_KEY, loadState, saveState } from "./storage.js";
import { defaultWidgetType, widgetRegistry, widgetList } from "./widgets/index.js";
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
  createNoneDropPlan
} from "./core/launcherDropPlan.js";
import {
  applyLauncherHomeMetadata,
  normalizeActivePage,
  normalizeLauncherPageIndexList,
  normalizePageCount,
  normalizeWidgetPage,
  remapLauncherPageIndexList,
  remapPageForDeletion,
  resolvePageTowardHomeDirection,
  shiftLauncherPageIndexListOnDelete,
  shiftLauncherPageIndexListOnInsert
} from "./core/launcher-pages.js";
import {
  defaultHomeLayout,
  gapPresetToPx,
  marginPresetToPx,
  normalizeDockHeight,
  normalizeDockLength,
  normalizeDockShape,
  normalizeDockSize,
  normalizeDockVisibility,
  normalizeHomeLayout
} from "./core/home-layout.js";
import {
  clamp,
  cloneLayout,
  idSuffix,
  normalizeContainerExpandedCols,
  normalizeContainerExpandedRows,
  normalizeGridLayout,
  widgetDefaultGridSize
} from "./core/layout-primitives.js";
import {
  SHORT_TEXT_MIN_CONTENT_FONT_SCALE,
  SHORT_TEXT_WIDGET_TYPES,
  applyWidgetCommonMaster,
  defaultPresets,
  defaultWidgetBackdropBlur,
  defaultWidgetCommonMaster,
  defaultWidgetContentAlign,
  defaultWidgetTitleAlign,
  inferCommonOverrides,
  instanceCommonValue,
  isHeadlessDefaultType,
  isHeadlessTransparentDefaultType,
  normalizeAlign,
  normalizeCommonOverrides,
  normalizeContentPadding,
  normalizeEdgeRoundness,
  normalizeHexColor,
  normalizeSurfaceMode,
  normalizeTitleAlign,
  normalizeTransparency,
  normalizeTransparentGhostStrength,
  normalizeWidgetColor,
  normalizeWidgetCommonMaster,
  normalizeWidgetContentFontScale,
  normalizeWidgetThemeMode,
  resolveTransparentGhostOpacity,
  resolveTransparentWidgetText,
  srgbToLinear,
  resolveWidgetPadding,
  setInstanceCommonValue,
  widgetPaddingFallback
} from "./core/widget-common-style.js";
import {
  applyCardVisual as applyCardVisualCore
} from "./core/widget-card-visual.js";
import {
  buildDragPayloadWithPreviewOffset as buildDragPayloadWithPreviewOffsetCore,
  createDragPreviewSession as createDragPreviewSessionCore,
  createWidgetDragPreview as createWidgetDragPreviewCore,
  positionWidgetDragPreview as positionWidgetDragPreviewCore
} from "./core/drag-preview.js";
import {
  resolveBoundedDragPositionFromDelta,
  resolveDraftPlacementAtPointer,
  resolveSnappedPosition
} from "./core/drag-positioning.js";
import {
  createDeferredEdgeSwitchScheduler as createDeferredEdgeSwitchSchedulerCore,
  resolveEdgeDirectionFromPointer as resolveEdgeDirectionFromPointerCore
} from "./core/drag-page-switch.js";
import {
  buildDragGuideState as buildDragGuideStateCore,
  evaluateFinalWidgetDrop as evaluateFinalWidgetDropCore,
  evaluateWidgetDropAtPointer as evaluateWidgetDropAtPointerCore
} from "./core/drag-drop-evaluation.js";
import {
  applyDropPlanIndicators as applyDropPlanIndicatorsCore,
  resolveWidgetDropPlan as resolveWidgetDropPlanCore,
  updateCrossSurfaceDropIndicators as updateCrossSurfaceDropIndicatorsCore
} from "./core/drag-drop-orchestration.js";
import {
  createDropGuideRuntime
} from "./core/drop-guide-runtime.js";
import {
  applyWidgetDropPlanByKind
} from "./core/widget-drop-plan-apply.js";
import {
  dockSlotOccupants as dockSlotOccupantsCore,
  firstAvailableDockSlot as firstAvailableDockSlotCore,
  isWidgetDocked,
  nextDockOrder as nextDockOrderCore,
  normalizeDockOrder,
  normalizeDockedWidgetOrders as normalizeDockedWidgetOrdersCore
} from "./core/dock-state.js";
import {
  isWidgetInContainer,
  normalizeContainerAssignments,
  normalizeContainerId
} from "./core/container-state.js";
import {
  isHorizontalDockPosition,
  resolveDockSlotIndexAtPoint,
  resolveDockSlotRectRelativeToHost
} from "./core/dock-geometry.js";
import {
  hasContentPaddingChanged,
  projectContentPaddingFromDrag
} from "./core/padding-drag.js";
import {
  createLongPressDragController as createLongPressDragControllerCore
} from "./core/long-press-drag.js";
import {
  startFreeResizeSession,
  startGridResizeSession
} from "./core/resize-session.js";
import {
  renderLauncherPageAffordancesView as renderLauncherPageAffordancesViewCore
} from "./core/launcher-page-affordances.js";
import {
  createColorControl,
  createFormRow,
  createSectionChip,
  isThemeFieldKey,
  normalizeDisplayColor,
  settingsEventName
} from "./core/settings-controls.js";
import {
  createInputBySchema as createInputBySchemaCore,
  readFieldValueBySchema as readFieldValueBySchemaCore
} from "./core/settings-input-schema.js";
import {
  buildWidgetModalCommonFields
} from "./core/widget-modal-fields.js";
import {
  renderBackgroundSettingsView
} from "./core/background-settings-render.js";
import {
  createBackgroundRuntime
} from "./core/background-runtime.js";
import {
  createBackgroundWallpaperRuntime
} from "./core/background-wallpaper-runtime.js";
import {
  createBackgroundLocalMediaRuntime
} from "./core/background-local-media-runtime.js";
import {
  createBackgroundVideoCacheRuntime
} from "./core/background-video-cache-runtime.js";
import {
  createBackgroundBlurRuntime
} from "./core/background-blur-runtime.js";
import {
  requestWallpaperLuminanceSample as requestWallpaperLuminanceSampleRuntime
} from "./core/wallpaper-luminance-runtime.js";
import {
  findFirstAvailableBoardGridSlot as findFirstAvailableBoardGridSlotCore
} from "./core/board-grid-slot.js";
import {
  resolveBoardSwipeNextPage,
  resolveBoardSwipeStartState,
  resolveBoardSwipeThreshold
} from "./core/board-swipe.js";
import {
  renderGlobalSettingsView
} from "./core/global-settings-render.js";
import {
  renderProfileSettingsView
} from "./core/profile-settings-render.js";
import {
  applyProfileSnapshotFlow
} from "./core/profile-apply-flow.js";
import {
  applyCommonMasterToDraft as applyCommonMasterToDraftCore,
  buildWidgetModalDraft as buildWidgetModalDraftCore
} from "./core/widget-modal-draft.js";
import {
  applyWidgetDraftToInstance as applyWidgetDraftToInstanceCore,
  normalizeContainerWidgetDraftConfig as normalizeContainerWidgetDraftConfigCore
} from "./core/widget-modal-apply.js";
import {
  refreshWidgetRuntimeAfterModalApply,
  syncWidgetStateAfterModalApply
} from "./core/widget-modal-apply-effects.js";
import {
  applyFreeLayoutPlacement,
  createWidgetInstanceDraft
} from "./core/widget-instance-factory.js";
import {
  countBoardWidgetsOnPage,
  resolveRequestedWidgetSpans
} from "./core/widget-add-plan.js";
import {
  addWidgetFlow
} from "./core/widget-add-flow.js";
import {
  captureResetPreservedData,
  restoreResetPreservedData
} from "./core/reset-state-preservation.js";
import {
  resolveAveragePaddingValue,
  resolveDirectionalPaddingFromDraft
} from "./core/widget-padding-normalization.js";
import {
  canStartBoardSwipeFromTarget as canStartBoardSwipeFromTargetCore,
  isInteractiveSwipeTarget as isInteractiveSwipeTargetCore,
  isTextEditableTarget as isTextEditableTargetCore
} from "./core/swipe-targets.js";
import {
  isShortcutIconEditorField,
  shouldRenderWidgetModalField
} from "./core/widget-modal-field-visibility.js";
import {
  renderWidgetModalFieldsView
} from "./core/widget-modal-fields-render.js";
import {
  createWidgetModalRuntime
} from "./core/widget-modal-runtime.js";
import {
  attachWidgetTypeActions
} from "./core/widget-card-actions.js";
import {
  attachWidgetCardClickBehavior
} from "./core/widget-card-click-behavior.js";
import {
  startWidgetPaddingDragSession
} from "./core/widget-card-padding-drag.js";
import {
  attachWidgetResizeHandle
} from "./core/widget-card-resize-handle.js";
import {
  attachWidgetCardInteractionEvents
} from "./core/widget-card-interaction-events.js";
import {
  startWidgetCardDragSession
} from "./core/widget-card-drag-session.js";
import {
  createWidgetCardRuntime
} from "./core/widget-card-runtime.js";
import {
  createWidgetStateRuntime
} from "./core/widget-state-runtime.js";
import {
  projectWidgetBoardDropLayoutRuntime
} from "./core/widget-drop-projection.js";
import {
  patchBackgroundRuntime
} from "./core/background-patch.js";
import {
  materializeHistorySnapshotRuntime
} from "./core/history-snapshot-materialize.js";
import {
  createHistoryUndoRuntime
} from "./core/history-undo-runtime.js";
import {
  moveWidgetToDockSlotRuntime
} from "./core/dock-slot-move.js";
import {
  createWidgetDropSurfaceRuntime
} from "./core/widget-drop-surface-runtime.js";
import {
  createContainerDropRuntime
} from "./core/container-drop-runtime.js";
import {
  createContainerOrderRuntime
} from "./core/container-order-runtime.js";
import {
  createDockInteractionsRuntime
} from "./core/dock-interactions-runtime.js";
import {
  createShortcutIconEditorRuntime
} from "./core/shortcut-icon-editor-runtime.js";
import {
  createStateExportSanitizer
} from "./core/state-export-sanitize.js";
import {
  createPresetManagementRuntime
} from "./core/preset-management-runtime.js";
import {
  createPersistenceRuntime
} from "./core/persistence-runtime.js";
import {
  wireDockAndSwipeEvents
} from "./core/wire-events-dock-and-swipe.js";
import {
  wireOverlayControlEvents
} from "./core/wire-events-overlays.js";
import {
  wireDocumentGuardEvents
} from "./core/wire-events-document-guards.js";
import {
  wireSettingsAndModeEvents
} from "./core/wire-events-settings-mode.js";
import {
  wireWidgetControlEvents
} from "./core/wire-events-widget-controls.js";
import {
  wireWindowLifecycleEvents
} from "./core/wire-events-window-lifecycle.js";
import {
  wireKeydownEvents
} from "./core/wire-events-keydown.js";
import {
  beginBoardSwipeSession,
  endBoardSwipeSession,
  moveBoardSwipeSession
} from "./core/board-swipe-session.js";
import {
  wireAppEvents
} from "./core/wire-events-main.js";
import {
  buildWidgetControllerContext
} from "./core/widget-controller-context.js";
import {
  renderDockWidgetsView
} from "./core/dock-widgets-render.js";
import {
  createDockWidgetsRuntime
} from "./core/dock-widgets-runtime.js";
import {
  applyGridLayoutRuntime
} from "./core/grid-layout-apply.js";
import {
  hydrateState
} from "./core/hydrate-state.js";
import {
  isStateObject,
  mergeStateObjects
} from "./core/state/merge.js";
import {
  normalizeText
} from "./core/utils/text.js";
import {
  syncPersistentDockView
} from "./core/persistent-dock-render.js";
import {
  clampLauncherVirtualPage,
  isPlaceholderLauncherPage as isPlaceholderLauncherPageCore,
  resolveLauncherViewportPage,
  shouldRenderLauncherPlaceholderPage as shouldRenderLauncherPlaceholderPageCore
} from "./core/launcher-viewport.js";
import {
  createLauncherPageRuntime
} from "./core/launcher-page-runtime.js";

const SNAP = 20;
const LONG_PRESS_DRAG_DELAY_MS = 340;
const SHORTCUT_LONG_PRESS_DRAG_DELAY_MS = 220;
const LONG_PRESS_DRAG_MOVE_TOLERANCE = 18;
const GRID_MAX_ROW_SPAN = 24;
const GRID_MAX_COLUMNS = 16;
const GRID_MAX_ROWS = 16;
const MAX_LAUNCHER_PAGES = 12;
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
  return loadStartupStateFromJsonValueWithPolicy(rawValue, createStartupStatePolicyOptions(options));
}

function createStartupStatePolicyOptions(options = {}) {
  return {
    ...options,
    isStateObject,
    mergeStateObjects,
    baseOrigin: location.origin
  };
}

function getChromeRuntimeGetUrl() {
  return chrome?.runtime?.getURL ? chrome.runtime.getURL.bind(chrome.runtime) : null;
}

async function getStartupStateFromLocation() {
  return getStartupStateFromLocationWithPolicy(createStartupStatePolicyOptions({
    search: window.location.search,
    startupStateQueryKey: STARTUP_STATE_QUERY_KEY,
    startupStateInlineQueryKey: STARTUP_STATE_INLINE_QUERY_KEY,
    startupStateEmptyWidgetsQueryKey: STARTUP_STATE_EMPTY_WIDGETS_QUERY_KEY,
    fetchFn: fetch,
    cache: "no-store",
    logger: console
  }));
}

async function loadStartupStateFromConfigFile() {
  return loadStartupStateFromConfigFileWithPolicy(createStartupStatePolicyOptions({
    startupStateJsonPath: STARTUP_STATE_JSON_PATH,
    runtimeGetUrl: getChromeRuntimeGetUrl(),
    fetchFn: fetch,
    cache: "no-store"
  }));
}

async function resolveStartupStateDefault() {
  return resolveStartupStateDefaultWithPolicy({
    defaultState,
    ...createStartupStatePolicyOptions({
      startupStateJsonPath: STARTUP_STATE_JSON_PATH,
      runtimeGetUrl: getChromeRuntimeGetUrl(),
      fetchFn: fetch,
      cache: "no-store"
    })
  });
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

/**
 * @typedef {Object} DockConfig
 * @property {boolean} enabled
 * @property {"raised" | "flat"} shape
 * @property {"fixed" | "collapsible"} visibility
 * @property {number} lengthUnits
 * @property {number} heightPx
 * @property {"bottom"} position
 */

function nextDockOrder(instances = state?.instances) {
  return nextDockOrderCore(instances, {
    isInContainer: isWidgetInContainer
  });
}

function normalizeDockedWidgetOrders(instances, home = state?.ui?.home) {
  const slotCount = Math.max(1, buildDockConfig(home).lengthUnits);
  return normalizeDockedWidgetOrdersCore(instances, {
    slotCount,
    isInContainer: isWidgetInContainer
  });
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
  return isHorizontalDockPosition(config.position);
}

function dockSlotOccupants({ excludeWidgetId = "" } = {}) {
  return dockSlotOccupantsCore(state?.instances || [], {
    slotCount: dockSlotCount(),
    excludeWidgetId,
    isInContainer: isWidgetInContainer
  });
}

function firstAvailableDockSlot({ excludeWidgetId = "" } = {}) {
  return firstAvailableDockSlotCore(state?.instances || [], {
    slotCount: dockSlotCount(),
    excludeWidgetId,
    isInContainer: isWidgetInContainer
  });
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

  const stripStyle = window.getComputedStyle(strip);
  const gapFallback = cssPixelValue(stripStyle.gap, 6);
  const horizontal = isHorizontalDock(config);
  const gap = horizontal
    ? cssPixelValue(stripStyle.columnGap, gapFallback)
    : cssPixelValue(stripStyle.rowGap, gapFallback);

  return resolveDockSlotIndexAtPoint(clientX, clientY, {
    stripRect: rect,
    slotCount,
    unitSize: config.heightPx,
    gap,
    horizontal,
    clampToRange
  });
}

function dockSlotRectRelativeToHost(slotIndex) {
  const dockHost = elements.persistentDockBody ?? elements.persistentDock;
  const strip = elements.dockWidgetStrip;
  if (!(dockHost instanceof HTMLElement) || !(strip instanceof HTMLElement)) {
    return null;
  }

  const config = buildDockConfig(state?.ui?.home);
  const slotCount = Math.max(1, config.lengthUnits);

  const stripStyle = window.getComputedStyle(strip);
  const gapFallback = cssPixelValue(stripStyle.gap, 6);
  const horizontal = isHorizontalDock(config);
  const gap = horizontal
    ? cssPixelValue(stripStyle.columnGap, gapFallback)
    : cssPixelValue(stripStyle.rowGap, gapFallback);
  const unit = Math.max(1, Number(config.heightPx) || 44);

  const dockRect = dockHost.getBoundingClientRect();
  const stripRect = strip.getBoundingClientRect();
  return resolveDockSlotRectRelativeToHost(slotIndex, {
    hostRect: dockRect,
    stripRect,
    slotCount,
    unitSize: unit,
    gap,
    horizontal
  });
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
  return moveWidgetToDockSlotRuntime(instance, targetSlot, { record }, {
    getState: () => state,
    buildDockConfig,
    clamp,
    isDockEligibleWidget,
    normalizeDockOrder,
    dockSlotOccupants,
    firstAvailableDockSlot,
    recordHistorySnapshot,
    touchUserMutationClock,
    isWidgetInContainer,
    setWidgetContainer,
    normalizeDockedWidgetOrders,
    setDockActiveId,
    modalState,
    closeWidgetModal
  });
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

const persistenceRuntime = createPersistenceRuntime({
  storageKey: STORAGE_KEY,
  getState: () => state,
  getSaveTimer: () => saveTimer,
  setSaveTimer: (value) => {
    saveTimer = value;
  },
  getSaveAllowsNonUserMutation: () => saveAllowsNonUserMutation,
  setSaveAllowsNonUserMutation: (value) => {
    saveAllowsNonUserMutation = value;
  },
  getLastSavedFingerprint: () => lastSavedFingerprint,
  setLastSavedFingerprint: (value) => {
    lastSavedFingerprint = value;
  },
  getLastSavedUserMutationAt: () => lastSavedUserMutationAt,
  setLastSavedUserMutationAt: (value) => {
    lastSavedUserMutationAt = value;
  },
  getSaveInFlightFingerprint: () => saveInFlightFingerprint,
  setSaveInFlightFingerprint: (value) => {
    saveInFlightFingerprint = value;
  },
  getSaveChain: () => saveChain,
  setSaveChain: (value) => {
    saveChain = value;
  },
  setTimeout,
  clearTimeout,
  now: () => Date.now(),
  randomToken: () => Math.random().toString(16).slice(2, 8),
  structuredClone,
  applyRuntimeOnlyPolicyToSnapshot,
  chromeStorageLocalGet: (key) => chrome.storage.local.get(key),
  chromeStorageOnChangedAddListener: (handler) => {
    if (!chrome?.storage?.onChanged?.addListener) {
      return;
    }
    chrome.storage.onChanged.addListener(handler);
  },
  saveState,
  clearUndoRedo: () => {
    undoState.undoStack.length = 0;
    undoState.redoStack.length = 0;
  },
  restoreFromSnapshot,
  buildPersistSnapshot,
  onPersistError: (error) => {
    console.warn("Failed to persist dashboard state", error);
  }
});

const historyUndoRuntime = createHistoryUndoRuntime({
  getState: () => state,
  getUndoState: () => undoState,
  historyLimit: HISTORY_LIMIT,
  buildHistorySnapshot,
  snapshotFingerprint,
  touchUserMutationClock,
  materializeHistorySnapshot,
  restoreFromSnapshot
});

const presetManagementRuntime = createPresetManagementRuntime({
  getState: () => state,
  applyRuntimeOnlyPolicyToPresetSnapshot,
  structuredClone,
  normalizeSurfaceMode,
  normalizeEdgeRoundness,
  normalizeTitleAlign,
  defaultWidgetTitleAlign,
  normalizeAlign,
  defaultWidgetContentAlign,
  normalizeTransparency,
  normalizeText,
  recordHistorySnapshot,
  renderSettings,
  queueSave,
  applyProfileSnapshot
});

function clonePresetSnapshot(snapshot) {
  return presetManagementRuntime.clonePresetSnapshot(snapshot);
}

function createStateSnapshot() {
  return presetManagementRuntime.createStateSnapshot();
}

function inferNextId(instances, fallback) {
  return presetManagementRuntime.inferNextId(instances, fallback);
}

function savePreset(nameInput) {
  return presetManagementRuntime.savePreset(nameInput);
}

function applyProfileSnapshot(snapshotInput, scope = "all") {
  applyProfileSnapshotFlow(snapshotInput, scope, {
    state,
    clonePresetSnapshot,
    hydrate,
    normalizeHomeLayout,
    normalizeWidgetCommonMaster,
    clamp,
    normalizeMondayGlobalSettings,
    inferNextId,
    applyWidgetCommonMaster,
    inferCommonOverrides,
    syncLauncherPagingState,
    closeWidgetModal,
    applyTheme,
    setBodyMode,
    applyBackground,
    renderBoard,
    runtimeMap: runtime,
    applyCardVisual,
    refreshAllWidgets,
    applyGridLayout,
    updateBoardBounds,
    renderSettings,
    queueSave
  });
}

function loadPresetById(presetId, scope = "all") {
  return presetManagementRuntime.loadPresetById(presetId, scope);
}

function saveCurrentAsDefaultProfile() {
  return presetManagementRuntime.saveCurrentAsDefaultProfile();
}

function loadDefaultProfile(scope = "all") {
  return presetManagementRuntime.loadDefaultProfile(scope);
}

function clearDefaultProfile() {
  return presetManagementRuntime.clearDefaultProfile();
}

function deletePresetById(presetId) {
  return presetManagementRuntime.deletePresetById(presetId);
}

const stateExportSanitizer = createStateExportSanitizer({
  sensitiveKeywordParts: SENSITIVE_EXPORT_KEYWORD_PARTS,
  volatileBackgroundKeywordParts: VOLATILE_BACKGROUND_KEYWORD_PARTS,
  redactedValue: REDACTED_EXPORT_VALUE
});

function normalizeSensitiveKeyPart(value) {
  return stateExportSanitizer.normalizeSensitiveKeyPart(value);
}

function isSensitiveExportKey(key) {
  return stateExportSanitizer.isSensitiveExportKey(key);
}

function isVolatileBackgroundExportKey(key) {
  return stateExportSanitizer.isVolatileBackgroundExportKey(key);
}

function sanitizeCredentialQueryParamsInString(value) {
  return stateExportSanitizer.sanitizeCredentialQueryParamsInString(value);
}

function sanitizeStateExportValue(value, pathParts = []) {
  return stateExportSanitizer.sanitizeStateExportValue(value, pathParts);
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
  return hydrateState(raw, {
    defaultState,
    widgetRegistry,
    isHeadlessTransparentDefaultType,
    isHeadlessDefaultType,
    normalizeSurfaceMode,
    resolveWidgetPadding,
    normalizeContainerExpandedCols,
    normalizeContainerExpandedRows,
    clamp,
    normalizeText,
    applyRuntimeOnlyWidgetConfigDefaults,
    normalizeGridLayout,
    widgetDefaultGridSize,
    cloneLayout,
    idSuffix,
    defaultWidgetBackdropBlur,
    normalizeTransparentGhostStrength,
    normalizeEdgeRoundness,
    normalizeTransparency,
    normalizeTitleAlign,
    defaultWidgetTitleAlign,
    normalizeAlign,
    defaultWidgetContentAlign,
    normalizeContentPadding,
    normalizeWidgetContentFontScale,
    normalizeWidgetThemeMode,
    normalizeWidgetColor,
    normalizeCommonOverrides,
    normalizeWidgetPage,
    normalizeDockOrder,
    normalizeContainerId,
    normalizeDockedWidgetOrders,
    normalizeContainerAssignments,
    defaultTheme,
    defaultBackground,
    isWidgetDocked,
    isWidgetInContainer,
    normalizeHomeLayout,
    normalizeWidgetCommonMaster,
    normalizeMondayGlobalSettings,
    clonePresetSnapshot,
    normalizeHexColor,
    normalizeWallpaperProvider,
    normalizeVideoSource,
    normalizeLocalMediaType,
    normalizeLocalMediaFit,
    inferLocalMediaTypeFromDataUrl,
    inferCommonOverrides,
    applyWidgetCommonMaster,
    maxLauncherPages: MAX_LAUNCHER_PAGES
  });
}

function persistLatestSnapshot({ allowNonUserMutation = false } = {}) {
  return persistenceRuntime.persistLatestSnapshot({ allowNonUserMutation });
}

function flushPendingSave(options = {}) {
  return persistenceRuntime.flushPendingSave(options);
}

function queueSave(options = {}) {
  return persistenceRuntime.queueSave(options);
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
  return materializeHistorySnapshotRuntime(historySnapshotInput, {
    buildSessionSnapshot,
    isStateObject,
    buildHistoryBackgroundSnapshot,
    buildHistoryHomeSnapshot,
    normalizeHomeLayout,
    normalizeActivePage,
    normalizeMondayGlobalSettings
  });
}

function snapshotFingerprint(snapshot) {
  return persistenceRuntime.snapshotFingerprint(snapshot);
}

function nextPersistFingerprint(snapshot, userMutationAt, allowNonUserMutation) {
  return persistenceRuntime.nextPersistFingerprint(snapshot, userMutationAt, allowNonUserMutation);
}

function normalizeStoredSnapshot(value) {
  return persistenceRuntime.normalizeStoredSnapshot(value);
}

async function readStoredSnapshot() {
  return persistenceRuntime.readStoredSnapshot();
}

async function saveSnapshotIfNotStale(snapshot, fingerprint, userMutationAt) {
  return persistenceRuntime.saveSnapshotIfNotStale(snapshot, fingerprint, userMutationAt);
}

function syncFromExternalSnapshot(snapshotInput) {
  return persistenceRuntime.syncFromExternalSnapshot(snapshotInput);
}

function wireStorageSync() {
  return persistenceRuntime.wireStorageSync();
}

function readUserMutationClock(source = state) {
  return persistenceRuntime.readUserMutationClock(source);
}

function touchUserMutationClock() {
  return persistenceRuntime.touchUserMutationClock();
}

function recordHistorySnapshot(label = "Update") {
  return historyUndoRuntime.recordHistorySnapshot(label);
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
  return historyUndoRuntime.undoLastChange();
}

function redoLastChange() {
  return historyUndoRuntime.redoLastChange();
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
    return false;
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
  return true;
}

const shortcutIconEditorRuntime = createShortcutIconEditorRuntime({
  elements,
  shortcutIconEditorState,
  shortcutIconPresets: SHORTCUT_ICON_PRESETS,
  shortcutIconCacheKey: SHORTCUT_ICON_CACHE_KEY,
  normalizeText,
  clamp,
  defaultTheme,
  normalizeDisplayColor,
  getTheme: () => state?.ui?.theme,
  blurFocusedElementInOverlay,
  storageLocalGet: (key) => {
    if (!chrome?.storage?.local?.get) {
      return Promise.resolve({});
    }
    return chrome.storage.local.get(key);
  },
  documentObj: document
});

function shortcutEditorContext() {
  return shortcutIconEditorRuntime.shortcutEditorContext();
}

function normalizeShortcutIconShape(value) {
  return shortcutIconEditorRuntime.normalizeShortcutIconShape(value);
}

function normalizeShortcutIconCache(raw) {
  return shortcutIconEditorRuntime.normalizeShortcutIconCache(raw);
}

function escapeXml(text) {
  return shortcutIconEditorRuntime.escapeXml(text);
}

function shortcutEditorThemeColors() {
  return shortcutIconEditorRuntime.shortcutEditorThemeColors();
}

function shortcutEditorShapeSvg(shape, inset, fill, stroke, strokeWidth = 6) {
  return shortcutIconEditorRuntime.shortcutEditorShapeSvg(shape, inset, fill, stroke, strokeWidth);
}

function shortcutEditorClipShapeSvg(shape, inset) {
  return shortcutIconEditorRuntime.shortcutEditorClipShapeSvg(shape, inset);
}

function shortcutEditorSelectedPreset() {
  return shortcutIconEditorRuntime.shortcutEditorSelectedPreset();
}

function renderShortcutEditorPreviewDataUrl(dataUrl) {
  return shortcutIconEditorRuntime.renderShortcutEditorPreviewDataUrl(dataUrl);
}

function shortcutEditorBuildDataUrl() {
  return shortcutIconEditorRuntime.shortcutEditorBuildDataUrl();
}

function shortcutEditorRefreshPreview() {
  return shortcutIconEditorRuntime.shortcutEditorRefreshPreview();
}

function renderShortcutIconEditorPresetGrid() {
  return shortcutIconEditorRuntime.renderShortcutIconEditorPresetGrid();
}

function renderShortcutIconEditorCachedGrid() {
  return shortcutIconEditorRuntime.renderShortcutIconEditorCachedGrid();
}

async function loadShortcutIconEditorCacheEntries() {
  return shortcutIconEditorRuntime.loadShortcutIconEditorCacheEntries();
}

function clearShortcutIconEditorCanvas() {
  return shortcutIconEditorRuntime.clearShortcutIconEditorCanvas();
}

function resetShortcutIconEditorSource() {
  return shortcutIconEditorRuntime.resetShortcutIconEditorSource();
}

function closeShortcutIconEditor() {
  return shortcutIconEditorRuntime.closeShortcutIconEditor();
}

function openShortcutIconEditor(iconValue, onApply) {
  return shortcutIconEditorRuntime.openShortcutIconEditor(iconValue, onApply);
}

function applyShortcutIconEditor() {
  return shortcutIconEditorRuntime.applyShortcutIconEditor();
}

function loadImageIntoShortcutEditor(file) {
  return shortcutIconEditorRuntime.loadImageIntoShortcutEditor(file);
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
  return applyCardVisualCore(card, instance, {
    normalizeSurfaceMode,
    normalizeEdgeRoundness,
    normalizeTransparency,
    getUi: () => state?.ui || null,
    normalizeAlign,
    defaultWidgetContentAlign,
    normalizeTitleAlign,
    defaultWidgetTitleAlign,
    resolveWidgetPadding,
    normalizeContentPadding,
    normalizeWidgetContentFontScale,
    shortTextWidgetTypes: SHORT_TEXT_WIDGET_TYPES,
    shortTextMinContentFontScale: SHORT_TEXT_MIN_CONTENT_FONT_SCALE,
    normalizeWidgetThemeMode,
    normalizeWidgetColor,
    resolveTransparentWidgetText,
    sampledWallpaperBaseLuminance,
    resolveTransparentGhostOpacity
  });
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
  return backgroundLocalMediaRuntime.hideVideo();
}

function resetBackgroundMediaFrame(target) {
  return backgroundLocalMediaRuntime.resetBackgroundMediaFrame(target);
}

function applyBackgroundLocalFit(target, fitMode) {
  return backgroundLocalMediaRuntime.applyBackgroundLocalFit(target, fitMode);
}

function applyBackgroundMediaFitStyles(cfg) {
  return backgroundLocalMediaRuntime.applyBackgroundMediaFitStyles(cfg);
}

function readFileAsDataUrl(file) {
  return backgroundLocalMediaRuntime.readFileAsDataUrl(file);
}

async function importLocalBackgroundFile(file) {
  return backgroundLocalMediaRuntime.importLocalBackgroundFile(file);
}

const backgroundBlurRuntime = createBackgroundBlurRuntime({
  elements,
  documentObj: document,
  createImage: () => new Image(),
  clamp,
  getBlurAmount: () => state?.ui?.background?.blurAmount,
  incrementBlurComputeToken: () => {
    blurComputeToken += 1;
    return blurComputeToken;
  },
  getBlurComputeToken: () => blurComputeToken
});

function clearBlurLayer() {
  return backgroundBlurRuntime.clearBlurLayer();
}

function loadImageForBlur(url) {
  return backgroundBlurRuntime.loadImageForBlur(url);
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
  return requestWallpaperLuminanceSampleRuntime(url, {
    normalizeText,
    getSampledWallpaperSource: () => sampledWallpaperSource,
    incrementWallpaperSampleToken: () => {
      wallpaperSampleToken += 1;
      return wallpaperSampleToken;
    },
    getWallpaperSampleToken: () => wallpaperSampleToken,
    elements,
    sampleImageBaseLuminanceFromUrl,
    getState: () => state,
    setSampledWallpaperBaseLuminance: (value) => {
      sampledWallpaperBaseLuminance = value;
    },
    setSampledWallpaperSource: (value) => {
      sampledWallpaperSource = value;
    },
    refreshAllWidgetCardsVisual,
    refreshWidgetsByType,
    documentObj: document,
    srgbToLinear,
    clamp
  });
}

async function buildPrecomputedBlurData(url, amount) {
  return backgroundBlurRuntime.buildPrecomputedBlurData(url, amount);
}

async function updateBlurFromImage(url) {
  return backgroundBlurRuntime.updateBlurFromImage(url);
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

const backgroundLocalMediaRuntime = createBackgroundLocalMediaRuntime({
  elements,
  normalizeText,
  normalizeLocalMediaFit,
  normalizeLocalMediaType,
  inferLocalMediaTypeFromDataUrl,
  createFileReader: () => new FileReader(),
  patchBackground,
  onImportError: (error) => {
    console.warn("Local media import failed", error);
  },
  getCurrentVideoObjectUrl: () => currentVideoObjectUrl,
  setCurrentVideoObjectUrl: (value) => {
    currentVideoObjectUrl = value;
  },
  revokeObjectURL: (value) => {
    URL.revokeObjectURL(value);
  }
});

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

const backgroundVideoCacheRuntime = createBackgroundVideoCacheRuntime({
  getState: () => state,
  elements,
  normalizeText,
  normalizeVideoSource,
  pickRandom,
  fetch: (...args) => fetch(...args),
  videoCacheName: VIDEO_CACHE_NAME,
  videoCacheKeyPrefix: VIDEO_CACHE_KEY_PREFIX,
  videoCacheMaxEntries: VIDEO_CACHE_MAX_ENTRIES,
  clamp,
  hasCaches: () => typeof caches !== "undefined",
  openCache: (name) => caches.open(name),
  buildVideoCacheKey,
  videoConfigSignature,
  incrementVideoLoadToken: () => {
    videoLoadToken += 1;
    return videoLoadToken;
  },
  getVideoLoadToken: () => videoLoadToken,
  hideVideo,
  releaseVideoObjectUrl,
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => {
    URL.revokeObjectURL(url);
  },
  setCurrentVideoObjectUrl: (value) => {
    currentVideoObjectUrl = value;
  },
  queueSave,
  now: () => Date.now(),
  onLoadError: (error) => {
    console.warn("Loop video load failed", error);
  }
});

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

const backgroundWallpaperRuntime = createBackgroundWallpaperRuntime({
  getState: () => state,
  elements,
  normalizeText,
  clamp,
  now: () => Date.now(),
  fetch: (...args) => fetch(...args),
  pickRandom,
  createImage: () => new Image(),
  incrementWallpaperCounter: () => {
    wallpaperCounter += 1;
    return wallpaperCounter;
  },
  incrementWallpaperLoadToken: () => {
    wallpaperLoadToken += 1;
    return wallpaperLoadToken;
  },
  getWallpaperLoadToken: () => wallpaperLoadToken,
  setWallpaperSourceSignature: (value) => {
    wallpaperSourceSignature = value;
  },
  queueSave,
  clearBlurLayer,
  updateBlurFromImage,
  requestWallpaperLuminanceSample,
  clearWallpaperTimer,
  setWallpaperTimer: (value) => {
    wallpaperTimer = value;
  },
  setTimeout
});

function wallpaperSignature(cfg) {
  return backgroundWallpaperRuntime.wallpaperSignature(cfg);
}

function wallpaperRotateMs(cfg) {
  return backgroundWallpaperRuntime.wallpaperRotateMs(cfg);
}

function hasWallpaperCacheRecord(cfg, signature) {
  return backgroundWallpaperRuntime.hasWallpaperCacheRecord(cfg, signature);
}

function isWallpaperCacheFresh(cfg, signature) {
  return backgroundWallpaperRuntime.isWallpaperCacheFresh(cfg, signature);
}

function applyWallpaperSwap(url, token) {
  return backgroundWallpaperRuntime.applyWallpaperSwap(url, token);
}

async function preloadAndSwapWallpaper(url, token) {
  return backgroundWallpaperRuntime.preloadAndSwapWallpaper(url, token);
}

function buildSimpleWallpaperUrl(provider, themeTag) {
  return backgroundWallpaperRuntime.buildSimpleWallpaperUrl(provider, themeTag);
}

function parseRedditImage(post) {
  return backgroundWallpaperRuntime.parseRedditImage(post);
}

async function fetchRedditWallpaperUrl(cfg) {
  return backgroundWallpaperRuntime.fetchRedditWallpaperUrl(cfg);
}

async function resolveWallpaperUrl(cfg) {
  return backgroundWallpaperRuntime.resolveWallpaperUrl(cfg);
}

function parseRedditLoopVideoUrl(post) {
  return backgroundVideoCacheRuntime.parseRedditLoopVideoUrl(post);
}

async function fetchRedditLoopVideoUrl(cfg) {
  return backgroundVideoCacheRuntime.fetchRedditLoopVideoUrl(cfg);
}

function releaseVideoObjectUrl() {
  return backgroundLocalMediaRuntime.releaseVideoObjectUrl();
}

async function resolveVideoRemoteUrl(cfg) {
  return backgroundVideoCacheRuntime.resolveVideoRemoteUrl(cfg);
}

async function fetchLoopVideoResponse(url) {
  return backgroundVideoCacheRuntime.fetchLoopVideoResponse(url);
}

async function ensureCachedLoopVideoResponse(cfg, signature, { force = false } = {}) {
  return backgroundVideoCacheRuntime.ensureCachedLoopVideoResponse(cfg, signature, { force });
}

function isLoopVideoCacheRequest(request) {
  return backgroundVideoCacheRuntime.isLoopVideoCacheRequest(request);
}

async function pruneLoopVideoCache(cache, keepCount = VIDEO_CACHE_MAX_ENTRIES) {
  return backgroundVideoCacheRuntime.pruneLoopVideoCache(cache, keepCount);
}

async function loadVideoLoop({ force = false } = {}) {
  return backgroundVideoCacheRuntime.loadVideoLoop({ force });
}

function preloadImage(url) {
  return backgroundWallpaperRuntime.preloadImage(url);
}

async function refreshWallpaper({ signature = null, force = false } = {}) {
  return backgroundWallpaperRuntime.refreshWallpaper({ signature, force });
}

function scheduleWallpaperRefresh(signature) {
  return backgroundWallpaperRuntime.scheduleWallpaperRefresh(signature);
}

const backgroundRuntime = createBackgroundRuntime({
  getState: () => state,
  elements,
  clamp,
  normalizeText,
  normalizeHexColor,
  defaultBackground,
  normalizeLocalMediaType,
  inferLocalMediaTypeFromDataUrl,
  clearWallpaperTimer,
  hideVideo,
  applyBackgroundMediaFitStyles,
  setWallpaperSourceSignature: (value) => {
    wallpaperSourceSignature = value;
  },
  incrementWallpaperLoadToken: () => {
    wallpaperLoadToken += 1;
    return wallpaperLoadToken;
  },
  incrementVideoLoadToken: () => {
    videoLoadToken += 1;
    return videoLoadToken;
  },
  clearBlurLayer,
  loadVideoLoop,
  wallpaperSignature,
  refreshWallpaper,
  scheduleWallpaperRefresh
});

function syncBackgroundRefreshButton() {
  return backgroundRuntime.syncBackgroundRefreshButton();
}

function refreshBackgroundNow() {
  return backgroundRuntime.refreshBackgroundNow();
}

function applyBackground() {
  return backgroundRuntime.applyBackground();
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
    addWidget(elements.widgetTypeSelect?.value || defaultWidgetType);
    return;
  }

  if (modalState.open) {
    closeWidgetModal(false);
  }
  if (widgetTitleRenameState.open) {
    closeWidgetTitleRenameModal();
  }

  const firstType = defaultWidgetType;
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
    return false;
  }

  const instance = instanceById(widgetTitleRenameState.widgetId);
  if (!instance) {
    closeWidgetTitleRenameModal();
    return true;
  }

  const def = widgetRegistry[instance.type];
  const fallbackTitle = def?.title || "Widget";
  const nextTitle = normalizeText(elements.widgetTitleRenameInput?.value, fallbackTitle);
  if (instance.title === nextTitle) {
    closeWidgetTitleRenameModal();
    return true;
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
  return true;
}

function applyAddWidgetModal() {
  const type = elements.widgetTypeSelect?.value;
  const def = widgetRegistry[type];
  if (!def) {
    return false;
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
  return Boolean(added);
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

function isPlaceholderLauncherPage(page, pageCount = currentLauncherPageCount()) {
  return isPlaceholderLauncherPageCore(page, pageCount);
}

function isLauncherPlaceholderPolicyActive() {
  return state?.mode === "edit" || launcherPageUiState.dragPlaceholderPolicyActive;
}

function shouldRenderLauncherPlaceholderPage() {
  return shouldRenderLauncherPlaceholderPageCore({
    mode: state?.mode,
    dragPlaceholderPolicyActive: launcherPageUiState.dragPlaceholderPolicyActive,
    hasPendingPlaceholderDrop: Boolean(launcherPageUiState.pendingPlaceholderDrop)
  });
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
  return resolveLauncherViewportPage({
    activePage: currentLauncherActivePage(),
    pageCount: currentLauncherPageCount(),
    virtualPage: launcherPageUiState.virtualPage,
    allowPlaceholderPages: shouldRenderLauncherPlaceholderPage()
  });
}

function setLauncherVirtualPage(page, { animate = true } = {}) {
  const pageCount = currentLauncherPageCount();
  const next = clampLauncherVirtualPage(page, pageCount);
  if (next === null || !shouldRenderLauncherPlaceholderPage()) {
    launcherPageUiState.virtualPage = null;
    renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });
    return;
  }
  launcherPageUiState.virtualPage = next;
  renderBoardViewport({ animate, dragging: false, dragOffsetX: 0 });
}

const launcherPageRuntime = createLauncherPageRuntime({
  getState: () => state,
  launcherPageUiState,
  maxLauncherPages: MAX_LAUNCHER_PAGES,
  currentLauncherPageCount,
  syncLauncherPagingState,
  isBoardWidgetInstance,
  normalizeWidgetPage,
  normalizeActivePage,
  normalizeLauncherPageIndexList,
  resolvePageTowardHomeDirection,
  remapLauncherPageIndexList,
  remapPageForDeletion,
  shiftLauncherPageIndexListOnDelete,
  normalizePageCount,
  shiftLauncherPageIndexListOnInsert,
  isLauncherPlaceholderPolicyActive,
  isPlaceholderLauncherPage,
  instanceById,
  recordHistorySnapshot,
  isWidgetDocked,
  isWidgetInContainer,
  normalizeDockedWidgetOrders,
  normalizeContainerAssignments,
  projectWidgetBoardDropLayout,
  clearPendingPlaceholderDrop,
  renderBoardViewport,
  refreshBoardCardsAfterLauncherPageMutation,
  renderBoard,
  queueSave
});

function compactEmptyLauncherPagesForUseMode() {
  return launcherPageRuntime.compactEmptyLauncherPagesForUseMode();
}

function deleteLauncherPageAt(pageIndex) {
  return launcherPageRuntime.deleteLauncherPageAt(pageIndex);
}

function queuePlaceholderPageDrop(instanceId, payload = {}, placeholderPage = null) {
  return launcherPageRuntime.queuePlaceholderPageDrop(instanceId, payload, placeholderPage);
}

function materializePendingPlaceholderPage() {
  return launcherPageRuntime.materializePendingPlaceholderPage();
}

function materializeLauncherPlaceholderPage(placeholderPage) {
  return launcherPageRuntime.materializeLauncherPlaceholderPage(placeholderPage);
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
  const fallbackTitle = widgetRegistry?.[instance?.type]?.title || "Widget";
  return createWidgetDragPreviewCore(instance, {
    ...options,
    fallbackTitle
  });
}

function positionWidgetDragPreview(preview, clientX, clientY) {
  positionWidgetDragPreviewCore(preview, clientX, clientY);
}

function createDragPreviewSession(instance, options = {}) {
  const fallbackTitle = widgetRegistry?.[instance?.type]?.title || "Widget";
  return createDragPreviewSessionCore(instance, {
    ...options,
    fallbackTitle
  });
}

function cssPixelValue(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

const dropGuideRuntime = createDropGuideRuntime({
  elements,
  dragGuideUiState,
  containerDropUiState,
  state,
  widgetPageOffsetX,
  resolveDockDropSlotIndex,
  dockSlotRectRelativeToHost,
  normalizeContainerId,
  instanceById,
  normalizeText,
  resolveContainerSpan,
  resolveContainerInsertIndexFromPointer,
  clamp,
  resolveWidgetSpanInContainer,
  cssPixelValue,
  containerDropTargetAtPoint,
  isDockDropPoint,
  setContainerDropTargetActive,
  setDockDropTargetActive,
  isGridLayoutMode,
  windowObj: window
});

function clearWidgetDropGuideHost(host) {
  return dropGuideRuntime.clearWidgetDropGuideHost(host);
}

function clearWidgetDropGuide() {
  return dropGuideRuntime.clearWidgetDropGuide();
}

function applyWidgetDropGuide(host, options = {}) {
  return dropGuideRuntime.applyWidgetDropGuide(host, options);
}

function boardPageDropGuideRect(page) {
  return dropGuideRuntime.boardPageDropGuideRect(page);
}

function projectedBoardSlotRect(layout, page = 0) {
  return dropGuideRuntime.projectedBoardSlotRect(layout, page);
}

function dockDropGuideSlotRect(draggedInstance, clientX, clientY) {
  return dropGuideRuntime.dockDropGuideSlotRect(draggedInstance, clientX, clientY);
}

function containerDropGuideSlotRect(containerId, draggedInstance, host, pointer = {}) {
  return dropGuideRuntime.containerDropGuideSlotRect(containerId, draggedInstance, host, pointer);
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
  return dropGuideRuntime.updateWidgetDragGuideAtPointer(draggedInstance, clientX, clientY, {
    boardLayout,
    boardPage,
    showGuide
  });
}

function clearWidgetDragGuideState() {
  return dropGuideRuntime.clearWidgetDragGuideState();
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
  return containerDropRuntime.resolveContainerInsertIndexFromPointer(containerId, clientX, clientY, {
    excludeWidgetId,
    panelElement,
    cardSelector
  });
}

function tryContainerWidgetByDrop(instance, pointerEvent, { record = true } = {}) {
  return widgetDropSurfaceRuntime.tryContainerWidgetByDrop(instance, pointerEvent, { record });
}

function setDockDropTargetActive(active) {
  elements.persistentDock?.classList.toggle("is-drop-target", Boolean(active));
}

function tryDockWidgetByDrop(instance, pointerEvent, { record = true } = {}) {
  return widgetDropSurfaceRuntime.tryDockWidgetByDrop(instance, pointerEvent, { record });
}

function applyWidgetDropPlan(instance, plan, payload = {}, { record = true } = {}) {
  return applyWidgetDropPlanByKind(
    instance,
    plan,
    payload,
    { record },
    {
      clearPendingPlaceholderDrop,
      removeWidget,
      tryDockWidgetByDrop,
      renderBoard,
      queueSave,
      tryContainerWidgetByDrop,
      currentLauncherPageCount,
      queuePlaceholderPageDrop,
      normalizeWidgetPage,
      currentLauncherActivePage,
      isWidgetDocked,
      releaseWidgetFromDockByDrop,
      isWidgetInContainer,
      releaseWidgetFromContainerByDrop,
      recordHistorySnapshot,
      touchUserMutationClock,
      isGridLayoutMode,
      applyGridLayout,
      runtimeMap: runtime,
      applyLayout,
      renderBoardViewport,
      compactEmptyLauncherPagesForUseMode,
      renderSettings,
      setActivePage: (page) => {
        state.ui.home.activePage = page;
      }
    }
  );
}

const dockInteractionsRuntime = createDockInteractionsRuntime({
  elements,
  dockUiState,
  dockEmbeddedUiState,
  normalizeText,
  setDockActiveId,
  clamp,
  documentObj: document,
  normalizeDockVisibility
});

function dockButtonsInStrip() {
  return dockInteractionsRuntime.dockButtonsInStrip();
}

function applyDockActiveVisual(activeId = dockUiState.activeId) {
  return dockInteractionsRuntime.applyDockActiveVisual(activeId);
}

function syncDockOverflowState() {
  return dockInteractionsRuntime.syncDockOverflowState();
}

function moveDockFocusByOffset(offset) {
  return dockInteractionsRuntime.moveDockFocusByOffset(offset);
}

function moveDockFocusToEdge(edge) {
  return dockInteractionsRuntime.moveDockFocusToEdge(edge);
}

function onDockStripKeyDown(event) {
  return dockInteractionsRuntime.onDockStripKeyDown(event);
}

function onDockStripWheel(event) {
  return dockInteractionsRuntime.onDockStripWheel(event);
}

function syncDockContentPadding(config) {
  return dockInteractionsRuntime.syncDockContentPadding(config);
}

function destroyDockEmbeddedControllers() {
  return dockInteractionsRuntime.destroyDockEmbeddedControllers();
}

const dockWidgetsRuntime = createDockWidgetsRuntime({
  getState: () => state,
  elements,
  runtimeMap: runtime,
  launcherPageUiState,
  dockUiState,
  dockEmbeddedUiState,
  widgetRegistry,
  gridMetrics,
  patchWidgetConfig,
  setWidgetContainer,
  releaseWidgetFromContainerByDrop,
  reorderWidgetInContainerByIndex,
  resolveContainerInsertIndexFromPointer,
  tryContainerWidgetByDrop,
  tryDockWidgetByDrop,
  projectWidgetBoardDropLayout,
  updateCrossSurfaceDropIndicators,
  renderBoardViewport,
  setActiveLauncherPage,
  currentLauncherActivePage,
  currentLauncherPageCount,
  registerContainerDropTarget,
  unregisterContainerDropTarget,
  createDragPreviewSession,
  createWidgetDragPreview,
  positionWidgetDragPreview,
  updateWidgetDragGuideAtPointer,
  clearWidgetDragGuideState,
  renderBoard,
  queueSave,
  instanceById,
  setSelected,
  openWidgetModal,
  closeBoardContextMenu,
  createWidgetDropSilhouette,
  setDragDeleteZoneActive,
  setLauncherDragPlaceholderPolicy,
  updateDragDeleteZoneHover,
  createNoneDropPlan,
  resolveEdgeDirectionFromPointer: resolveEdgeDirectionFromPointerCore,
  getLauncherViewportRect,
  syncLauncherPagingState,
  isLauncherPlaceholderPolicyActive,
  isPlaceholderLauncherPage,
  setLauncherVirtualPage,
  createDeferredEdgeSwitchScheduler: createDeferredEdgeSwitchSchedulerCore,
  isDockDropPoint,
  evaluateAndRenderWidgetDragIndicators,
  evaluateFinalWidgetDrop,
  setDockDropTargetActive,
  setContainerDropTargetActive,
  setWidgetDropSilhouetteVisible,
  applyWidgetDropPlan,
  releaseWidgetFromDockByDrop,
  removeDragPointerListeners,
  setLastDragEndAt: (value) => {
    lastDragEndAt = value;
  },
  windowObj: window,
  destroyDockEmbeddedControllers,
  normalizeDockedWidgetOrders,
  buildDockConfig,
  isHorizontalDock,
  dockedInstances,
  normalizeDockActiveId,
  normalizeDockOrder,
  normalizeText,
  applyCardVisual,
  setDockActiveId,
  applyDockActiveVisual,
  syncDockOverflowState,
  documentObj: document,
  renderDockWidgetsView
});

function renderDockWidgets() {
  return dockWidgetsRuntime.renderDockWidgets();
}

function syncPersistentDock() {
  syncPersistentDockView({
    dock: elements.persistentDock,
    dockSettingsBtn: elements.dockSettingsBtn,
    dockWidgetStrip: elements.dockWidgetStrip,
    dockUiState,
    config: buildDockConfig(state?.ui?.home),
    isEditMode: () => state.mode === "edit",
    dockSettingsModalOpen,
    clearWidgetDragGuideState,
    destroyDockEmbeddedControllers,
    syncDockContentPadding,
    renderDockWidgets,
    requestAnimationFrameFn: requestAnimationFrame
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
  return applyGridLayoutRuntime(
    { commitFreeLayout, shouldSave },
    {
      getState: () => state,
      isGridLayoutMode,
      syncLauncherPagingState,
      captureFreeLayouts,
      isWidgetDocked,
      isWidgetInContainer,
      renderBoardViewport,
      gridMetrics,
      normalizeWidgetPage,
      widgetRegistry,
      widgetDefaultGridSize,
      normalizeGridLayout,
      clamp,
      runtimeMap: runtime,
      applyLayout,
      queueSave
    }
  );
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
  return patchBackgroundRuntime(patch, {
    getState: () => state,
    recordHistorySnapshot,
    normalizeWallpaperProvider,
    normalizeText,
    clamp,
    normalizeVideoSource,
    normalizeLocalMediaType,
    inferLocalMediaTypeFromDataUrl,
    normalizeHexColor,
    defaultBackground,
    normalizeLocalMediaFit,
    applyBackground,
    refreshAllWidgetCardsVisual,
    refreshWidgetsByType,
    renderSettings,
    queueSave
  });
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

const containerOrderRuntime = createContainerOrderRuntime({
  getState: () => state,
  clamp,
  normalizeContainerId,
  instanceById,
  recordHistorySnapshot,
  touchUserMutationClock,
  renderBoard,
  renderSettings,
  refreshWidgetsByType,
  queueSave
});

function moveInstanceToStateIndex(instanceId, destinationIndex) {
  return containerOrderRuntime.moveInstanceToStateIndex(instanceId, destinationIndex);
}

function appendWidgetToContainerOrder(instanceId, containerId) {
  return containerOrderRuntime.appendWidgetToContainerOrder(instanceId, containerId);
}

function reorderWidgetInContainerByIndex(
  widgetId,
  containerId,
  insertIndex,
  { record = true, rerender = true, save = true } = {}
) {
  return containerOrderRuntime.reorderWidgetInContainerByIndex(widgetId, containerId, insertIndex, {
    record,
    rerender,
    save
  });
}

function projectWidgetBoardDropLayout(instance, payload = {}, { pageFallback = null } = {}) {
  return projectWidgetBoardDropLayoutRuntime(instance, payload, { pageFallback }, {
    getLauncherViewportRect,
    elements,
    isHtmlElement: (value) => value instanceof HTMLElement,
    currentLauncherPageCount,
    currentLauncherActivePage,
    normalizeWidgetPage,
    isGridLayoutMode,
    gridMetrics,
    widgetRegistry,
    widgetDefaultGridSize,
    normalizeGridLayout,
    clamp,
    snap: SNAP
  });
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
  return containerDropRuntime.projectContainerSilhouetteLayoutFromPointer(
    containerId,
    clientX,
    clientY,
    draggedWidgetId
  );
}

function buildDragPayloadWithPreviewOffset(previewSession, payload = {}) {
  return buildDragPayloadWithPreviewOffsetCore(previewSession, payload);
}

const dragDropEvaluationDeps = {
  buildDragPayloadWithPreviewOffset,
  currentLauncherPageCount,
  isPlaceholderLauncherPage,
  projectWidgetBoardDropLayout,
  resolveWidgetDropPlan
};

function evaluateWidgetDropAtPointer(instance, options = {}) {
  return evaluateWidgetDropAtPointerCore(instance, options, dragDropEvaluationDeps);
}

function evaluateFinalWidgetDrop(instance, options = {}) {
  return evaluateFinalWidgetDropCore(instance, options, {
    evaluateWidgetDropAtPointer
  });
}

function buildDragGuideState(dropPlan) {
  return buildDragGuideStateCore(dropPlan);
}

function removeDragPointerListeners(moveHandler, upHandler) {
  window.removeEventListener("pointermove", moveHandler);
  window.removeEventListener("pointerup", upHandler);
  window.removeEventListener("pointercancel", upHandler);
}

function cleanupBoardDragSession({
  moveHandler,
  upHandler,
  resetPendingPageSwitch,
  hideAndRemoveDropSilhouette,
  card,
  previewSession
} = {}) {
  removeDragPointerListeners(moveHandler, upHandler);
  resetPendingPageSwitch?.();
  hideAndRemoveDropSilhouette?.();
  clearWidgetDragGuideState();
  setDragDeleteZoneActive(false);
  setLauncherDragPlaceholderPolicy(false);
  card?.classList?.remove("longpress-drag-armed");
  card?.classList?.remove("widget-drag-active");
  card?.classList?.remove("widget-drag-origin-hidden");
  previewSession?.dispose?.();
  lastDragEndAt = Date.now();
}

function evaluateAndRenderWidgetDragIndicators(
  instance,
  {
    previewSession = null,
    clientX,
    clientY,
    page,
    pageFallback = page,
    silhouette = null,
    suppressSurfaceTargets = false,
    allowDeleteZone = true
  } = {}
) {
  const dropEvaluation = evaluateWidgetDropAtPointer(instance, {
    previewSession,
    clientX,
    clientY,
    page,
    pageFallback,
    suppressSurfaceTargets,
    allowDeleteZone
  });
  const dropPlan = dropEvaluation.dropPlan || createNoneDropPlan();

  updateCrossSurfaceDropIndicators(instance, clientX, clientY, {
    silhouette,
    boardProjection: dropEvaluation.boardProjection,
    suppressSurfaceTargets,
    dropPlan
  });

  const guideState = buildDragGuideState(dropPlan);
  if (guideState.deleteHovering || !guideState.boardGuideProjection?.layout) {
    clearWidgetDragGuideState();
  } else {
    updateWidgetDragGuideAtPointer(instance, clientX, clientY, {
      boardLayout: guideState.boardGuideProjection.layout,
      boardPage: guideState.boardGuideProjection.page,
      showGuide: false
    });
  }

  return {
    ...dropEvaluation,
    dropPlan,
    ...guideState
  };
}

const dragDropOrchestrationDeps = {
  currentLauncherPageCount,
  currentLauncherActivePage,
  isPointOverDragDeleteZone,
  containerDropTargetAtPoint,
  resolveContainerInsertIndexFromPointer,
  projectContainerSilhouetteLayoutFromPointer,
  isDockDropPoint,
  isDockEligibleWidget,
  projectDockSilhouetteLayoutFromPointer,
  resolveDockDropSlotIndex,
  isPlaceholderLauncherPage,
  normalizeWidgetPage,
  projectWidgetBoardDropLayout,
  setContainerDropTargetActive,
  setDockDropTargetActive,
  setDragDeleteZoneHover,
  positionWidgetDropSilhouette,
  setWidgetDropSilhouetteVisible
};

function resolveWidgetDropPlan(
  instance,
  payload = {},
  {
    boardProjection = null,
    suppressSurfaceTargets = false,
    allowDeleteZone = true
  } = {}
) {
  return resolveWidgetDropPlanCore(
    instance,
    payload,
    {
      boardProjection,
      suppressSurfaceTargets,
      allowDeleteZone
    },
    dragDropOrchestrationDeps
  );
}

function applyDropPlanIndicators(plan, { silhouette = null } = {}) {
  return applyDropPlanIndicatorsCore(plan, { silhouette }, dragDropOrchestrationDeps);
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
  return updateCrossSurfaceDropIndicatorsCore(
    instance,
    clientX,
    clientY,
    {
      silhouette,
      boardProjection,
      suppressSurfaceTargets,
      dropPlan
    },
    dragDropOrchestrationDeps
  );
}

const containerDropRuntime = createContainerDropRuntime({
  normalizeContainerId,
  normalizeText,
  isHtmlElement: (value) => value instanceof HTMLElement,
  getContainerDropTargetEntry: (containerId) => containerDropUiState.targets.get(containerId),
  getInstances: () => state.instances,
  viewportRectToBoardLayout,
  containerDropGuideSlotRect
});

const widgetDropSurfaceRuntime = createWidgetDropSurfaceRuntime({
  containerDropTargetAtPoint,
  resolveContainerInsertIndexFromPointer,
  normalizeContainerId,
  reorderWidgetInContainerByIndex,
  isBoardWidgetInstance,
  normalizeWidgetPage,
  currentLauncherPageCount,
  currentLauncherActivePage,
  setWidgetContainer,
  compactEmptyLauncherPagesForUseMode,
  renderBoard,
  renderSettings,
  queueSave,
  isDockDropPoint,
  isDockEligibleWidget,
  isWidgetDocked,
  isWidgetInContainer,
  resolveDockDropSlotIndex,
  recordHistorySnapshot,
  touchUserMutationClock,
  moveWidgetToDockSlot,
  renderDockWidgets
});

const widgetStateRuntime = createWidgetStateRuntime({
  getState: () => state,
  elements,
  runtimeMap: runtime,
  modalState,
  instanceById,
  normalizeContainerId,
  canPlaceWidgetInContainer,
  recordHistorySnapshot,
  touchUserMutationClock,
  appendWidgetToContainerOrder,
  normalizeContainerAssignments,
  renderBoard,
  renderSettings,
  refreshWidgetsByType,
  queueSave,
  normalizeWidgetPage,
  currentLauncherPageCount,
  currentLauncherActivePage,
  isLauncherPlaceholderPolicyActive,
  isPlaceholderLauncherPage,
  queuePlaceholderPageDrop,
  clearPendingPlaceholderDrop,
  projectWidgetBoardDropLayout,
  isWidgetDocked,
  normalizeDockedWidgetOrders,
  applyLayout,
  containerUnitLayoutSize,
  updateBoardBounds,
  closeWidgetModal,
  compactEmptyLauncherPagesForUseMode,
  renderDockWidgets,
  isBoardWidgetInstance,
  isWidgetInContainer
});

function setWidgetContainer(instanceId, containerId, options = {}) {
  return widgetStateRuntime.setWidgetContainer(instanceId, containerId, options);
}

function releaseWidgetFromContainerByDrop(widgetId, payload = {}) {
  return widgetStateRuntime.releaseWidgetFromContainerByDrop(widgetId, payload);
}

function releaseWidgetFromDockByDrop(widgetId, payload = {}) {
  return widgetStateRuntime.releaseWidgetFromDockByDrop(widgetId, payload);
}

function patchWidgetLayout(instanceId, layoutPatch, options = {}) {
  return widgetStateRuntime.patchWidgetLayout(instanceId, layoutPatch, options);
}

function removeWidget(instanceId) {
  return widgetStateRuntime.removeWidget(instanceId);
}

const widgetCardRuntime = createWidgetCardRuntime({
  getState: () => state,
  widgetRegistry,
  elements,
  runtimeMap: runtime,
  buildWidgetControllerContext,
  gridMetrics,
  patchWidgetConfig,
  setWidgetContainer,
  releaseWidgetFromContainerByDrop,
  reorderWidgetInContainerByIndex,
  createWidgetDropSilhouette,
  resolveContainerInsertIndexFromPointer,
  tryContainerWidgetByDrop,
  tryDockWidgetByDrop,
  projectWidgetBoardDropLayout,
  updateCrossSurfaceDropIndicators,
  renderBoardViewport,
  setActiveLauncherPage,
  currentLauncherActivePage,
  currentLauncherPageCount,
  registerContainerDropTarget,
  unregisterContainerDropTarget,
  createDragPreviewSession,
  createWidgetDragPreview,
  positionWidgetDragPreview,
  updateWidgetDragGuideAtPointer,
  clearWidgetDragGuideState,
  renderBoard,
  queueSave,
  instanceById,
  setSelected,
  openWidgetModal,
  removeWidget,
  attachWidgetTypeActions,
  attachWidgetCardClickBehavior,
  startWidgetCardDragSession,
  closeBoardContextMenu,
  bringWidgetToFront,
  setWidgetDropSilhouetteVisible,
  setDragDeleteZoneActive,
  setLauncherDragPlaceholderPolicy,
  updateDragDeleteZoneHover,
  createNoneDropPlan,
  resolveEdgeDirectionFromPointer: resolveEdgeDirectionFromPointerCore,
  getLauncherViewportRect,
  syncLauncherPagingState,
  isLauncherPlaceholderPolicyActive,
  isPlaceholderLauncherPage,
  setLauncherVirtualPage,
  setLauncherVirtualPageState: (value) => {
    launcherPageUiState.virtualPage = value;
  },
  createDeferredEdgeSwitchScheduler: createDeferredEdgeSwitchSchedulerCore,
  evaluateAndRenderWidgetDragIndicators,
  evaluateFinalWidgetDrop,
  resolveDraftPlacementAtPointer,
  patchWidgetLayout,
  applyLayout,
  isGridLayoutMode,
  recordHistorySnapshot,
  widgetDefaultGridSize,
  normalizeGridLayout,
  clamp,
  resolveBoundedDragPositionFromDelta,
  cleanupBoardDragSession,
  applyWidgetDropPlan,
  clearPendingPlaceholderDrop,
  normalizeWidgetPage,
  applyGridLayout,
  compactEmptyLauncherPagesForUseMode,
  updateBoardBounds,
  renderSettings,
  resolveSnappedPosition,
  snap: SNAP,
  windowObj: window,
  createLongPressDragController: createLongPressDragControllerCore,
  widgetLongPressState,
  longPressDelayMs: LONG_PRESS_DRAG_DELAY_MS,
  shortcutDelayMs: SHORTCUT_LONG_PRESS_DRAG_DELAY_MS,
  baseMoveTolerance: LONG_PRESS_DRAG_MOVE_TOLERANCE,
  startWidgetPaddingDragSession,
  widgetPaddingFallback,
  resolveWidgetPadding,
  normalizeContentPadding,
  projectContentPaddingFromDrag,
  hasContentPaddingChanged,
  modalState,
  setLastDragEndAt: (value) => {
    lastDragEndAt = value;
  },
  attachWidgetCardInteractionEvents,
  openWidgetTitleRenameModal,
  attachWidgetResizeHandle,
  startGridResizeSession,
  startFreeResizeSession,
  applyCardVisual,
  applyCardStack,
  getLastDragEndAt: () => lastDragEndAt
});

function createWidgetCard(instance) {
  return widgetCardRuntime.createWidgetCard(instance);
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

  renderLauncherPageAffordancesViewCore({
    board: elements.board,
    pageCount: currentLauncherPageCount(),
    activePage: currentLauncherViewportPage(),
    isEditMode: state.mode === "edit",
    shouldRenderPlaceholderPage: shouldRenderLauncherPlaceholderPage(),
    pendingPlaceholderDrop: launcherPageUiState.pendingPlaceholderDrop,
    onDeletePage: (page) => {
      deleteLauncherPageAt(page);
    },
    onMaterializePendingPlaceholder: () => {
      materializePendingPlaceholderPage();
    },
    onMaterializePlaceholder: (page) => {
      materializeLauncherPlaceholderPage(page);
    }
  });
}

function createInputBySchema(schema, value) {
  return createInputBySchemaCore(schema, value);
}

function readFieldValue(field, schema) {
  return readFieldValueBySchemaCore(field, schema);
}

function appendDivider() {
  const div = document.createElement("div");
  div.className = "settings-divider";
  elements.settingsContent.append(div);
}

function renderGlobalSettings() {
  renderGlobalSettingsView({
    settingsContent: elements.settingsContent,
    ui: state.ui,
    fontOptions: FONT_OPTIONS,
    gridMaxColumns: GRID_MAX_COLUMNS,
    gridMaxRows: GRID_MAX_ROWS,
    createFormRow,
    createColorControl,
    createInputBySchema,
    settingsEventName,
    readFieldValue,
    createSectionChip,
    normalizeWidgetCommonMaster,
    isThemeFieldKey,
    defaultWidgetCommonMaster,
    actions: {
      patchTheme,
      appendDivider,
      patchHomeLayout,
      patchShortcutsUi,
      patchMondayGlobalSettings,
      patchWidgetCommonMaster
    }
  });
}

function renderProfileSettings() {
  renderProfileSettingsView({
    settingsContent: elements.settingsContent,
    state,
    createFormRow,
    createSectionChip,
    actions: {
      savePreset,
      exportCurrentStateToFile,
      appendDivider,
      saveCurrentAsDefaultProfile,
      loadDefaultProfile,
      clearDefaultProfile,
      loadPresetById,
      deletePresetById
    },
    windowConfirm: (message) => window.confirm(message)
  });
}

function renderBackgroundSettings() {
  renderBackgroundSettingsView({
    settingsContent: elements.settingsContent,
    background: state.ui.background,
    createFormRow,
    createColorControl,
    createInputBySchema,
    settingsEventName,
    readFieldValue,
    patchBackground,
    importLocalBackgroundFile,
    normalizeText
  });
}

function getWidgetModalCommonFields(instance = null) {
  return buildWidgetModalCommonFields({
    pageCount: currentLauncherPageCount(),
    allowManualLayout: !isGridLayoutMode() && instance?.type !== "container"
  });
}

function getWidgetModalSpecificFields(def) {
  const specific = Array.isArray(def.settingsSchema) ? def.settingsSchema : [];
  return specific.map((field) => ({ ...field, group: "config" }));
}

function applyCommonMasterToDraft(draft, instanceType, master) {
  return applyCommonMasterToDraftCore(draft, instanceType, master, {
    normalizeSurfaceMode,
    normalizeTransparentGhostStrength,
    normalizeEdgeRoundness,
    normalizeTransparency,
    normalizeTitleAlign,
    defaultWidgetTitleAlign,
    normalizeAlign,
    defaultWidgetContentAlign,
    normalizeContentPadding,
    widgetPaddingFallback,
    normalizeWidgetContentFontScale,
    normalizeWidgetThemeMode,
    normalizeWidgetColor
  });
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
  const current = modalState.widgetId ? instanceById(modalState.widgetId) : null;
  return renderWidgetModalFieldsView({
    fields,
    currentType: current?.type || "",
    useCustomColors: Boolean(modalState?.draft?.useCustomColors),
    shouldRenderWidgetModalField,
    createFormRow,
    isThemeFieldKey,
    isShortcutIconEditorField,
    normalizeText,
    getCurrentShortcutIcon: () => modalState?.draft?.config?.icon,
    openShortcutIconEditor,
    setModalFieldValue,
    renderWidgetModal,
    createInputBySchema,
    modalFieldValue,
    settingsEventName,
    readFieldValue
  });
}

const widgetModalRuntime = createWidgetModalRuntime({
  modalState,
  widgetTitleRenameState,
  shortcutIconEditorState,
  elements,
  state,
  instanceById,
  widgetRegistry,
  closeWidgetTitleRenameModal,
  buildWidgetModalDraft: buildWidgetModalDraftCore,
  currentLauncherPageCount,
  resolveWidgetPadding,
  getWidgetModalCommonFields,
  getWidgetModalSpecificFields,
  normalizeWidgetPage,
  normalizeSurfaceMode,
  normalizeTransparentGhostStrength,
  normalizeEdgeRoundness,
  normalizeTransparency,
  normalizeTitleAlign,
  defaultWidgetTitleAlign,
  normalizeAlign,
  defaultWidgetContentAlign,
  normalizeContentPadding,
  normalizeWidgetContentFontScale,
  normalizeWidgetThemeMode,
  normalizeWidgetColor,
  renderWidgetModalFields,
  setWidgetModalActiveTab,
  resetWidgetTabDraftToDefaults,
  resetCommonTabDraftToGlobal,
  setModalInteractionLock,
  blurFocusedElementInOverlay,
  renderSettings,
  closeShortcutIconEditor,
  resolveAveragePaddingValue,
  widgetPaddingFallback,
  recordHistorySnapshot,
  applyWidgetDraftToInstance: applyWidgetDraftToInstanceCore,
  normalizeText,
  resolveDirectionalPaddingFromDraft,
  cloneLayout,
  normalizeContainerWidgetDraftConfig: normalizeContainerWidgetDraftConfigCore,
  normalizeContainerExpandedCols,
  normalizeContainerExpandedRows,
  enforceContainerWidgetSize,
  inferCommonOverrides,
  syncLauncherPagingState,
  syncWidgetStateAfterModalApply,
  refreshWidgetRuntimeAfterModalApply,
  runtimeMap: runtime,
  applyLayout,
  applyCardVisual,
  refreshWidgetsByType,
  isWidgetInContainer,
  isWidgetDocked,
  renderDockWidgets,
  updateBoardBounds,
  queueSave,
  documentObj: document
});

function modalFieldValue(field) {
  return widgetModalRuntime.modalFieldValue(field);
}

function setModalFieldValue(field, value) {
  return widgetModalRuntime.setModalFieldValue(field, value);
}

function closeWidgetModal(rerender = true, options = {}) {
  return widgetModalRuntime.closeWidgetModal(rerender, options);
}

function renderWidgetModal() {
  return widgetModalRuntime.renderWidgetModal();
}

function openWidgetModal(instanceId) {
  return widgetModalRuntime.openWidgetModal(instanceId);
}

function applyWidgetModal() {
  return widgetModalRuntime.applyWidgetModal();
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

function findFirstAvailableBoardGridSlot(page, colSpan, rowSpan) {
  return findFirstAvailableBoardGridSlotCore(page, colSpan, rowSpan, {
    isGridLayoutMode,
    syncLauncherPagingState,
    gridMetrics,
    clamp,
    normalizeWidgetPage,
    instances: state.instances,
    isWidgetDocked,
    isWidgetInContainer,
    widgetRegistry,
    widgetDefaultGridSize,
    normalizeGridLayout
  });
}

function addWidget(type, options = {}) {
  return addWidgetFlow(type, options, {
    state,
    widgetRegistry,
    syncLauncherPagingState,
    currentLauncherViewportPage,
    isPlaceholderLauncherPage,
    currentLauncherPageCount,
    materializeLauncherPlaceholderPage,
    currentLauncherActivePage,
    countBoardWidgetsOnPage,
    isWidgetDocked,
    isWidgetInContainer,
    normalizeWidgetPage,
    widgetDefaultGridSize,
    resolveRequestedWidgetSpans,
    normalizeGridSpanValue,
    gridMaxColumns: GRID_MAX_COLUMNS,
    gridMaxRowSpan: GRID_MAX_ROW_SPAN,
    isGridLayoutMode,
    findFirstAvailableBoardGridSlot,
    showAddWidgetToast,
    recordHistorySnapshot,
    widgetPaddingFallback,
    createWidgetInstanceDraft,
    getZCounter: () => zCounter,
    setZCounter: (value) => {
      zCounter = value;
    },
    normalizeText,
    isHeadlessDefaultType,
    isHeadlessTransparentDefaultType,
    defaultWidgetBackdropBlur,
    defaultWidgetTitleAlign,
    defaultWidgetContentAlign,
    normalizeCommonOverrides,
    normalizeGridLayout,
    cloneLayout,
    inferCommonOverrides,
    applyWidgetCommonMaster,
    applyFreeLayoutPlacement,
    getBoardRect: () => elements.board.getBoundingClientRect(),
    clamp,
    enforceContainerWidgetSize,
    createWidgetCard,
    applyGridLayout,
    setSelected,
    updateBoardBounds,
    queueSave
  });
}

async function resetState() {
  recordHistorySnapshot("Reset state");
  const preserved = captureResetPreservedData(state, {
    readUserMutationClock,
    clonePresetSnapshot
  });
  state = restoreResetPreservedData(await resolveStartupStateDefault(), preserved);

  if (preserved.defaultProfileSnapshot) {
    applyProfileSnapshot(preserved.defaultProfileSnapshot, "all");
    return;
  }

  applyTheme();
  applyBackground();
  renderBoard();
  queueSave();
}

function isInteractiveSwipeTarget(target) {
  return isInteractiveSwipeTargetCore(target);
}

function canStartBoardSwipeFromTarget(target) {
  return canStartBoardSwipeFromTargetCore(target);
}

function isTextEditableTarget(target) {
  return isTextEditableTargetCore(target);
}

function beginBoardSwipe(event) {
  beginBoardSwipeSession(event, {
    elements,
    state,
    widgetLongPressState,
    boardSwipeState,
    canStartBoardSwipeFromTarget,
    modalState,
    isAddWidgetModalOpen: () => addWidgetModalOpen,
    shortcutIconEditorState,
    isDockSettingsModalOpen: () => dockSettingsModalOpen
  });
}

function moveBoardSwipe(event) {
  moveBoardSwipeSession(event, {
    boardSwipeState,
    resolveBoardSwipeStartState,
    endBoardSwipe,
    renderBoardViewport
  });
}

function endBoardSwipe(event, { cancelled = false } = {}) {
  endBoardSwipeSession(
    event,
    { cancelled },
    {
      state,
      elements,
      boardSwipeState,
      syncLauncherPagingState,
      currentLauncherViewportPage,
      currentLauncherActivePage,
      resolveBoardSwipeThreshold,
      resolveBoardSwipeNextPage,
      isPlaceholderLauncherPage,
      setLauncherVirtualPage,
      setActiveLauncherPage,
      renderBoardViewport,
      setLastDragEndAt: (value) => {
        lastDragEndAt = value;
      }
    }
  );
}

function wireEvents() {
  return wireAppEvents({
    wireDockAndSwipeEvents,
    wireSettingsAndModeEvents,
    wireWidgetControlEvents,
    wireWindowLifecycleEvents,
    wireOverlayControlEvents,
    wireDocumentGuardEvents,
    wireKeydownEvents,
    elements,
    state,
    getRuntimeSettingsPanelOpen: () => runtimeSettingsPanelOpen,
    setRuntimeSettingsPanelOpen: (open) => {
      runtimeSettingsPanelOpen = Boolean(open);
    },
    syncSettingsPanelVisibility,
    refreshBackgroundNow,
    currentLauncherPageCount,
    currentLauncherViewportPage,
    isPlaceholderLauncherPage,
    setActiveLauncherPage,
    currentLauncherActivePage,
    compactEmptyLauncherPagesForUseMode,
    setBodyMode,
    setSelected,
    refreshAllWidgets,
    updateBoardBounds,
    requestAnimationFrameFn: requestAnimationFrame,
    setTimeoutFn: window.setTimeout.bind(window),
    boardPageTransitionMs: BOARD_PAGE_TRANSITION_MS,
    resolveHomeAnchorTargetPage,
    showAddWidgetToast,
    setLauncherHomePage,
    isDockSettingsModalOpen: () => dockSettingsModalOpen,
    closeDockSettingsModal,
    openDockSettingsModal,
    onDockStripKeyDown,
    onDockStripWheel,
    syncDockOverflowState,
    renderSettings,
    isAddWidgetModalOpen: () => addWidgetModalOpen,
    syncAddWidgetSizeInputs,
    openAddWidgetModal,
    closeBoardContextMenu,
    queueSave,
    closeAddWidgetModal,
    applyAddWidgetModal,
    windowConfirm: (message) => window.confirm(message),
    resetState,
    undoLastChange,
    redoLastChange,
    documentObj: document,
    windowObj: window,
    applyEditDockPosition,
    syncPersistentDock,
    flushPendingSave,
    modalState,
    getLastDragEndAt: () => lastDragEndAt,
    closeWidgetModal,
    closeWidgetTitleRenameModal,
    applyWidgetTitleRenameModal,
    applyDockSettingsModal,
    resetDockSettingsDraftToDefault,
    applyWidgetModal,
    closeShortcutIconEditor,
    applyShortcutIconEditor,
    resetShortcutIconEditorSource,
    shortcutEditorRefreshPreview,
    shortcutIconEditorState,
    normalizeText,
    loadImageIntoShortcutEditor,
    boardContextMenuState,
    isInsideBoardContextMenu,
    blockOutsideModalEvent,
    isTextEditableTarget,
    canOpenBoardContextMenuFromTarget,
    openBoardContextMenu,
    widgetTitleRenameState,
    isInsideWidgetTitleRenameOverlay,
    isInsideAddWidgetModalOverlay,
    isInsideDockSettingsModalOverlay,
    isInsideModalOverlay,
    isHtmlInputElement: (value) => value instanceof HTMLInputElement,
    isHtmlSelectElement: (value) => value instanceof HTMLSelectElement,
    isHtmlElement: (value) => value instanceof HTMLElement,
    dockDragState,
    beginBoardSwipe,
    moveBoardSwipe,
    endBoardSwipe
  });
}

// Startup/orchestrator smoke target for subtask 17: init() -> wireEvents() -> renderBoard().
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
