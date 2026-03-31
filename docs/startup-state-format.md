# Startup State v2 Format

The startup baseline file (`config/startup-state.json`) now supports a composable schema.

## Shape

```json
{
  "version": 2,
  "defaults": { "ui": {} },
  "presets": {
    "preset-name": { "ui": {} }
  },
  "applyPresets": ["preset-name"],
  "overrides": { "ui": {} }
}
```

## Composition Order

1. `defaults`
2. each preset listed in `applyPresets` (in order)
3. `overrides`

The composed result is merged onto `defaultState()` at runtime.

## Notes

- Keep this file as a minimal baseline patch.
- Do not commit expanded runtime snapshots.
- Sensitive runtime fields (tokens/sessions/caches) are intentionally excluded from this baseline.
