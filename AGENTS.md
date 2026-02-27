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
