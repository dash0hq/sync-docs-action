---
name: sync-docs-action
description: >-
  Wire up or debug a source repository's docs sync to the Dash0 website via the
  dash0hq/sync-docs-action composite action. Use when adding a sync-docs-to-website workflow,
  authoring or editing a transformations.yaml (files/common/nav/coverage), configuring the
  dry-run vs full-sync modes, or diagnosing a failing sync run (missing inputs, coverage
  failures, no-op PRs, PAT/token errors).
---

# Using dash0hq/sync-docs-action

This action transforms documentation files in a **source repository** (e.g. `dash0hq/otel-cicd-action`)
according to that repo's `transformations.yaml`, then opens or updates a pull request in a **target
documentation repository** (default target: `dash0hq/dash0-website`). The caller checks out its own repo,
then invokes this action; the transform + PR flow lives in the action so every source repo shares one
implementation.

## Two modes

- **Dry run** (`dry-run: "true"`): applies the transformations and the coverage check, then **stops** —
  the target repo is not checked out, nothing is copied, and no PR is created. Needs **none** of the
  target-side inputs and **no token**, so it is safe as a drift/coverage guard on PRs and non-release
  builds.
- **Full sync** (`dry-run: "false"`, the default): runs end to end and opens/updates a PR in the target
  repo. Requires the target-side inputs and a token (see below).

## Prerequisite in the caller workflow

Check out the caller's own repository first:

```yaml
- uses: actions/checkout@v6
```

## Inputs

| Input | Required | Default | Notes |
|-------|----------|---------|-------|
| `source-root` | no | `.` | Root of the source repo whose docs are transformed. |
| `transformations-file` | no | `.github/workflows/sync-docs/transformations.yaml` | Relative to `source-root`. |
| `dry-run` | no | `"false"` | `"true"` → transform + coverage only, then stop. |
| `target-repository` | **yes unless dry-run** | `""` | `owner/name` of the docs repo. Prefer a secret/variable over hardcoding. |
| `target-directory` | **yes unless dry-run** | `""` | Dir in the target repo the `target:` paths resolve under. |
| `target-github-token` | **yes unless dry-run** | `""` | Fine-grained PAT on the target repo with `contents:write` + `pull-requests:write`. |
| `target-base-branch` | no | `main` | Branch the PR opens against. |
| `pr-branch` | **yes unless dry-run** | `""` | Head branch for the sync PR. |
| `pr-title` | **yes unless dry-run** | `""` | |
| `pr-body` | **yes unless dry-run** | `""` | |
| `pr-reviewers` | no | `""` | Comma-separated handles; only applied when a NEW PR is opened. |
| `pr-assignees` | no | `""` | Comma-separated handles; only applied when a NEW PR is opened. |
| `commit-message` | no | `""` | Falls back to `pr-title` when empty. |

The action validates the "required unless dry-run" inputs at runtime and fails with
`::error::The following inputs are required unless dry-run is 'true': ...` if any are missing — because
composite-action `required: true` is not enforced and which inputs are mandatory depends on `dry-run`.

## Recommended caller workflow

One invocation serves both modes — `dry-run` decides. Pin the action to a full commit SHA.

```yaml
name: Synchronize docs to dash0.com/docs

on:
  workflow_dispatch:
    inputs:
      dry-run:
        description: Only verify transformations + coverage; do not open a PR.
        type: boolean
        default: true
  workflow_call:
    inputs:
      dry-run:
        type: boolean
        default: false
    secrets:
      DOCS_WEBSITE_PR_TOKEN:
        required: false

jobs:
  sync-docs:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: checkout source repo
        uses: actions/checkout@v6

      - name: sync docs to dash0.com/docs
        uses: dash0hq/sync-docs-action@<pinned-sha>
        with:
          dry-run: ${{ inputs.dry-run }}
          target-repository: dash0hq/dash0-website
          target-directory: <dir-in-target-repo>
          target-github-token: ${{ secrets.DOCS_WEBSITE_PR_TOKEN }}
          pr-branch: sync-<source-repo>-docs
          pr-title: 'docs: synchronize <source-repo> documentation'
          pr-body: |
            Synchronizes the <source-repo> documentation into dash0.com/docs.
```

