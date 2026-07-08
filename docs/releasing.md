# Releasing

How to cut a release and what to include in the changelog.

## Two kinds of release, tracked separately

### 1. The composite action

**Consumed by** SHA in caller workflows: `uses: dash0hq/sync-docs-action@<sha>`.

**Versioning.** Semver tags on the repository — `v0.1.0`, `v1.0.0`, etc.
Callers who prefer named tags to raw SHAs can pin `@v1.0.0` and let Dependabot bump within a major.

**When to cut.** Tag whenever the composite action's caller-facing surface (`action.yml` inputs, PR flow, error messages relied on by callers) changes in a way we want to communicate.
Incidental refactors of internal packages don't require a tag.

**How to cut.**

1. `git tag -a v<X.Y.Z> -m "Release v<X.Y.Z>"` on `main`.
2. `git push origin v<X.Y.Z>`.
3. Create a GitHub Release from that tag with release notes copied from the CHANGELOG entry for this version.

Semver rules for `action.yml`:

- **Patch** — no input change; internal fix.
- **Minor** — new optional input, or an existing default relaxed in a backward-compatible way.
- **Major** — an input renamed or removed, a default changed in a way that could break existing callers, or the PR flow's observable behaviour changes.

### 2. `@dash0hq/docs-invariants`

**Consumed by** `dash0-website`'s own CI via npm.

**Versioning.** Semver on the `version` field in `packages/docs-invariants/package.json`.
Package tags are namespaced (`docs-invariants-v<X.Y.Z>`) so they don't collide with the composite action's tags on the same repo.

**When to publish.** Whenever the API surface stabilises to the point that downstream can rely on it, and whenever a bug fix or behaviour change wants to reach consumers.

**How to publish** (once the tag lands):

1. Bump `version` in `packages/docs-invariants/package.json` on `main` via a normal PR.
   The publish workflow refuses to publish if the tag version does not match the package.json version.
2. After merge, tag from `main`:
   ```bash
   git tag -a docs-invariants-v<X.Y.Z> -m "Release @dash0hq/docs-invariants v<X.Y.Z>"
   git push origin docs-invariants-v<X.Y.Z>
   ```
3. `.github/workflows/publish.yml` fires on the tag push.
   It reinstalls, verifies the version match, runs typecheck + tests, then `pnpm --filter @dash0hq/docs-invariants publish --access public --no-git-checks` with npm provenance enabled.
4. Update `dash0-website`'s dependency to the new version in a separate PR in that repo.

**Prerequisites** the publish workflow expects on this repository:

- **`DASH0_NPMJS_PUBLISH_TOKEN`** repository secret — an npm automation token with publish access on the `@dash0hq` scope.
  Rotate it whenever a maintainer with access to the token leaves the org.
- The npm `@dash0hq` scope must exist and grant the token publish permission.
- The workflow uses `id-token: write` to attach provenance attestations, so npm can verify the tarball was built from this exact commit.

**Pre-release tags** (e.g. `docs-invariants-v0.1.0-alpha.1`) are supported: the workflow's tag pattern matches both plain semver and pre-release suffixes.
Use pre-release tags to iterate before cutting a stable release.

## CHANGELOG

There is no `CHANGELOG.md` yet.
Add one alongside the first tagged release.
Follow the Keep a Changelog format (`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`).

Entries should describe **what changed and why**, not implementation details.
Callers reading the changelog want to know: "does this affect me?" and "what do I need to change if I bump?"
