import { toInteger, toPositiveInteger } from "./utils/number.js";

export function resolveLauncherPageLayerStyle(pageIndex, boardWidth, boardHeight) {
  const width = toPositiveInteger(boardWidth, 1);
  const height = toPositiveInteger(boardHeight, 1);
  const page = toInteger(pageIndex, 0);
  return {
    left: `${Math.round(page * width)}px`,
    top: "0px",
    width: `${width}px`,
    height: `${height}px`
  };
}

export function resolveLauncherPlaceholderPages(pageCount) {
  const count = toPositiveInteger(pageCount, 1);
  return [-1, count];
}

export function renderLauncherPageAffordancesView({
  board,
  pageCount = 1,
  activePage = 0,
  isEditMode = false,
  shouldRenderPlaceholderPage = false,
  pendingPlaceholderDrop = null,
  onDeletePage,
  onMaterializePendingPlaceholder,
  onMaterializePlaceholder
} = {}) {
  if (!(board instanceof HTMLElement)) {
    return;
  }

  const boardW = toPositiveInteger(board.clientWidth, 1);
  const boardH = toPositiveInteger(board.clientHeight, 1);

  let host = board.querySelector(".launcher-page-affordances");
  if (!(host instanceof HTMLElement)) {
    host = document.createElement("div");
    host.className = "launcher-page-affordances";
    board.append(host);
  }

  host.replaceChildren();

  if (!isEditMode && !shouldRenderPlaceholderPage) {
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
    const style = resolveLauncherPageLayerStyle(pageIndex, boardW, boardH);
    layer.style.left = style.left;
    layer.style.top = style.top;
    layer.style.width = style.width;
    layer.style.height = style.height;
    return layer;
  };

  const count = toPositiveInteger(pageCount, 1);
  for (let page = 0; page < count; page += 1) {
    const layer = createPageLayer(page);
    if (isEditMode && count > 1) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "launcher-page-remove-btn";
      removeBtn.textContent = "X";
      removeBtn.title = "Delete page";
      removeBtn.setAttribute("aria-label", "Delete page");
      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof onDeletePage === "function") {
          onDeletePage(page);
        }
      });
      layer.append(removeBtn);
    }
    host.append(layer);
  }

  if (!shouldRenderPlaceholderPage) {
    return;
  }

  const placeholderPages = resolveLauncherPlaceholderPages(count);
  for (const page of placeholderPages) {
    const layer = createPageLayer(page, { placeholder: true });
    const hasPendingWidget = Boolean(pendingPlaceholderDrop && pendingPlaceholderDrop.placeholderPage === page);
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
        if (typeof onMaterializePendingPlaceholder === "function") {
          onMaterializePendingPlaceholder();
        }
        return;
      }
      if (typeof onMaterializePlaceholder === "function") {
        onMaterializePlaceholder(page);
      }
    });
    layer.append(materializeBtn);
    host.append(layer);
  }
}
