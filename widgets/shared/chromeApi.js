export function getChromeStorageLocal() {
  return globalThis.chrome?.storage?.local || null;
}

export function getChromeStorageChanges() {
  return globalThis.chrome?.storage?.onChanged || null;
}

function noop() {}

export function createChromeStorageChangeSubscription(onChange, options = {}) {
  const { getStorageChanges = getChromeStorageChanges } = options;
  const handleChange = typeof onChange === "function" ? onChange : noop;
  let listener = null;

  return {
    install() {
      const storageChanges = getStorageChanges();
      if (listener || !storageChanges?.addListener) {
        return;
      }

      listener = (changes, areaName) => {
        handleChange(changes, areaName);
      };
      storageChanges.addListener(listener);
    },
    remove() {
      const storageChanges = getStorageChanges();
      if (!listener || !storageChanges?.removeListener) {
        return;
      }

      storageChanges.removeListener(listener);
      listener = null;
    }
  };
}

export function getChromeIdentity() {
  return globalThis.chrome?.identity || null;
}