Notes:
- `dry-run: ${{ inputs.dry-run }}` works because GitHub renders the boolean as the string `true`/`false`,
  which the action compares against `'true'`.
- Manual runs default to **dry-run true** (safe); full sync happens via `workflow_call` or by unchecking
  dry-run. This workflow has **no `push:`/`pull_request:` trigger** — syncs are deliberate.
- Target-side inputs are ignored during a dry run, so they can be supplied unconditionally.

## transformations.yaml

The `files:` list is the **sole opt-in allowlist**; anything not listed is ignored. Frontmatter
(`title`/`description` + a `lastUpdated` timestamp) is generated from each entry and prepended.

```yaml
common:            # transformations applied to EVERY file, before per-file ones
  - description: strip the leading top-level heading (the frontmatter title replaces it)
    type: replace-regex
    find: '^# [^\n]*\n'
    replace: ''

coverage:          # optional guard: every file matching include must be synced or ignored
  include:
    - docs/**/*.md
  ignore: []       # exact source-relative paths intentionally not synced

nav:               # optional: emit a nav.json describing the page hierarchy
  target: <dir>/nav.json
  id: <slug>
  title: <Section title>
  order: 72.6      # finite number
  parentPath: Tooling            # optional
  groupTitles:                   # optional: title for each nested subdirectory
    github-actions: GitHub Actions

files:             # the opt-in allowlist
  - source: docs/about.md
    target: <dir>/about.md
    title: About
    description: ...
    transformations:             # optional, per-file, applied after common
      - description: rewrite a relative link
        type: replace-regex
        find: '\]\(github-actions\.md\)'
        replace: '](github-actions/about)'
```

### Transformation types

- **`prepend`** — insert `content` at the start of the document.
- **`replace-regex`** — replace matches of `find` with `replace`. Optional `flags`: `multiline`
  (`^`/`$` match line boundaries), `dotall` (`.` matches newlines), `ignorecase`. By default a
  `replace-regex` must match at least once or the run fails; set `required: false` to allow zero matches.
- **`remove-line`** — remove the whole line containing the literal marker `line`.

The only supported placeholder in inserted/replacement text is `$timestamp` (one UTC value per run).

### Nav generation

`nav.json` is derived from the on-disk hierarchy of the `target` paths: files sharing the common
directory prefix become top-level leaves; files in a deeper subdirectory nest inside a
`{ title, children }` group whose title comes from `groupTitles[<subdir slug>]`.

## Debugging failing runs

- **`The following inputs are required unless dry-run is 'true': ...`** — you ran a full sync without a
  target-side input (commonly `target-directory`). Supply it, or run with `dry-run: true`.
- **Coverage failure** (`coverage check failed — the following files match coverage.include but have no
  'files:' entry`) — add a `files:` entry for the listed file, or list it under `coverage.ignore`.
- **`replace-regex` matched zero times** — the source text changed (drift). Fix the `find`, or set
  `required: false` if a no-op is acceptable.
- **"documentation is already up to date, nothing to do"** — not an error. The action diffs the target
  dir ignoring the `lastUpdated:` line; if nothing else changed it skips the PR. Change a doc to force one.
- **Existing PR "updated by the force-push"** — the action reuses `pr-branch` and force-pushes, so repeat
  runs **update the same PR** rather than opening new ones. `pr-reviewers`/`pr-assignees` apply only when a
  brand-new PR is opened.
- **Token/PAT errors at `checkout target repository` or `create pull request`** — the PAT must be scoped to
  the **target** repo with `contents:write` + `pull-requests:write`, and stored as a secret in the
  **source** repo (where the workflow runs). For an org-owned target, a fine-grained token may need org
  approval.

## Local verification (before pushing)

Run the transformation engine directly against your docs — the same invocation the action makes:

```bash
# Node 24 (.nvmrc) + pnpm 10
pnpm install --frozen-lockfile
node packages/transformation-engine/src/apply-transformations.ts \
  <source-root> \
  <source-root>/.github/workflows/sync-docs/transformations.yaml \
  /tmp/transformed-docs
```

Exit 0 with the expected files under `/tmp/transformed-docs` (including `nav.json` if `nav:` is set)
means the transforms and coverage check pass; the full sync then only adds the target checkout + PR.
