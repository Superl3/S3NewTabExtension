import { buildBackgroundSettingFields } from "./background-settings-fields.js";
import {
  createLocalMediaClearPatch,
  hasLocalMediaData,
  resolveSelectedLocalMediaName
} from "./background-local-media.js";

export function resolveBackgroundSchemaSet(background) {
  return buildBackgroundSettingFields(background);
}

export function renderBackgroundSettingsView({
  settingsContent,
  background,
  createFormRow,
  createColorControl,
  createInputBySchema,
  settingsEventName,
  readFieldValue,
  patchBackground,
  importLocalBackgroundFile,
  normalizeText
} = {}) {
  if (!(settingsContent instanceof HTMLElement)) {
    return;
  }

  const bg = background || {};
  const { modeSchema, fields: bgFields } = resolveBackgroundSchemaSet(bg);

  const appendBackgroundField = (schema) => {
    const row = createFormRow(schema.label);
    const value = bg[schema.key];
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
    settingsContent.append(row);
  };

  if (bg.mode === "video") {
    appendBackgroundField(modeSchema);
  }

  if (bg.mode === "video") {
    const selectedFileName = resolveSelectedLocalMediaName(bg, normalizeText);
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
    settingsContent.append(localFileRow);

    const selectedFileRow = createFormRow("Selected file");
    const selectedFileInput = document.createElement("input");
    selectedFileInput.type = "text";
    selectedFileInput.readOnly = true;
    selectedFileInput.value = selectedFileName;
    selectedFileRow.append(selectedFileInput);
    settingsContent.append(selectedFileRow);

    const clearFileRow = createFormRow("Clear local file");
    const clearFileBtn = document.createElement("button");
    clearFileBtn.type = "button";
    clearFileBtn.className = "btn";
    clearFileBtn.textContent = "Clear";
    clearFileBtn.disabled = !hasLocalMediaData(bg, normalizeText);
    clearFileBtn.addEventListener("click", () => {
      patchBackground(createLocalMediaClearPatch());
    });
    clearFileRow.append(clearFileBtn);
    settingsContent.append(clearFileRow);
  }

  for (const schema of bgFields) {
    appendBackgroundField(schema);
  }
}
