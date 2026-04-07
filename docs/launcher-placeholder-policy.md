# Launcher Placeholder / Add Page Policy (v4)

## Page Domain Model

- Real pages: `1..N`
- Placeholder pages: `0` (HEAD), `N+1` (TAIL)

Conceptual chain:

`HEAD(0) <-> P1 <-> ... <-> PN <-> TAIL(N+1)`

Runtime internals may keep zero-based real pages (`0..N-1`) and placeholder sentinels (`-1`, `N`),
but all policy-level decisions should use the domain model above.

## Minimal DropPlan Hierarchy

Top level:

- `SPACE`
- `DELETE_ZONE`
- `NONE`

Nested under `SPACE`:

- `SPACE.CONTAINER`
  - `DOCK`
  - `FOLDER`
- `SPACE.BOARD`
  - `PAGE`
  - `PLACEHOLDER_PAGE`

## Resolution Priority

Drop intent is resolved in this fixed order:

1. `DELETE_ZONE`
2. `SPACE.CONTAINER`
3. `SPACE.BOARD`
4. `NONE`

## Silhouette/Commit Consistency

The same DropPlan resolver must drive both:

- silhouette rendering during pointer move
- final commit on pointer up

This guarantees that what users see is what gets committed.

## Placeholder Behavior

- Drop or click on `HEAD(0)`: create new first real page and shift old real pages right.
- Drop or click on `TAIL(N+1)`: create new last real page.
- For drop-on-placeholder, page materialization and widget placement are treated as one user-level action.

## Invariants

- `1 <= pageCount <= MAX_LAUNCHER_PAGES`
- active page always points to a real page
- widgets can only belong to real pages
- placeholder pages never own widgets
- drag transient state is always cleared on end/cancel/failure

## Page Transition Contract
- Click, wheel, keyboard, and drag-based placeholder materialization must share one page normalization contract.
- Active page must always resolve to a real page after commit/cancel.

## Deletion Contract
- `DELETE_ZONE` intent always has priority over container/board placement.
- Delete commit must execute exactly once per finalized delete intent.
- After delete commit, ordering/page bounds/focus target must be normalized before returning to idle.

## Container/Folder Contract
- `SPACE.CONTAINER` resolution must deterministically choose one of: enter target container/folder, reorder within container/folder, or exit to board/dock.
- Enter/reorder/exit outcomes must be mutually exclusive for a single pointerup.

## Cross-Surface Consistency
- Board, Dock, and Folder drag flows must use the same DropPlan precedence and resolver semantics.
- Any surface-specific optimization must preserve identical user-visible intent resolution.

## Failure/Cancellation Cleanup
- On cancel/failure/end, clear preview, silhouette, delete-hover state, placeholder policy, and pending page-switch state.
- Cleanup must occur before accepting new drag session input.
