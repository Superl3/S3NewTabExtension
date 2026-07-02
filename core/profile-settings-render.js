import { arrayOrEmpty } from "./utils/array.js";
import {
  buildDefaultProfileInfoText,
  buildProfileLoadScopeOptions,
  formatPresetOptionLabel,
  hasDefaultProfileSnapshot
} from "./profile-settings.js";

export function resolvePresetsArray(state) {
  return arrayOrEmpty(state?.presets);
}

export function renderProfileSettingsView({
  settingsContent,
  state,
  createFormRow,
  createSectionChip,
  actions,
  windowConfirm = (message) => globalThis.window?.confirm?.(message) ?? false
} = {}) {
  if (!(settingsContent instanceof HTMLElement)) {
    return;
  }

  const {
    savePreset,
    exportCurrentStateToFile,
    importProfileFromFile,
    appendDivider,
    saveCurrentAsDefaultProfile,
    loadDefaultProfile,
    clearDefaultProfile,
    loadPresetById,
    deletePresetById
  } = actions || {};

  const presetNameRow = createFormRow("Preset name");
  const presetNameInput = document.createElement("input");
  presetNameInput.type = "text";
  presetNameInput.placeholder = "My preset";
  presetNameRow.append(presetNameInput);
  settingsContent.append(presetNameRow);

  const actionRow = document.createElement("div");
  actionRow.className = "preset-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-primary";
  saveBtn.textContent = "Save current";
  saveBtn.addEventListener("click", () => {
    savePreset?.(presetNameInput.value);
  });

  actionRow.append(saveBtn);
  settingsContent.append(actionRow);

  const exportRow = document.createElement("div");
  exportRow.className = "preset-actions";
  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "btn";
  exportBtn.textContent = "Export current state";
  exportBtn.addEventListener("click", () => {
    exportCurrentStateToFile?.();
  });
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.style.display = "none";
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0] || null;
    importInput.value = "";
    if (!file) {
      return;
    }
    importProfileFromFile?.(file);
  });

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "btn";
  importBtn.textContent = "Import profile";
  importBtn.addEventListener("click", () => {
    importInput.click();
  });

  exportRow.append(exportBtn, importBtn, importInput);
  settingsContent.append(exportRow);

  appendDivider?.();
  settingsContent.append(createSectionChip("Default Profile"));

  const hasDefaultProfile = hasDefaultProfileSnapshot(state?.ui?.defaultProfileSnapshot);
  const defaultProfileInfo = document.createElement("p");
  defaultProfileInfo.className = "muted";
  defaultProfileInfo.textContent = buildDefaultProfileInfoText(
    state?.ui?.defaultProfileSnapshot,
    state?.ui?.defaultProfileUpdatedAt
  );
  settingsContent.append(defaultProfileInfo);

  const defaultProfileRow = document.createElement("div");
  defaultProfileRow.className = "preset-actions";

  const setDefaultBtn = document.createElement("button");
  setDefaultBtn.type = "button";
  setDefaultBtn.className = "btn";
  setDefaultBtn.textContent = "Use current as default";
  setDefaultBtn.addEventListener("click", () => {
    saveCurrentAsDefaultProfile?.();
  });

  const loadDefaultBtn = document.createElement("button");
  loadDefaultBtn.type = "button";
  loadDefaultBtn.className = "btn";
  loadDefaultBtn.textContent = "Load default";
  loadDefaultBtn.disabled = !hasDefaultProfile;
  loadDefaultBtn.addEventListener("click", () => {
    loadDefaultProfile?.("all");
  });

  const clearDefaultBtn = document.createElement("button");
  clearDefaultBtn.type = "button";
  clearDefaultBtn.className = "btn";
  clearDefaultBtn.textContent = "Clear default";
  clearDefaultBtn.disabled = !hasDefaultProfile;
  clearDefaultBtn.addEventListener("click", () => {
    const ok = windowConfirm("Clear saved default profile?");
    if (!ok) {
      return;
    }
    clearDefaultProfile?.();
  });

  defaultProfileRow.append(setDefaultBtn, loadDefaultBtn, clearDefaultBtn);
  settingsContent.append(defaultProfileRow);

  const presets = resolvePresetsArray(state);
  if (!presets.length) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "No saved presets yet.";
    settingsContent.append(hint);
    return;
  }

  const presetSelectRow = createFormRow("Saved presets");
  const presetSelect = document.createElement("select");
  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = formatPresetOptionLabel(preset);
    presetSelect.append(option);
  }
  presetSelectRow.append(presetSelect);
  settingsContent.append(presetSelectRow);

  const loadScopeRow = createFormRow("Load scope");
  const loadScopeSelect = document.createElement("select");
  const scopeOptions = buildProfileLoadScopeOptions();
  for (const opt of scopeOptions) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    loadScopeSelect.append(option);
  }
  loadScopeRow.append(loadScopeSelect);
  settingsContent.append(loadScopeRow);

  const manageRow = document.createElement("div");
  manageRow.className = "preset-actions";

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "btn";
  loadBtn.textContent = "Load";
  loadBtn.addEventListener("click", () => {
    loadPresetById?.(presetSelect.value, loadScopeSelect.value);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    const ok = windowConfirm("Delete selected preset?");
    if (!ok) {
      return;
    }
    deletePresetById?.(presetSelect.value);
  });

  manageRow.append(loadBtn, deleteBtn);
  settingsContent.append(manageRow);
}
