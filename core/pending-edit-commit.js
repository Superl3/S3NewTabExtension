const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "file", "button", "submit", "reset", "color", "range", "hidden"]);

export function isPendingEditableField(field) {
  if (!field || typeof field !== "object" || field.disabled || field.readOnly) {
    return false;
  }

  const tagName = String(field.tagName || "").toUpperCase();
  if (tagName === "TEXTAREA") {
    return true;
  }
  if (tagName === "SELECT") {
    return true;
  }
  if (tagName !== "INPUT") {
    return false;
  }

  const inputType = String(field.type || "text").toLowerCase();
  return !NON_TEXT_INPUT_TYPES.has(inputType);
}

function canReachField(root, field) {
  if (!root || root === field) {
    return true;
  }
  if (typeof root.contains === "function") {
    return root.contains(field);
  }
  return true;
}

export function commitPendingEditableState(root, { includeDescendants = false } = {}) {
  if (!root) {
    return 0;
  }

  const fields = [];
  const seen = new Set();
  const pushField = (field) => {
    if (!isPendingEditableField(field) || seen.has(field)) {
      return;
    }
    seen.add(field);
    fields.push(field);
  };

  const activeElement = root.activeElement || root.ownerDocument?.activeElement || null;
  if (canReachField(root, activeElement)) {
    pushField(activeElement);
  }

  if (includeDescendants && typeof root.querySelectorAll === "function") {
    for (const field of root.querySelectorAll("input, textarea, select")) {
      pushField(field);
    }
  }

  let committed = 0;
  for (const field of fields) {
    const EventCtor = field.ownerDocument?.defaultView?.Event || globalThis.Event;
    if (typeof field.dispatchEvent !== "function" || typeof EventCtor !== "function") {
      continue;
    }
    field.dispatchEvent(new EventCtor("change", { bubbles: true }));
    committed += 1;
  }

  return committed;
}
