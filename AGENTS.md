# Workspace Execution Rules

These rules are mandatory for this repository across sessions.

## Required Git Flow

1. Never commit directly on `main` for feature or bugfix changes.
2. Use consolidated work branches:
   - Route all bugfix work to the shared `fix` branch (do not split into per-fix `fix/*` branches).
   - Group feature work into shared `feat/<area>` branches (for example: `feat/dock`, `feat/widget-ui`, `feat/weather`) instead of creating overly granular feature branches.
   - Reuse the closest matching existing `feat/<area>` branch when possible; create a new one only when no suitable area branch exists.
   - Keep `chore/*` branches task-specific when that remains the clearest option.
3. For each completed modification request:
   - Commit the related files.
   - Push the selected work branch.
   - Merge the selected work branch into `main` with `--no-ff`.
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
5. Header height must remain identical between Normal and Edit modes; button visibility must never cause title/header height expansion or collapse (notably in TODO/Notes and any future widgets).


## Drag Overlay Layering Principles

1. During drag, the drag preview must always render above all dock and board UI layers.
2. Drop silhouette must always render directly below the drag preview and above dock/board content.
3. Drag preview and silhouette layering order must be preserved across board, dock, and folder drag flows.
4. Overlay priority target: `drag preview > drop silhouette > dock widgets/content`.
