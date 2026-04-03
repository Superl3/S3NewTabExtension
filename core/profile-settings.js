export function hasDefaultProfileSnapshot(snapshot) {
  return Boolean(
    snapshot &&
      Array.isArray(snapshot.instances) &&
      snapshot.instances.length
  );
}

export function buildDefaultProfileInfoText(snapshot, updatedAt, formatDate = (value) => new Date(value).toLocaleString()) {
  if (!hasDefaultProfileSnapshot(snapshot)) {
    return "No default profile yet.";
  }
  const stamp = Number(updatedAt) > 0 ? formatDate(Number(updatedAt)) : "saved";
  return `Current state is saved as default profile (${stamp}).`;
}

export function buildProfileLoadScopeOptions() {
  return [
    { value: "all", label: "Global + Background + Widgets" },
    { value: "global", label: "Global only" },
    { value: "background", label: "Background only" },
    { value: "widgets", label: "Widgets (includes layout)" }
  ];
}

export function formatPresetOptionLabel(preset = {}, formatDate = (value) => new Date(value).toLocaleString()) {
  const name = String(preset?.name || "").trim() || "Preset";
  const updatedAt = Number(preset?.updatedAt);
  const stamp = Number.isFinite(updatedAt) ? formatDate(updatedAt) : "Unknown";
  return `${name} (${stamp})`;
}
