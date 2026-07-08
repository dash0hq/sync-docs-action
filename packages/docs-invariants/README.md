# @dash0hq/docs-invariants

Invariants library for `dash0hq/dash0-website`'s documentation tree.

**Status:** scaffold. The initial commit provides package metadata + a placeholder export + a smoke test
so the workspace's CI has something to run. The real API lands in a follow-up PR.

## Planned surface

- `checkRedirectUniqueness(shards)` — verify no redirect key appears in more than one shard.
- `checkRedirectTargets(shards, validPages)` — every redirect value must resolve to a real page.
- `checkRedirectShadowing(shards, validPages)` — a redirect key must not also be a real page path (would
  hijack traffic).
- `checkDeletionsCovered(deletions, shards)` — every path being removed must have a redirect entry.

Two entry points are planned once the API lands:

- **CLI**: `docs-invariants check --redirects-dir … --content-dir … [--pending-deletions …]` — used by
  dash0-website's CI and by the sync action's PR-opening step.
- **Programmatic**: named exports for finer-grained use (e.g. a fs-watch during dev).

See the repo root `README.md` and `CLAUDE.md` for how this package fits alongside the composite action
and the transformation engine.
