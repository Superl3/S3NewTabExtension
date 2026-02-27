# Workspace Execution Rules

These rules are mandatory for this repository across sessions.

## Required Git Flow

1. Never commit directly on `main` for feature or bugfix changes.
2. Use a feature branch per task (`feat/*`, `fix/*`, `chore/*`).
3. For each completed modification request:
   - Commit the related files.
   - Push the feature branch.
   - Merge the feature branch into `main` with `--no-ff`.
   - Push `main`.
4. Keep unrelated working tree changes out of commits.

## Default Assistant Behavior

1. Treat `commit + push` as the default completion behavior unless the user explicitly says not to.
2. If merge/push fails, report the reason and continue with the safest non-destructive recovery path.
3. For old direct-to-main commits, create backfill branches pointing to those commits when practical to improve visual traceability.

## Widget Header Design Principles

1. Header action buttons must always be visually anchored to the right edge of the widget header.
2. Visible buttons must be rendered in a contiguous sequence with no phantom gaps from hidden controls.
3. Normal mode and Edit mode transitions must not introduce perceived floating alignment or spacing drift in header controls.
4. Mode switches must preserve header/title layout metrics (font size, line height, vertical rhythm, and spacing) so titles never appear to jump due to button visibility changes.
