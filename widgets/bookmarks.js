import { resolveBookmarkRoot } from "../bookmarks.js";

function asRecord(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function normalizeText(value) {
  return String(value || "").trim();
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
  const urlMap = asRecord(cfg.urlMap);
  const custom = normalizeText(urlMap[node.id]);
  return custom || node.url;
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

function appendNode({ parent, node, cfg, isEditMode, onEdit, depth }) {
  if (node.url) {
    const li = document.createElement("li");
    const row = document.createElement("div");
    const link = document.createElement("a");

    row.className = "bookmark-row";
    link.className = "bookmark-link";
    link.href = buildNodeUrl(node, cfg);
    link.textContent = buildNodeLabel(node, cfg);
    if (cfg.openInNewTab) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }

    row.append(buildIconNode(node, cfg), link);

    if (isEditMode()) {
      row.append(
        createEditButton(() => {
          onEdit(node);
        })
      );
    }

    li.append(row);
    parent.append(li);
    return;
  }

  if (!cfg.showFolders && depth > 0) {
    for (const child of node.children || []) {
      appendNode({
        parent,
        node: child,
        cfg,
        isEditMode,
        onEdit,
        depth: depth + 1
      });
    }
    return;
  }

  const li = document.createElement("li");
  li.className = "bookmark-folder";

  const row = document.createElement("div");
  row.className = "bookmark-row";

  const folderName = document.createElement("span");
  folderName.className = "bookmark-folder-name";
  folderName.textContent = buildNodeLabel(node, cfg);
  row.append(buildIconNode(node, cfg), folderName);

  if (isEditMode()) {
    row.append(
      createEditButton(() => {
        onEdit(node);
      })
    );
  }

  li.append(row);

  const children = document.createElement("ul");
  for (const child of node.children || []) {
    appendNode({
      parent: children,
      node: child,
      cfg,
      isEditMode,
      onEdit,
      depth: depth + 1
    });
  }

  li.append(children);
  parent.append(li);
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

export const bookmarksWidget = {
  type: "bookmarks",
  title: "Bookmarks",
  defaultConfig: {
    folderPath: "",
    folderId: "",
    showFolders: true,
    openInNewTab: false,
    faviconMode: "site",
    labelMap: {},
    iconMap: {},
    urlMap: {}
  },
  defaultLayout: {
    x: 840,
    y: 40,
    w: 360,
    h: 490
  },
  settingsSchema: [
    {
      key: "folderPath",
      label: "Folder path",
      type: "text",
      placeholder: "Bookmarks bar/Work"
    },
    {
      key: "folderId",
      label: "Folder ID",
      type: "text",
      placeholder: "Leave empty to use path"
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
    { key: "openInNewTab", label: "Open links in new tab", type: "checkbox" }
  ],
  create({ container, getConfig, patchConfig, isEditMode }) {
    const chip = document.createElement("div");
    const refreshBtn = document.createElement("button");
    const editor = document.createElement("div");
    const list = document.createElement("ul");

    chip.className = "chip";
    refreshBtn.className = "btn";
    refreshBtn.type = "button";
    refreshBtn.innerHTML = '<svg class="icon"><use href="#i-reset"></use></svg><span class="btn-label">Refresh</span>';
    editor.className = "bookmark-editor";
    list.className = "bookmark-tree";

    container.append(chip, refreshBtn, editor, list);

    let renderToken = 0;
    let editingNode = null;

    function renderEditor() {
      editor.replaceChildren();
      if (!isEditMode()) {
        editor.style.display = "none";
        return;
      }

      editor.style.display = "block";
      const cfg = getConfig();

      if (!editingNode) {
        const title = document.createElement("p");
        title.className = "bookmark-editor-title";
        title.textContent = "Click the pencil icon on any bookmark/folder to customize its label, icon, and URL.";
        editor.append(title);
        return;
      }

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
        const nextLabel = normalizeText(labelInput.value);
        const nextIcon = normalizeText(iconInput.value);
        const nextUrl = editingNode.url ? normalizeText(urlInput.value) : "";

        patchConfig({
          labelMap: setMapValue(cfg.labelMap, editingNode.id, nextLabel),
          iconMap: setMapValue(cfg.iconMap, editingNode.id, nextIcon),
          urlMap: editingNode.url
            ? setMapValue(cfg.urlMap, editingNode.id, nextUrl)
            : setMapValue(cfg.urlMap, editingNode.id, "")
        });
      });

      clearBtn.addEventListener("click", () => {
        patchConfig({
          labelMap: setMapValue(cfg.labelMap, editingNode.id, ""),
          iconMap: setMapValue(cfg.iconMap, editingNode.id, ""),
          urlMap: setMapValue(cfg.urlMap, editingNode.id, "")
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

    async function render() {
      const token = ++renderToken;
      const cfg = getConfig();
      const locationLabel = cfg.folderPath || cfg.folderId || "Default bookmark root";
      const editLabel = isEditMode() ? " · per-item customize enabled" : "";
      chip.textContent = `${locationLabel}${editLabel}`;
      list.replaceChildren();

      try {
        const root = await resolveBookmarkRoot(cfg);
        if (token !== renderToken) {
          return;
        }
        if (!root) {
          const item = document.createElement("li");
          item.className = "muted";
          item.textContent = "Bookmark folder not found.";
          list.append(item);
          renderEditor();
          return;
        }

        appendNode({
          parent: list,
          node: root,
          cfg,
          isEditMode,
          onEdit: (node) => {
            editingNode = {
              id: node.id,
              title: node.title || "",
              url: node.url || ""
            };
            renderEditor();
          },
          depth: 0
        });
      } catch {
        if (token !== renderToken) {
          return;
        }
        const item = document.createElement("li");
        item.className = "muted";
        item.textContent = "Failed to load bookmarks.";
        list.append(item);
      }

      renderEditor();
    }

    refreshBtn.addEventListener("click", () => {
      void render();
    });

    const reload = () => {
      void render();
    };

    chrome.bookmarks.onCreated.addListener(reload);
    chrome.bookmarks.onChanged.addListener(reload);
    chrome.bookmarks.onRemoved.addListener(reload);
    chrome.bookmarks.onMoved.addListener(reload);
    chrome.bookmarks.onChildrenReordered.addListener(reload);

    void render();

    return {
      refresh: () => {
        void render();
      },
      destroy() {
        chrome.bookmarks.onCreated.removeListener(reload);
        chrome.bookmarks.onChanged.removeListener(reload);
        chrome.bookmarks.onRemoved.removeListener(reload);
        chrome.bookmarks.onMoved.removeListener(reload);
        chrome.bookmarks.onChildrenReordered.removeListener(reload);
      }
    };
  }
};
