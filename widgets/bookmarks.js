import { areBookmarksAvailable, resolveBookmarkRoot } from "../bookmarks.js";
import { normalizeText } from "../core/utils/text.js";

function asRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function normalizeSafeLink(value) {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:") {
      return parsed.href;
    }
  } catch {
  }

  return "";
}

function isUrlIcon(value) {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("chrome-extension://")
  );
}

function bookmarkFavicon(url) {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
}

function buildNodeLabel(node, cfg) {
  const labelMap = asRecord(cfg.labelMap);
  const custom = normalizeText(labelMap[node.id]);
  if (custom) {
    return custom;
  }
  return node.title || node.url || "Untitled";
}

function buildNodeUrl(node, cfg) {
  if (!node.url) {
    return "";
  }

  const fallbackUrl = normalizeSafeLink(node.url);
  const urlMap = asRecord(cfg.urlMap);
  const custom = normalizeText(urlMap[node.id]);
  const customUrl = normalizeSafeLink(custom);
  if (customUrl) {
    return customUrl;
  }
  return fallbackUrl;
}

function buildIconNode(node, cfg) {
  const icon = document.createElement("span");
  icon.className = "bookmark-icon";

  const iconMap = asRecord(cfg.iconMap);
  const custom = normalizeText(iconMap[node.id]);
  if (custom) {
    if (isUrlIcon(custom)) {
      const img = document.createElement("img");
      img.src = custom;
      img.alt = "";
      icon.append(img);
      return icon;
    }
    icon.textContent = custom;
    return icon;
  }

  if (node.url && cfg.faviconMode === "site") {
    const img = document.createElement("img");
    img.src = bookmarkFavicon(node.url);
    img.alt = "";
    icon.append(img);
    return icon;
  }

  icon.textContent = node.url ? "🔗" : "📁";
  return icon;
}

