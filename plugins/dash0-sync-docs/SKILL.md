---
name: dash0-sync-docs
description: >-
  Wire up or debug a source repository's docs sync to the Dash0 website via the
  dash0hq/sync-docs-action composite action. Use when adding a sync-docs-to-website workflow,
  authoring or editing a transformations.yaml (files/common/nav/coverage), configuring the
  dry-run vs full-sync modes, migrating a caller across action versions, or diagnosing a failing
  sync run (missing inputs, coverage failures, no-op PRs, PAT/token errors).
---

# Using dash0hq/sync-docs-action

`dash0hq/sync-docs-action` is a composite GitHub Action that transforms documentation in a **source
repository** (e.g. `dash0hq/otel-cicd-action`) according to that repo's `transformations.yaml`, then
opens or updates a pull request in a **target documentation repository** (Dash0's website repo). The
caller checks out its own repo, then invokes this action; the transform and PR flow live in the action
so every source repo shares one implementation.

This skill is a set of workflows. Identify the task, then follow the matching workflow top to bottom.

- **Wiring up a new sync** in a source repo → Workflow A.
- **Authoring or editing `transformations.yaml`** → Workflow B.
- **Verifying changes before pushing** → Workflow C.
- **Migrating a caller to a newer action version** → Workflow D.
- **Diagnosing a failing run** → Workflow E.

## Reference: worked examples in production

Three Dash0 repos consume this action. Read them before wiring or editing a caller — they are the
canonical, working shapes to copy from.

- **`dash0hq/dash0-operator`** — a **flat sync** (all pages land as siblings under one directory) with a
  `coverage:` guard, pinned past the breaking release so it passes the target inputs from secrets.
  - [`.github/workflows/sync-docs-to-website.yaml`](https://github.com/dash0hq/dash0-operator/blob/main/.github/workflows/sync-docs-to-website.yaml)
    — the caller workflow, one invocation for both modes.
  - [`.github/workflows/ci.yaml`](https://github.com/dash0hq/dash0-operator/blob/main/.github/workflows/ci.yaml)
    — how CI invokes it: the `sync_docs_to_website_dry_run` job runs `dry-run: true` on every non-tag
    build, and `sync_docs_to_website` runs the full sync only after a release tag publishes.
  - [`.github/workflows/sync-docs/transformations.yaml`](https://github.com/dash0hq/dash0-operator/blob/main/.github/workflows/sync-docs/transformations.yaml)
    — `common` + per-file `transformations`, a `coverage:` block, no `nav:`.
- **`dash0hq/dash0-cli`** — a **nested-nav sync** that groups pages sitting in a `github-actions/`
  subdirectory via `nav.groupTitles`. Still pinned to `v0.3.0`, so it is also a live example of a caller
  that has **not yet done the D1 migration** (its target coordinates still rely on the old defaults).
  - [`.github/workflows/sync-docs-to-website.yaml`](https://github.com/dash0hq/dash0-cli/blob/main/.github/workflows/sync-docs-to-website.yaml)
    — the caller workflow.
  - [`.github/workflows/sync-docs/transformations.yaml`](https://github.com/dash0hq/dash0-cli/blob/main/.github/workflows/sync-docs/transformations.yaml)
    — a `nav:` block with `groupTitles`, files nesting into `github-actions/`.
- **`dash0hq/dash0-sdk-web`** — a **flat `nav:` sync** (a `nav:` block, but every page lands directly
  under one directory, so no `groupTitles`), pinned past the breaking release with `pr-reviewers` set.
  Still on a feature branch, so link to the `add-sync-docs-to-website` branch, not `main`.
  **Re-point these two links to `main` once the `add-sync-docs-to-website` PR merges**; the branch links
  break when that branch is deleted.
  - [`.github/workflows/sync-docs-to-website.yaml`](https://github.com/dash0hq/dash0-sdk-web/blob/add-sync-docs-to-website/.github/workflows/sync-docs-to-website.yaml)
    — the caller workflow (default `source-root` and `transformations-file`).
  - [`.github/workflows/sync-docs/transformations.yaml`](https://github.com/dash0hq/dash0-sdk-web/blob/add-sync-docs-to-website/.github/workflows/sync-docs/transformations.yaml)
    — `README.md` → `overview.md`, `INSTALL.md` → `installation.md`, `docs/sdk/*.md` → sibling pages, all
    under `web-sdk/`, with a flat `nav:` block.

These repos deliberately differ in details you must not copy blindly. The operator and sdk-web name
their PAT secret `DASH0_DOCS_REPO_GITHUB_PAT`; the CLI uses `DOCS_WEBSITE_PR_TOKEN`. The operator keeps
its `transformations.yaml` at the repo-root `.github/` while syncing from `source-root:
helm-chart/dash0-operator`, so its `transformations-file` steps back up with `../../`; the CLI and
sdk-web use the default `source-root` and file path. Match the caller's own conventions, not another
repo's.

## Reference: the two modes

- **Dry run** (`dry-run: "true"`): applies the transformations and the coverage check, then **stops**.
  The target repo is not checked out, nothing is copied, and no PR is created. Needs **none** of the
  target-side inputs and **no token**, so it is safe as a drift/coverage guard on PRs and non-release
  builds.
- **Full sync** (`dry-run: "false"`, the default): runs end to end and opens or updates a PR in the
  target repo. Requires the target-side inputs and a token.

## Reference: inputs

| Input                  | Required               | Default                                            | Notes                                                                              |
| ---------------------- | ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `source-root`          | no                     | `.`                                                | Root of the source repo whose docs are transformed.                                |
| `transformations-file` | no                     | `.github/workflows/sync-docs/transformations.yaml` | Relative to `source-root`.                                                         |
| `dry-run`              | no                     | `"false"`                                          | `"true"` → transform + coverage only, then stop.                                   |
| `target-repository`    | **yes unless dry-run** | `""`                                               | `owner/name` of the docs repo. Supply from a secret or variable, do not hardcode.  |
| `target-directory`     | **yes unless dry-run** | `""`                                               | Dir in the target repo the `target:` paths resolve under. Supply from a secret.    |
| `target-github-token`  | **yes unless dry-run** | `""`                                               | Fine-grained PAT on the target repo with `contents:write` + `pull-requests:write`. |
| `target-base-branch`   | no                     | `main`                                             | Branch the PR opens against.                                                       |
| `pr-branch`            | **yes unless dry-run** | `""`                                               | Head branch for the sync PR.                                                       |
| `pr-title`             | **yes unless dry-run** | `""`                                               |                                                                                    |
| `pr-body`              | **yes unless dry-run** | `""`                                               |                                                                                    |
| `pr-reviewers`         | no                     | `""`                                               | Comma-separated handles; only applied when a NEW PR is opened.                     |
| `pr-assignees`         | no                     | `""`                                               | Comma-separated handles; only applied when a NEW PR is opened.                     |
| `commit-message`       | no                     | `""`                                               | Falls back to `pr-title` when empty.                                               |

The action validates the "required unless dry-run" inputs at runtime and fails with
`::error::The following inputs are required unless dry-run is 'true': ...` if any are missing, because
composite-action `required: true` is not enforced and which inputs are mandatory depends on `dry-run`.

## Workflow A — wire up a sync in a source repo

Follow these steps in order. Do not skip the dry-run verification (step 6) before wiring the full sync.

1. **Confirm the source docs and their intended target.** List the docs the repo wants published
   (`README.md`, `docs/**`) and, for each, the path it should occupy in the target repo relative to
   `target-directory`. If the target repo, directory, or token secret names are unknown, ask the user
   rather than guessing — these are caller-specific and must not be hardcoded.
2. **Author `transformations.yaml`** at `.github/workflows/sync-docs/transformations.yaml` (or another
   path you will pass via `transformations-file`). Use Workflow B.
3. **Resolve the action version to pin.** Prefer a full commit SHA; a `vX.Y.Z` tag is acceptable when
   the caller relies on Dependabot. Confirm the version is the current release so the caller gets the
   no-defaults, dry-run, and coverage behavior described here.
4. **Confirm the caller-side secrets exist** in the source repo: the target repository, the target
   directory, and the PAT. The recommended names are `SYNC_DOCUMENTATION_TARGET_REPOSITORY`,
   `SYNC_DOCUMENTATION_TARGET_DIRECTORY`, and a `contents:write` + `pull-requests:write` PAT. If they do
   not exist, tell the user which secrets to create and stop the full-sync wiring until they do.
5. **Add the workflow file** at `.github/workflows/sync-docs.yml` using the template below. One
   invocation serves both modes; `dry-run` decides. For a real end-to-end example including the CI
   wiring, copy from
   [dash0-operator's `sync-docs-to-website.yaml`](https://github.com/dash0hq/dash0-operator/blob/main/.github/workflows/sync-docs-to-website.yaml)
   and the `sync_docs_to_website*` jobs in its
   [`ci.yaml`](https://github.com/dash0hq/dash0-operator/blob/main/.github/workflows/ci.yaml).

   ```yaml
   name: Synchronize docs to the Dash0 website

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

   jobs:
     sync-docs:
       runs-on: ubuntu-latest
       timeout-minutes: 10
       steps:
         - name: checkout source repo
           uses: actions/checkout@v6

         - name: sync docs to the Dash0 website
           uses: dash0hq/sync-docs-action@<pinned-sha>
           with:
             dry-run: ${{ inputs.dry-run }}
             target-repository: ${{ secrets.SYNC_DOCUMENTATION_TARGET_REPOSITORY }}
             target-directory: ${{ secrets.SYNC_DOCUMENTATION_TARGET_DIRECTORY }}
             target-github-token: ${{ secrets.REPOSITORY_FULL_ACCESS_GITHUB_TOKEN }}
             pr-branch: sync-<source-repo>-docs
             pr-title: "docs: synchronize <source-repo> documentation"
             pr-body: |
               Synchronizes the <source-repo> documentation into the Dash0 website.
   ```

6. **Dry-run locally before pushing.** Run Workflow C. Do not commit the workflow until the engine exits
   0 and emits the expected files.
7. **Add a drift guard.** So transformation drift breaks CI early rather than on the next release sync,
   invoke the same workflow with `dry-run: true` on pull requests. The dry run needs no token or target
   inputs, so it is safe on forked-PR builds.
8. **Report to the user** which files were created, which secrets the workflow depends on, and how to
   trigger a real sync (manual `workflow_dispatch` with dry-run unchecked, or a `workflow_call` from a
   release workflow).

Facts that constrain this workflow:

- `dry-run: ${{ inputs.dry-run }}` works because GitHub renders the boolean as the string
  `true`/`false`, which the action compares against `'true'`.
- The template has **no `push:` trigger for real syncs** — syncs are deliberate. Only the dry-run guard
  runs automatically.
- Target-side inputs are ignored during a dry run, so they can be supplied unconditionally.

## Workflow B — author or edit transformations.yaml

The `files:` list is the **sole opt-in allowlist**; anything in the source repo not listed there is
ignored. Frontmatter (`title`/`description` + a `lastUpdated` timestamp) is generated from each entry and
prepended, so do not hand-write frontmatter in the source docs.

1. **Add one `files:` entry per page** to publish. Set `source` (relative to `source-root`), `target`
   (relative to `target-directory` — do **not** repeat the target-directory prefix, and never start with
   `/`), `title`, and `description`.
2. **Move rules shared by every file into `common:`**, in the order they should run. Per-file
   `transformations:` run after `common:`.
3. **Add a `coverage:` block** if a newly added docs page should fail CI instead of being silently
   skipped. Every file matching an `include` glob must appear as a `files[].source` or be listed under
   `ignore`.
4. **Add a `nav:` block** only if the target section needs a generated `nav.json`.
5. **Verify with Workflow C** after any edit.

For a flat sync with a `coverage:` guard, copy from
[dash0-operator's `transformations.yaml`](https://github.com/dash0hq/dash0-operator/blob/main/.github/workflows/sync-docs/transformations.yaml).
For a flat `nav:` block (one directory, no `groupTitles`), copy from
[dash0-sdk-web's `transformations.yaml`](https://github.com/dash0hq/dash0-sdk-web/blob/add-sync-docs-to-website/.github/workflows/sync-docs/transformations.yaml).
For nested nav groups with `groupTitles`, copy from
[dash0-cli's `transformations.yaml`](https://github.com/dash0hq/dash0-cli/blob/main/.github/workflows/sync-docs/transformations.yaml).

```yaml
common: # transformations applied to EVERY file, before per-file ones
  - description: strip the leading top-level heading (the frontmatter title replaces it)
    type: replace-regex
    find: '^# [^\n]*\n'
    replace: ""

coverage: # optional guard: every file matching include must be synced or ignored
  include:
    - docs/**/*.md
  ignore: [] # exact source-relative paths intentionally not synced

nav: # optional: emit a nav.json describing the page hierarchy
  target: <dir>/nav.json
  id: <slug>
  title: <Section title>
  order: 72.6 # finite number
  parentPath: Tooling # optional
  groupTitles: # optional: title for each nested subdirectory
    github-actions: GitHub Actions

files: # the opt-in allowlist — one entry per page to publish, anything not listed is ignored
  # 1. A page that needs per-file fixups the other pages do not. `transformations:` holds edits that
  #    apply to THIS file only, running after every `common:` transformation. Use it for content that
  #    exists in one source file: repo-only links, badges, intro lines that do not belong on the website.
  - source: README.md
    target: <dir>/overview.md
    title: Overview
    description: What this project is and how to get started.
    transformations:
      - description: strip the CI/license badges at the top of the README
        type: replace-regex
        find: '^\[!\[[^\n]*\n'
        replace: ""
        flags:
          - multiline
      - description: rewrite a repo-relative link that has no page on the website
        type: replace-regex
        find: '\]\(CONTRIBUTING\.md\)'
        replace: "](https://github.com/dash0hq/<repo>/blob/main/CONTRIBUTING.md)"
      - description: drop the "This repository contains ..." intro line
        type: remove-line
        line: "This repository contains the source for the widget."

  # 2. A page that needs no per-file edits. Omit `transformations:` entirely; only `common:` runs on it.
  - source: docs/installation.md
    target: <dir>/installation.md
    title: Installation
    description: Install and configure the project.

  # 3. Another edit-free page. Relative sibling links between synced pages are rewritten automatically
  #    (the .md suffix is dropped), so no per-file transformation is needed just to fix links.
  - source: docs/configuration.md
    target: <dir>/configuration.md
    title: Configuration
    description: Reference for every configuration option.
```

`transformations:` on a `files:` entry is **optional and per-file**. It is a list of `prepend` /
`replace-regex` / `remove-line` edits applied to that one source file, in order, **after** the shared
`common:` transformations. Reach for it when an edit is specific to a single page — a badge only the
README carries, a repo-relative link that has no website equivalent, a heading that duplicates the
generated frontmatter title. Edits every page needs belong in `common:` instead; links between synced
pages are already rewritten automatically, so do not add per-file transformations just for those.

Transformation types:

- **`prepend`** — insert `content` at the start of the document.
- **`replace-regex`** — replace matches of `find` with `replace`. Optional `flags`: `multiline`
  (`^`/`$` match line boundaries), `dotall` (`.` matches newlines), `ignorecase`. By default a
  `replace-regex` must match at least once or the run fails; set `required: false` to allow zero matches.
- **`remove-line`** — remove the whole line containing the literal marker `line`.

The only supported placeholder in inserted or replacement text is `$timestamp` (one UTC value per run).

Nav generation: `nav.json` is derived from the on-disk hierarchy of the `target` paths. Files sharing
the common directory prefix become top-level leaves; files in a deeper subdirectory nest inside a
`{ title, children }` group whose title comes from `groupTitles[<subdir slug>]`.

## Workflow C — verify before pushing

Run the transformation engine directly against the docs — the same invocation the action makes. This
requires a checkout of `sync-docs-action`; run it from that repo's root.

1. Install the engine's dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Run the transformer against the source repo (Node 24 from `.nvmrc`, pnpm 10):

   ```bash
   node packages/transformation-engine/src/apply-transformations.ts <source-root> <source-root>/.github/workflows/sync-docs/transformations.yaml /tmp/transformed-docs
   ```

3. **Check the result.** Exit 0 with the expected files under `/tmp/transformed-docs` (including
   `nav.json` when `nav:` is set) means the transforms and coverage check pass. A non-zero exit means
   a transformation or coverage rule failed; go to Workflow E. The full sync only adds the target
   checkout and PR on top of this.

## Workflow D — migrate a caller to a newer action version

Callers pin to a SHA or a `vX.Y.Z` tag. When bumping across a release boundary, apply the changes for
every version crossed, in order. Steps are cumulative: bumping from v0.1.0 to the current release means
doing all of D3, then D2, then D1.

1. **Find the caller's current pin** and map it to a version. Determine the lowest version boundary the
   bump crosses, then apply the steps below from oldest to newest.
2. **D3 — leaving v0.1.0 (to v0.2.0 behavior):**
   - The built-in docs-coverage check was removed. In v0.1.0 a docs page with no sync entry broke the
     workflow; afterward `files:` is the sole opt-in list and undeclared files are silently ignored. If
     the caller relied on that guard, add a `coverage:` block (see D1) once the bump is complete.
   - `nav:` is new and optional. Add it only if the caller wants a generated `nav.json`.
3. **D2 — leaving v0.2.0 (to v0.3.0 behavior):** No caller changes required. v0.3.0 adds nested nav
   groups derived from the `target` path hierarchy plus an optional `nav.groupTitles` map. A
   `transformations.yaml` whose files all land in one directory keeps emitting the same flat one-group
   `nav.json`. Adopt `groupTitles` only when nesting files in subdirectories below the common prefix.
4. **D1 — reaching the current release (from v0.3.0 or earlier) — BREAKING:** `target-repository` and
   `target-directory` **no longer have defaults**. Earlier versions defaulted them to Dash0's website
   repo and its internal docs path; the action is public, so those defaults leaked a private repo's name
   and layout. A full sync now fails fast with
   `::error::The following inputs are required unless dry-run is 'true': ...` if either is missing.
   - **Supply both inputs explicitly**, from a secret or variable, never hardcoded in a public workflow:
     ```yaml
     target-repository: ${{ secrets.SYNC_DOCUMENTATION_TARGET_REPOSITORY }}
     target-directory: ${{ secrets.SYNC_DOCUMENTATION_TARGET_DIRECTORY }}
     ```
   - If the caller relied on the old defaults, create those secrets with the previous values, then wire
     the inputs to them.
   - [dash0-cli](https://github.com/dash0hq/dash0-cli/blob/main/.github/workflows/sync-docs-to-website.yaml)
     is a caller still pinned to `v0.3.0` that has not done this migration yet;
     [dash0-operator](https://github.com/dash0hq/dash0-operator/blob/main/.github/workflows/sync-docs-to-website.yaml)
     is one that has, and shows the finished shape (target inputs supplied from secrets).
   - The rest of this release is optional and backward-compatible: `dry-run`, `coverage:`,
     `pr-reviewers`, `pr-assignees`. Adopt `dry-run: true` on non-release CI to catch drift early, and
     add a `coverage:` block to fail on newly added, unsynced docs pages.
5. **Update the pin** to the target SHA or tag and **run Workflow C** to confirm the transforms still
   apply.
6. **Report** the required caller-side changes (new secrets, edited inputs) so the user can make them
   before the next real sync.

## Workflow E — diagnose a failing run

Match the symptom, apply the fix, then re-verify with Workflow C.

- **`The following inputs are required unless dry-run is 'true': ...`** — a full sync ran without a
  target-side input (commonly `target-directory`). Supply it, or run with `dry-run: true`.
- **Coverage failure** (`coverage check failed — the following files match coverage.include but have no
'files:' entry`) — add a `files:` entry for the listed file, or list it under `coverage.ignore`.
- **`replace-regex` matched zero times** — the source text changed (drift). Fix the `find`, or set
  `required: false` if a no-op is acceptable.
- **"documentation is already up to date, nothing to do"** — not an error. The action diffs the target
  dir ignoring the `lastUpdated:` line; if nothing else changed it skips the PR. Change a doc to force
  one.
- **Existing PR "updated by the force-push"** — the action reuses `pr-branch` and force-pushes, so
  repeat runs **update the same PR** rather than opening new ones. `pr-reviewers`/`pr-assignees` apply
  only when a brand-new PR is opened.
- **Token or PAT errors at `checkout target repository` or `create pull request`** — the PAT must be
  scoped to the **target** repo with `contents:write` + `pull-requests:write`, and stored as a secret in
  the **source** repo (where the workflow runs). For an org-owned target, a fine-grained token may need
  org approval.
