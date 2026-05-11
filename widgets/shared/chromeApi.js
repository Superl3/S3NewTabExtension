export function getChromeStorageLocal() {
  return globalThis.chrome?.storage?.local || null;
}

export function getChromeStorageChanges() {
  return globalThis.chrome?.storage?.onChanged || null;
}

export function getChromeIdentity() {
  return globalThis.chrome?.identity || null;
}
