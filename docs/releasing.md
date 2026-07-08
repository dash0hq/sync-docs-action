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
Not published in the initial scaffold; the process below applies once the package is unmasked (`"private": false`).

**Versioning.** Semver on the `version` field in `packages/docs-invariants/package.json`.

**When to publish.** Whenever the CLI or programmatic API surface stabilises to the point that downstream can rely on it, and whenever a bug fix or behaviour change wants to reach consumers.

**How to publish** (once the workflow lands):

1. Bump `version` in `packages/docs-invariants/package.json` on `main`.
2. Push a tag `docs-invariants-v<X.Y.Z>` (namespaced so it doesn't collide with the composite action's tags).
3. CI runs `pnpm publish --filter @dash0hq/docs-invariants` from the tagged commit, authenticated via the `DASH0_NPMJS_PUBLISH_TOKEN` repository secret.
4. Update `dash0-website`'s dependency to the new version (separate PR in that repo).

The `DASH0_NPMJS_PUBLISH_TOKEN` secret is an org-scoped npm automation token; it must be present on this repository before the first release workflow run.
Rotate it whenever a maintainer with access to the token leaves the org.

## CHANGELOG

There is no `CHANGELOG.md` yet.
Add one alongside the first tagged release.
Follow the Keep a Changelog format (`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`).

Entries should describe **what changed and why**, not implementation details.
Callers reading the changelog want to know: "does this affect me?" and "what do I need to change if I bump?"
