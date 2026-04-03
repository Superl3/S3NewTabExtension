import {
  buildHomeSettingFields,
  buildThemeSettingFields
} from "./global-settings-fields.js";
import { buildWidgetCommonMasterFields } from "./widget-modal-fields.js";

export function shouldSkipHomeField(schema, homeMode) {
  return homeMode === "free" && (schema.key === "gridColumns" || schema.key === "gridRows");
}

export function renderGlobalSettingsView({
  settingsContent,
  ui,
  fontOptions,
  gridMaxColumns,
  gridMaxRows,
  createFormRow,
  createColorControl,
  createInputBySchema,
  settingsEventName,
  readFieldValue,
  createSectionChip,
  normalizeWidgetCommonMaster,
  isThemeFieldKey,
  defaultWidgetCommonMaster,
  actions
} = {}) {
  if (!(settingsContent instanceof HTMLElement)) {
    return;
  }

  const {
    patchTheme,
    appendDivider,
    patchHomeLayout,
    patchShortcutsUi,
    patchMondayGlobalSettings,
    patchWidgetCommonMaster
  } = actions || {};

  const themeFields = buildThemeSettingFields({ fontOptions });
  for (const schema of themeFields) {
    const row = createFormRow(schema.label);
    row.classList.add("theme-row");
    const value = ui?.theme?.[schema.key];
    if (schema.type === "color") {
      row.append(
        createColorControl(value, (next) => {
          patchTheme?.({ [schema.key]: next });
        })
      );
    } else {
      const input = createInputBySchema(schema, value);
      input.addEventListener(settingsEventName(schema), () => {
        const next = readFieldValue(input, schema);
        patchTheme?.({ [schema.key]: next });
      });
      row.append(input);
    }
    settingsContent.append(row);
  }

  appendDivider?.();

  const home = ui?.home || {};
  const homeFields = buildHomeSettingFields({
    maxColumns: gridMaxColumns,
    maxRows: gridMaxRows
  });
  for (const schema of homeFields) {
    if (shouldSkipHomeField(schema, home.mode)) {
      continue;
    }
    const row = createFormRow(schema.label);
    const input = createInputBySchema(schema, home[schema.key]);
    input.addEventListener(settingsEventName(schema), () => {
      patchHomeLayout?.({ [schema.key]: readFieldValue(input, schema) });
    });
    row.append(input);
    settingsContent.append(row);
  }

  appendDivider?.();
  const shortcutRow = createFormRow("Global shortcut icon size (%)");
  const shortcutInput = createInputBySchema(
    {
      key: "iconSizePercent",
      type: "number",
      min: 40,
      max: 220,
      step: 5
    },
    ui?.shortcuts?.iconSizePercent ?? 100
  );
  shortcutInput.addEventListener("change", () => {
    patchShortcutsUi?.({ iconSizePercent: readFieldValue(shortcutInput, { type: "number" }) });
  });
  shortcutRow.append(shortcutInput);
  settingsContent.append(shortcutRow);

  const mondayTokenRow = createFormRow("Monday Access Token (Global)");
  const mondayTokenInput = createInputBySchema(
    {
      key: "accessToken",
      type: "password",
      placeholder: "Monday access token"
    },
    ui?.monday?.accessToken || ""
  );
  mondayTokenInput.addEventListener("change", () => {
    patchMondayGlobalSettings?.({ accessToken: readFieldValue(mondayTokenInput, { type: "text" }) });
  });
  mondayTokenRow.append(mondayTokenInput);
  settingsContent.append(mondayTokenRow);

  appendDivider?.();
  settingsContent.append(createSectionChip("Widget Common Master"));

  const master = normalizeWidgetCommonMaster(ui?.widgetCommonMaster);
  for (const schema of buildWidgetCommonMasterFields()) {
    const row = createFormRow(schema.label);
    if (isThemeFieldKey(schema.key)) {
      row.classList.add("theme-row");
    }
    const value = master[schema.key];
    if (schema.type === "color") {
      row.append(
        createColorControl(value, (next) => {
          patchWidgetCommonMaster?.({ [schema.key]: next });
        })
      );
    } else {
      const input = createInputBySchema(schema, value);
      input.addEventListener(settingsEventName(schema), () => {
        patchWidgetCommonMaster?.({ [schema.key]: readFieldValue(input, schema) });
      });
      row.append(input);
    }
    settingsContent.append(row);
  }

  const masterResetRow = document.createElement("div");
  masterResetRow.className = "preset-actions";
  const masterResetBtn = document.createElement("button");
  masterResetBtn.type = "button";
  masterResetBtn.className = "btn";
  masterResetBtn.textContent = "Reset Widget Common Master";
  masterResetBtn.addEventListener("click", () => {
    patchWidgetCommonMaster?.(defaultWidgetCommonMaster());
  });
  masterResetRow.append(masterResetBtn);
  settingsContent.append(masterResetRow);
}