function createEditButton(onClick) {
  const button = document.createElement("button");
  button.className = "icon-btn bookmark-edit-btn";
  button.type = "button";
  button.title = "Customize label/icon";
  button.innerHTML = '<svg class="icon"><use href="#i-pencil"></use></svg>';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function setMapValue(map, key, value) {
  const next = { ...asRecord(map) };
  if (value) {
    next[key] = value;
  } else {
    delete next[key];
  }
  return next;
}

function findNodeById(node, targetId) {
  if (!node || !targetId) {
    return null;
  }
  if (node.id === targetId) {
    return node;
  }
  for (const child of node.children || []) {
    const found = findNodeById(child, targetId);
    if (found) {
      return found;
    }
  }
  return null;
}

function buildParentMap(node, map = {}) {
  for (const child of node.children || []) {
    map[child.id] = node.id;
    buildParentMap(child, map);
  }
  return map;
}

function flattenLinks(node, out = []) {
  for (const child of node.children || []) {
    if (child.url) {
      out.push(child);
      continue;
    }
    flattenLinks(child, out);
  }
  return out;
}

export const bookmarksWidget = {
  type: "bookmarks",
  title: "Bookmarks Collection",
  defaultConfig: {
    folderPath: "",
    folderId: "0",
    showFolders: true,
    showLabels: true,
    pathVisibility: "headless",
    openInNewTab: false,
    faviconMode: "site",
    fontScale: 1,
    labelMap: {},
    iconMap: {},
    urlMap: {},
    collapsedMap: {}
  },
  defaultLayout: {
    x: 840,
    y: 40,
    w: 360,
    h: 490
  },
  defaultGridSize: {
    w: 2,
    h: 2
  },
  settingsSchema: [
    {
      key: "folderId",
      label: "Folder",
      type: "bookmark-folder-select",
      helpText: "Choose folder directly from bookmarks tree."
    },
    {
      key: "folderPath",
      label: "Folder path (optional fallback)",
      type: "text",
      placeholder: "Bookmarks bar/Work"
    },
    {
      key: "faviconMode",
      label: "Favicon source",
      type: "select",
      options: [
        { value: "site", label: "Website favicon" },
        { value: "none", label: "No favicon" }
      ]
    },
    { key: "showFolders", label: "Show folders", type: "checkbox" },
    { key: "showLabels", label: "Show labels", type: "checkbox" },
    {
      key: "pathVisibility",
      label: "Current path visibility",
      type: "select",
      options: [
        { value: "headless", label: "Hide in headless" },
        { value: "always", label: "Always show" },
        { value: "hidden", label: "Always hide" }
      ]
    },
    { key: "openInNewTab", label: "Open links in new tab", type: "checkbox" },
    { key: "fontScale", label: "Grid font scale", type: "number", min: 0.75, max: 1.6, step: 0.05 }
  ],
  create({ container, getConfig, patchConfig, isEditMode, getWidget }) {
    const nav = document.createElement("div");
    const editor = document.createElement("div");
    const grid = document.createElement("div");

    nav.className = "bookmark-nav";
    editor.className = "bookmark-editor";
    grid.className = "bookmark-grid";

    container.append(nav, editor, grid);

    let renderToken = 0;
    let editingNode = null;
    let currentFolderId = "";
    let rootNode = null;
    let parentMap = {};
    let reloadTimer = null;
    const backStateListeners = new Set();
    let canGoBackState = false;

    function notifyBackState(nextState) {
      const normalized = Boolean(nextState);
      canGoBackState = normalized;
      for (const listener of backStateListeners) {
        try {
          listener(normalized);
        } catch {}
      }
    }

    function updateBackState(activeFolder, root) {
      notifyBackState(Boolean(activeFolder && root && activeFolder.id !== root.id));
    }

    function resolvePathVisibility(cfg) {
      const mode = normalizeText(cfg.pathVisibility).toLowerCase();
      if (mode === "always" || mode === "headless" || mode === "hidden") {
        return mode;
      }
      if (cfg.showCurrentPath === false) {
        return "hidden";
      }
      if (cfg.showCurrentPath === true) {
        return "always";
      }
      return "headless";
    }

    function shouldShowCurrentPath(cfg) {
      const visibility = resolvePathVisibility(cfg);
      if (visibility === "hidden") {
        return false;
      }
      if (visibility === "headless") {
        const widget = typeof getWidget === "function" ? getWidget() : null;
        return widget?.viewMode !== "headless";
      }
      return true;
    }

    function goBack() {
      if (!rootNode) {
        notifyBackState(false);
        return false;
      }

      const activeFolder = findNodeById(rootNode, currentFolderId) || rootNode;
      if (!activeFolder || activeFolder.id === rootNode.id) {
        notifyBackState(false);
        return false;
      }

      const parentId = parentMap[activeFolder.id] || rootNode.id;
      currentFolderId = parentId;
      void render();
      return true;
    }

    function renderEditor() {
      editor.replaceChildren();
      if (!isEditMode() || !editingNode) {
        editor.style.display = "none";
        return;
      }

      editor.style.display = "block";
      const cfg = getConfig();

      const title = document.createElement("p");
      title.className = "bookmark-editor-title";
      title.textContent = `Editing: ${editingNode.title || editingNode.url || editingNode.id}`;

      const labelRow = document.createElement("label");
      labelRow.className = "form-row";
      const labelText = document.createElement("span");
      labelText.textContent = "Display name";
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.placeholder = "Custom display name";
      labelInput.value = normalizeText(asRecord(cfg.labelMap)[editingNode.id]);
      labelRow.append(labelText, labelInput);

      const iconRow = document.createElement("label");
      iconRow.className = "form-row";
      const iconText = document.createElement("span");
      iconText.textContent = "Icon (emoji or image URL)";
      const iconInput = document.createElement("input");
      iconInput.type = "text";
      iconInput.placeholder = "⭐ or https://example.com/icon.png";
      iconInput.value = normalizeText(asRecord(cfg.iconMap)[editingNode.id]);
      iconRow.append(iconText, iconInput);

      const urlRow = document.createElement("label");
      urlRow.className = "form-row";
      const urlText = document.createElement("span");
      urlText.textContent = "Target URL override";
      const urlInput = document.createElement("input");
      urlInput.type = "url";
      urlInput.placeholder = "https://...";
      urlInput.value = normalizeText(asRecord(cfg.urlMap)[editingNode.id]);
      urlRow.append(urlText, urlInput);

      const actions = document.createElement("div");
      actions.className = "bookmark-editor-actions";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn-primary";
      saveBtn.textContent = "Save";

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "btn";
      clearBtn.textContent = "Clear";

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "btn";
      closeBtn.textContent = "Close";

      saveBtn.addEventListener("click", () => {
        const latestCfg = getConfig();
        const nextLabel = normalizeText(labelInput.value);
        const nextIcon = normalizeText(iconInput.value);
        const nextUrl = editingNode.url ? normalizeText(urlInput.value) : "";

        patchConfig({
          labelMap: setMapValue(latestCfg.labelMap, editingNode.id, nextLabel),
          iconMap: setMapValue(latestCfg.iconMap, editingNode.id, nextIcon),
          urlMap: editingNode.url
            ? setMapValue(latestCfg.urlMap, editingNode.id, nextUrl)
            : setMapValue(latestCfg.urlMap, editingNode.id, "")
        });
      });

      clearBtn.addEventListener("click", () => {
        const latestCfg = getConfig();
        patchConfig({
          labelMap: setMapValue(latestCfg.labelMap, editingNode.id, ""),
          iconMap: setMapValue(latestCfg.iconMap, editingNode.id, ""),
          urlMap: setMapValue(latestCfg.urlMap, editingNode.id, "")
        });
      });

      closeBtn.addEventListener("click", () => {
        editingNode = null;
        renderEditor();
      });

      actions.append(saveBtn, clearBtn, closeBtn);
      editor.append(title, labelRow, iconRow);
      if (editingNode.url) {
        editor.append(urlRow);
      }
      editor.append(actions);
    }

    function buildFolderChain(activeFolder, root) {
      const chain = [];
      let cursor = activeFolder;
      let guard = 0;

      while (cursor && guard < 1000) {
        chain.unshift(cursor);
        if (cursor.id === root.id) {
          break;
        }
        const parentId = parentMap[cursor.id];
        cursor = parentId ? findNodeById(root, parentId) : null;
        guard += 1;
      }

      if (!chain.length || chain[0].id !== root.id) {
        return [root];
      }

      return chain;
    }

    function renderNav(activeFolder, root, cfg) {
      nav.replaceChildren();
      if (!activeFolder || !root || !shouldShowCurrentPath(cfg)) {
        nav.style.display = "none";
        return;
      }

      nav.style.display = "flex";

      const path = document.createElement("div");
      path.className = "bookmark-nav-path";

      const chain = buildFolderChain(activeFolder, root);
      const relative = chain.slice(1);

      const rootBtn = document.createElement("button");
      rootBtn.type = "button";
      rootBtn.className = "bookmark-nav-link";
      rootBtn.textContent = ".";
      rootBtn.disabled = relative.length === 0;
      rootBtn.addEventListener("click", () => {
        currentFolderId = root.id;
        void render();
      });
      path.append(rootBtn);

      if (!relative.length) {
        const current = document.createElement("span");
        current.className = "bookmark-nav-current";
        current.textContent = " /";
        path.append(current);
      } else {
        for (let i = 0; i < relative.length; i += 1) {
          const node = relative[i];
          const sep = document.createElement("span");
          sep.className = "bookmark-nav-sep";
          sep.textContent = "/";
          path.append(sep);

          const isCurrent = i === relative.length - 1;
          if (isCurrent) {
            const current = document.createElement("span");
            current.className = "bookmark-nav-current";
            current.textContent = node.title || "Untitled";
            path.append(current);
            continue;
          }

          const jump = document.createElement("button");
          jump.type = "button";
          jump.className = "bookmark-nav-link";
          jump.textContent = node.title || "Untitled";
          jump.addEventListener("click", () => {
            currentFolderId = node.id;
            void render();
          });
          path.append(jump);
        }
      }

      nav.append(path);
    }

    function createFolderCard(node, cfg) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "bookmark-grid-card bookmark-folder-card";

      const icon = buildIconNode(node, cfg);
      card.append(icon);
      if (cfg.showLabels !== false) {
        const label = document.createElement("span");
        label.className = "bookmark-grid-label";
        label.textContent = buildNodeLabel(node, cfg);
        card.append(label);
      }
      card.addEventListener("click", (event) => {
        event.preventDefault();
        currentFolderId = node.id;
        void render();
      });

      return card;
    }

    function createBookmarkCard(node, cfg) {
      const card = document.createElement("a");
      card.className = "bookmark-grid-card bookmark-link-card";
      const href = buildNodeUrl(node, cfg);
      if (href) {
        card.href = href;
        if (cfg.openInNewTab) {
          card.target = "_blank";
          card.rel = "noreferrer";
        }
      } else {
        card.removeAttribute("href");
        card.setAttribute("aria-disabled", "true");
        card.tabIndex = -1;
        card.style.opacity = "0.6";
        card.style.cursor = "not-allowed";
        card.addEventListener("click", (event) => {
          event.preventDefault();
        });
      }

      const icon = buildIconNode(node, cfg);
      card.append(icon);
      if (cfg.showLabels !== false) {
        const label = document.createElement("span");
        label.className = "bookmark-grid-label";
        label.textContent = buildNodeLabel(node, cfg);
        card.append(label);
      }
      return card;
    }

    function buildVisibleItems(activeFolder, cfg) {
      if (!activeFolder) {
        return [];
      }

      if (cfg.showFolders) {
        return [...(activeFolder.children || [])];
      }

      return flattenLinks(activeFolder, []);
    }

    async function render() {
      const token = ++renderToken;
      const cfg = getConfig();
      const fontScale = Number.isFinite(Number(cfg.fontScale)) ? Number(cfg.fontScale) : 1;
      grid.style.setProperty("--bookmarks-font-scale", `${Math.min(1.6, Math.max(0.75, fontScale))}`);
      grid.replaceChildren();

      try {
        const root = await resolveBookmarkRoot(cfg);
        if (token !== renderToken) {
          return;
        }

        if (!root) {
          notifyBackState(false);
          nav.style.display = "none";
          rootNode = null;
          currentFolderId = "";
          parentMap = {};
          const item = document.createElement("p");
          item.className = "muted";
          item.textContent = areBookmarksAvailable()
            ? "Bookmark folder not found."
            : "Bookmarks are available after loading this as a browser extension.";
          grid.append(item);
          renderEditor();
          return;
        }

        rootNode = root;
        parentMap = buildParentMap(root, {});

        if (!currentFolderId || !findNodeById(root, currentFolderId)) {
          currentFolderId = root.id;
        }

        const activeFolder = findNodeById(root, currentFolderId) || root;
        updateBackState(activeFolder, root);
        renderNav(activeFolder, root, cfg);

        const items = buildVisibleItems(activeFolder, cfg);
        if (!items.length) {
          const empty = document.createElement("p");
          empty.className = "muted";
          empty.textContent = "No bookmarks in this folder.";
          grid.append(empty);
        }

        for (const node of items) {
          const cell = document.createElement("div");
          cell.className = "bookmark-grid-cell";
          const card = node.url ? createBookmarkCard(node, cfg) : createFolderCard(node, cfg);
          cell.append(card);

          if (isEditMode()) {
            cell.append(
              createEditButton(() => {
                editingNode = {
                  id: node.id,
                  title: node.title || "",
                  url: node.url || ""
                };
                renderEditor();
              })
            );
          }

          grid.append(cell);
        }
      } catch {
        if (token !== renderToken) {
          return;
        }
        notifyBackState(false);
        nav.style.display = "none";
        const item = document.createElement("p");
        item.className = "muted";
        item.textContent = "Failed to load bookmarks.";
        grid.append(item);
      }

      renderEditor();
    }

    const reload = () => {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        void render();
      }, 120);
    };

    const bookmarksApi = globalThis.chrome?.bookmarks || null;
    const bookmarkEvents = [
      bookmarksApi?.onCreated,
      bookmarksApi?.onChanged,
      bookmarksApi?.onRemoved,
      bookmarksApi?.onMoved,
      bookmarksApi?.onChildrenReordered
    ].filter((event) => typeof event?.addListener === "function");
    for (const event of bookmarkEvents) {
      event.addListener(reload);
    }

    void render();

    return {
      refresh: () => {
        void render();
      },
      goBack,
      canGoBack: () => canGoBackState,
      onBackStateChange(listener) {
        if (typeof listener !== "function") {
          return () => {};
        }
        backStateListeners.add(listener);
        listener(canGoBackState);
        return () => {
          backStateListeners.delete(listener);
        };
      },
      destroy() {
        backStateListeners.clear();
        if (reloadTimer) {
          clearTimeout(reloadTimer);
          reloadTimer = null;
        }
        for (const event of bookmarkEvents) {
          event.removeListener?.(reload);
        }
      }
    };
  }
};
