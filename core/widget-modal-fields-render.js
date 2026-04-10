export function shouldRerenderOnModalFieldChange(field = {}) {
  return field.key === "useCustomColors";
}

export function shouldSyncModalFieldOnInput(field = {}) {
  return !(
    field.type === "checkbox" ||
    field.type === "select" ||
    field.type === "bookmark-folder-select" ||
    field.type === "color"
  );
}

export function shouldSkipModalFieldValueSync(field = {}, input = null) {
  if (field?.type !== "number") {
    return false;
  }
  if (!input || typeof input !== "object") {
    return false;
  }

  const rawValue = typeof input.value === "string" ? input.value.trim() : String(input.value ?? "").trim();
  if (!rawValue) {
    return true;
  }
  if (input.validity?.badInput) {
    return true;
  }
  return !Number.isFinite(Number(rawValue));
}

export function renderWidgetModalFieldsView({
  fields = [],
  currentType = "",
  useCustomColors = false,
  shouldRenderWidgetModalField,
  createFormRow,
  isThemeFieldKey,
  isShortcutIconEditorField,
  normalizeText,
  getCurrentShortcutIcon,
  openShortcutIconEditor,
  setModalFieldValue,
  renderWidgetModal,
  createInputBySchema,
  modalFieldValue,
  settingsEventName,
  readFieldValue
} = {}) {
  const frag = document.createDocumentFragment();

  for (const field of fields) {
    if (!shouldRenderWidgetModalField(field, { currentType, useCustomColors })) {
      continue;
    }

    const row = createFormRow(field.label, field.helpText || "");
    if (isThemeFieldKey(field.key)) {
      row.classList.add("theme-row");
    }

    if (isShortcutIconEditorField(field)) {
      const actionWrap = document.createElement("div");
      actionWrap.className = "shortcut-icon-editor-inline-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn";
      editBtn.textContent = "Edit icon";
      editBtn.addEventListener("click", () => {
        const currentIcon = normalizeText(getCurrentShortcutIcon?.());
        openShortcutIconEditor(currentIcon, (nextDataUrl) => {
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
    const syncFieldValue = () => {
      if (shouldSkipModalFieldValueSync(field, input)) {
        return;
      }
      setModalFieldValue(field, readFieldValue(input, field));
      if (shouldRerenderOnModalFieldChange(field)) {
        renderWidgetModal();
      }
    };
    if (shouldSyncModalFieldOnInput(field)) {
      input.addEventListener("input", syncFieldValue);
    }
    input.addEventListener(settingsEventName(field), syncFieldValue);
    row.append(input);
    frag.append(row);
  }

  return frag;
}
