export function isStateObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(base, patch) {
  if (!isStateObject(base) || !isStateObject(patch)) {
    return patch;
  }

  const output = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      output[key] = value.slice();
      continue;
    }

    if (isStateObject(value) && isStateObject(base[key])) {
      output[key] = deepMerge(base[key], value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function mergeStateObjects(base, patch) {
  const output = isStateObject(base) ? structuredClone(base) : {};
  if (!isStateObject(patch)) {
    return output;
  }

  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      output[key] = value.slice();
      continue;
    }

    if (isStateObject(value) && isStateObject(output[key])) {
      output[key] = mergeStateObjects(output[key], value);
      continue;
    }

    output[key] = value;
  }

  return output;
}
