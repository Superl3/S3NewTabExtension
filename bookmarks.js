const BOOKMARK_TREE_CACHE_TTL_MS = 1200;

let cachedBookmarkTree = null;
let cachedBookmarkTreeAt = 0;
let pendingBookmarkTreePromise = null;
let bookmarkCacheListenersAttached = false;

function invalidateBookmarkTreeCache() {
  cachedBookmarkTree = null;
  cachedBookmarkTreeAt = 0;
  pendingBookmarkTreePromise = null;
}

function ensureBookmarkCacheInvalidationListeners() {
  if (bookmarkCacheListenersAttached) {
    return;
  }

  const bookmarksApi = bookmarksPlatform();
  if (!bookmarksApi?.onCreated || !bookmarksApi?.onChanged || !bookmarksApi?.onRemoved) {
    return;
  }

  bookmarksApi.onCreated.addListener(invalidateBookmarkTreeCache);
  bookmarksApi.onChanged.addListener(invalidateBookmarkTreeCache);
  bookmarksApi.onRemoved.addListener(invalidateBookmarkTreeCache);
  bookmarksApi.onMoved?.addListener(invalidateBookmarkTreeCache);
  bookmarksApi.onChildrenReordered?.addListener(invalidateBookmarkTreeCache);
  bookmarkCacheListenersAttached = true;
}

function bookmarksPlatform() {
  return globalThis.chrome?.bookmarks || null;
}

export function areBookmarksAvailable() {
  return typeof bookmarksPlatform()?.getTree === "function";
}

function getTree({ force = false } = {}) {
  ensureBookmarkCacheInvalidationListeners();

  const bookmarksApi = bookmarksPlatform();
  if (typeof bookmarksApi?.getTree !== "function") {
    return Promise.resolve([]);
  }

  const now = Date.now();
  if (!force && cachedBookmarkTree && now - cachedBookmarkTreeAt < BOOKMARK_TREE_CACHE_TTL_MS) {
    return Promise.resolve(cachedBookmarkTree);
  }

  if (!force && pendingBookmarkTreePromise) {
    return pendingBookmarkTreePromise;
  }

  pendingBookmarkTreePromise = bookmarksApi
    .getTree()
    .then((tree) => {
      cachedBookmarkTree = tree;
      cachedBookmarkTreeAt = Date.now();
      pendingBookmarkTreePromise = null;
      return tree;
    })
    .catch((error) => {
      pendingBookmarkTreePromise = null;
      throw error;
    });

  return pendingBookmarkTreePromise;
}

function getSubTree(id) {
  const bookmarksApi = bookmarksPlatform();
  if (typeof bookmarksApi?.getSubTree !== "function") {
    return Promise.resolve([]);
  }
  return bookmarksApi.getSubTree(id);
}

function normalizePath(path) {
  return (path || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function folderMatchesTitle(node, title) {
  if (!node || node.url) {
    return false;
  }
  return (node.title || "").trim().toLowerCase() === title.trim().toLowerCase();
}

function findPathFrom(node, segments, index) {
  if (index >= segments.length) {
    return node;
  }
  const children = node.children || [];
  const segment = segments[index];
  for (const child of children) {
    if (folderMatchesTitle(child, segment)) {
      const found = findPathFrom(child, segments, index + 1);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findFolderByPath(rootNodes, pathSegments) {
  if (!pathSegments.length) {
    return null;
  }

  const startSegment = pathSegments[0];
  const queue = [...rootNodes];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const node = queue[queueIndex];
    queueIndex += 1;
    if (!node) {
      continue;
    }
    if (folderMatchesTitle(node, startSegment)) {
      const found = findPathFrom(node, pathSegments, 1);
      if (found) {
        return found;
      }
    }
    for (const child of node.children || []) {
      if (!child.url) {
        queue.push(child);
      }
    }
  }

  return null;
}

function findDefaultFolder(rootNodes) {
  for (const node of rootNodes) {
    if (node.id === "1") {
      return node;
    }
  }
  for (const node of rootNodes) {
    if (!node.url && (node.children || []).length) {
      return node;
    }
  }
  return rootNodes[0] || null;
}

export async function resolveBookmarkRoot(config) {
  const rawId = (config?.folderId || "").trim();
  if (rawId) {
    try {
      const subTree = await getSubTree(rawId);
      if (subTree?.[0] && !subTree[0].url) {
        return subTree[0];
      }
    } catch {
    }
  }

  const tree = await getTree();
  const root = tree[0];
  const allTop = root?.children || [];

  const segments = normalizePath(config?.folderPath || "");
  if (segments.length) {
    const byPath = findFolderByPath(allTop, segments);
    if (byPath) {
      return byPath;
    }
  }

  return findDefaultFolder(allTop);
}
