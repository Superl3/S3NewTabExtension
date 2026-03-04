function getTree() {
  return chrome.bookmarks.getTree();
}

function getSubTree(id) {
  return chrome.bookmarks.getSubTree(id);
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
  const tree = await getTree();
  const root = tree[0];
  const allTop = root?.children || [];

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

  const segments = normalizePath(config?.folderPath || "");
  if (segments.length) {
    const byPath = findFolderByPath(allTop, segments);
    if (byPath) {
      return byPath;
    }
  }

  return findDefaultFolder(allTop);
}
