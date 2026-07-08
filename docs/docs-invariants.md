# @dash0hq/docs-invariants — status and planned scope

**Current state.** Scaffold — package metadata, one placeholder export, one smoke test that keeps CI happy.
The real API lands in a follow-up PR.

## What it will do

Enforce the invariants that both this action and `dash0-website`'s own CI need on the docs tree.
Each invariant is a pure function that takes the current state of the tree and returns violations; the CLI wraps them for use from workflows.

### 1. Redirect uniqueness across shards

**Problem.** `dash0-website`'s `redirects/` is an `/etc/*.d/`-style directory with one shard per owner.
If two shards claim the same key, spread-merge would silently pick the last-processed one, and the docs would serve inconsistent redirects depending on the aggregator's file-scan order.

**Check.** For every key `k` appearing in any shard, assert it appears in exactly one shard.
Report violations as `key → [shard-name-1, shard-name-2]`.

**Where enforced.** `dash0-website`'s `scripts/build-redirects.ts` already enforces this; the invariants library will re-implement it so consumers don't need to run the website's build script.

### 2. Redirect target validity

**Problem.** A shard could declare a redirect to a page that doesn't exist.
`DocumentationPagePath` catches this at TypeScript compile time in `dash0-website`, but a caller running the invariants check standalone might not have the full TS project set up.

**Check.** Given the set of valid page paths (derived from `docs/content/**/*.md*`), assert every redirect value is in that set.

**Where enforced.** Locally in this library; also caught by `dash0-website`'s `tsc`.

### 3. Shadowing detection

**Problem.** A redirect key that matches a real page path silently hijacks live traffic — visitors get redirected instead of seeing the page.

**Check.** For every redirect key `k`, assert no page at path `k` exists.

**Where enforced.** Only in this library; nothing currently catches it.

### 4. Deletion coverage

**Problem.** When a source-repo sync stops writing a page (rename, removal, or content moved to another source repo), the previously-published URL becomes dead unless a redirect covers it.

**Check.** Given a set of paths being deleted in the current sync, assert every path is covered by a redirect key.

**Where enforced.** The action calls this before opening the sync PR; a coverage gap fails the workflow with a diagnostic listing the paths that need redirects.

## Two entry points

- **CLI**: `docs-invariants check --redirects-dir … --content-dir … [--pending-deletions …]`.
  Used by `dash0-website`'s own PR checks and by this action's pre-PR verification step.
- **Programmatic**: named exports for tighter integrations (e.g. a filesystem watcher during dev).

## Non-goals

- **Not a linter for `redirects/*.ts` file style.** Formatting, comment placement, import ordering are out of scope; `tsc` and `prettier` cover those.
- **Not a general-purpose docs validator.** Content-side link checking, markdown lint, image-dimension enforcement all live in `dash0-website`'s own scripts and stay there.

## When the follow-up PR lands

Update this document with:

- The exact CLI flags and their defaults.
- The named export surface (function signatures + shapes of return types).
- A version-history note if we make a breaking API change.

Delete the "Current state: scaffold" paragraph at the top.
