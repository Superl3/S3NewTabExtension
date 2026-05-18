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

## Widget Body Layout Principles

1. Widgets with list/content plus status metadata should default to a full-height body layout: header/actions at the top, content in a stable scrollable middle region, and status/metadata in an independent footer pinned to the bottom of the widget content area.
2. Footer/status text must not be implemented as a divider-separated list item or as part of the scrollable content. It should remain visually separate by placement only, without a border divider unless explicitly requested.
3. Repeated content rows/cards must keep stable dimensions as the widget grows, shrinks, or changes item count. Extra vertical space should belong to the scroll/content region, not be distributed into row height.
4. Empty states may fill the content region, but populated item rows must not stretch via `1fr`/fit-content behavior that makes row height depend on item count.
5. When a widget needs a bottom-pinned footer, ensure the widget content host/slot actually fills the widget body; pinning a footer inside a shrink-wrapped content slot is not sufficient.


## Drag Overlay Layering Principles

1. During drag, the drag preview must always render above all dock and board UI layers.
2. Drop silhouette must always render directly below the drag preview and above dock/board content.
3. Drag preview and silhouette layering order must be preserved across board, dock, and folder drag flows.
4. Overlay priority target: `drag preview > drop silhouette > dock widgets/content`.

## Modal Close Contract (Non-Negotiable)

1. The contract applies to every modal in this repository (existing and future), including Add Widget, Widget Settings, Dock Settings, Widget Title Rename, Shortcut Icon Editor, and widget-specific settings flows (Clock, Bookmarks Collection, Flex Worktime, etc.).
2. Cancel/Close actions must always dismiss the modal.
3. Primary actions (OK/Add/Apply/Save) and Enter-submit equivalents must also dismiss the modal in the same interaction.
4. Primary-action dismissal must be fail-safe: even if apply logic throws, returns false, or partially fails, the modal must still close.
5. Overlay/Escape dismiss behavior must remain consistent with Cancel semantics unless an exception is explicitly requested and documented in both AGENTS.md and .planning/PROJECT.md before implementation.
6. Any modal behavior change must include regression tests for click and Enter paths, including apply-throws paths.

## Interaction and Navigation Invariants (Non-Negotiable)

1. This interaction contract applies uniformly across board, dock, folder/container, and launcher page surfaces in both Edit and Use modes.
2. Drop intent precedence is fixed globally: `DELETE_ZONE > SPACE.CONTAINER > SPACE.BOARD > NONE`.
3. The same resolver must drive both drag silhouette/hover feedback and final pointerup commit (`what-you-see-is-what-commits`).
4. Widget deletion must be deterministic across surfaces: one delete intent produces exactly one delete commit, with no ghost instance or partial removal.
5. After deletion, runtime state must be normalized atomically (valid active page bounds, normalized ordering, and valid selection/focus recovery target).
6. Page transitions (click, wheel, keyboard, drag placeholder materialization) must use one shared clamping/materialization rule set; active page must never point to placeholder/sentinel pages.
7. Container/folder drag-drop behavior must be deterministic: enter-container, reorder-in-container, and exit-to-board/dock paths must not overlap ambiguously.
8. Drag cancel/failure paths must clear all transient state (preview, silhouette, delete hover, placeholder policy, pending page switches) before returning control.
9. Any behavior change in these paths must include regression tests that cover board+dock+folder/container flows and both Edit/Use modes.
