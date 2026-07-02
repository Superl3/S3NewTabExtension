import { resolveChromeApi } from "./platform/chrome-api.js";
import { normalizeText } from "./utils/text.js";

export function createInputBySchema(schema = {}, value, { chromeApi = null } = {}) {
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
    const chrome = resolveChromeApi(chromeApi);
    const getTree = chrome?.bookmarks?.getTree;

    if (typeof getTree === "function") {
      getTree
        .call(chrome.bookmarks)
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
    } else {
      select.value = targetValue;
    }

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

export function readFieldValueBySchema(field, schema = {}) {
  if (schema.type === "checkbox") {
    return Boolean(field?.checked);
  }
  if (schema.type === "number") {
    const num = Number(field?.value);
    return Number.isFinite(num) ? num : 0;
  }
  return field?.value;
}
