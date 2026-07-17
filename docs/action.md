# Composite action

`action.yml` at the repo root is what callers reference:

```yaml
uses: dash0hq/sync-docs-action@<sha>
```

It's a **thin composite** — the substance lives in `packages/transformation-engine/` and (soon) `packages/docs-invariants/`.
The action's job is to install dependencies, run the engine, check out the target repo, copy transformed files in, and open or update a pull request.

## Caller-facing surface

The composite exposes the following inputs.
Their names and defaults are effectively public API for every source repository that consumes the action.
See `action.yml` itself for the current descriptions; the summary here is the contract:

| Input                  | Required         | Default                                            | Purpose                                                                                                                                                                  |
| ---------------------- | ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `source-root`          | no               | `.`                                                | Directory containing the source docs, relative to the caller workspace                                                                                                   |
| `transformations-file` | no               | `.github/workflows/sync-docs/transformations.yaml` | Path (relative to `source-root`) to the transformation declarations                                                                                                      |
| `dry-run`              | no               | `"false"`                                          | When `"true"`, stop after the transformation step (including the coverage check): no target checkout, no copy, no commit, no PR. See "Dry runs" below.                   |
| `target-repository`    | unless `dry-run` | —                                                  | The docs repo to push to. Supply from a caller-side secret or variable — see "Why the target inputs have no defaults" below.                                             |
| `target-directory`     | unless `dry-run` | —                                                  | Sub-tree inside the target repo where transformed files are written. `target:` values in `transformations.yaml` are resolved **relative to this directory** — see below. |
| `target-github-token`  | unless `dry-run` | —                                                  | Fine-grained PAT with `contents:write` + `pull-requests:write` on the target repo                                                                                        |
| `target-base-branch`   | no               | `main`                                             | Branch the PR is opened against                                                                                                                                          |
| `pr-branch`            | unless `dry-run` | —                                                  | Branch name used for the sync PR                                                                                                                                         |
| `pr-title`             | unless `dry-run` | —                                                  | PR title                                                                                                                                                                 |
| `pr-body`              | unless `dry-run` | —                                                  | PR body                                                                                                                                                                  |
| `pr-reviewers`         | no               | —                                                  | Comma-separated handles requested as reviewers on a newly opened PR (no effect on updates to an existing open PR)                                                        |
| `pr-assignees`         | no               | —                                                  | Comma-separated handles assigned to a newly opened PR (no effect on updates to an existing open PR)                                                                      |
| `commit-message`       | no               | value of `pr-title`                                | Commit message when the sync produces changes                                                                                                                            |

GitHub does not enforce `required:` metadata for composite actions at runtime.
A `validate inputs` step at the top of the action therefore fails fast, with a message naming every missing input, when a non-dry run is missing target coordinates or PR metadata.

## Dry runs

`dry-run: "true"` runs setup and the transformation engine (including the `coverage:` check when the caller's `transformations.yaml` declares one) and then stops.
Nothing is checked out, copied, committed, or opened.

This exists for early drift detection.
Callers run the action with `dry-run: "true"` on regular CI builds (pull requests, pushes to `main`) so that a `required` transformation that no longer matches, or a new docs page missing from `files:`, breaks the build at the moment the drift is introduced — not weeks later on the next release-triggered sync.
Because dry runs never touch the target repository, they need no token and work in contexts where secrets are unavailable.

## Why the target inputs have no defaults

`target-repository` and `target-directory` used to default to Dash0's website repository and its docs content path.
This repository is public, so those defaults published the name and internal layout of a private repository.
Both inputs are now caller-supplied with no default, and Dash0-owned callers pass them from repository secrets (see the secret-naming section below) so the values appear in neither this repo nor the callers' workflow files.

## `target-directory` and `target:` — how paths compose

The composite writes transformed files to `<target-repository>/<target-directory>/<target>` where `<target>` is the value from `transformations.yaml`.
`<target>` is therefore **relative to `target-directory`**, not to the target-repository root.

Example:

- `target-directory: docs/content` (in a real caller this value comes from a secret or variable)
- `transformations.yaml`:
  ```yaml
  files:
    - source: README.md
      target: manage-as-code/manage-cicd-observability-as-code.md
  ```

The file lands at
`docs/content/manage-as-code/manage-cicd-observability-as-code.md`
in the target repository — the two paths concatenated.

Common mistakes:

- **Repeating the `target-directory` prefix in `target:`.**
  If you set `target-directory: docs` and write `target: docs/foo.md`, the file lands at `docs/docs/foo.md`.
  Fix: drop the redundant `docs/` from `target:`.
- **Writing an absolute path in `target:`** (leading `/`).
  Not supported; the engine treats `target:` as a relative path and joins it with the output directory.

The scope invariant the composite enforces: after writing, `git add` is scoped to `<target-directory>` and nothing else in the target repository is staged.
This is how the "the sync only affects paths under `target-directory`" property is preserved even if a caller's `target:` value accidentally escapes the intended sub-tree.

## Recommended caller-side secret naming

The action's `target-github-token` input is generic; callers decide what to name the underlying secret in their own repository.
For Dash0-owned callers (`otel-cicd-action`, `dash0-operator`, `dash0-sdk-web`, ...), standardise on:

- **`REPOSITORY_FULL_ACCESS_GITHUB_TOKEN`** — fine-grained PAT with `contents:write` + `pull-requests:write` on the target docs repo.
- **`SYNC_DOCUMENTATION_TARGET_REPOSITORY`** — the `owner/name` passed to `target-repository`.
- **`SYNC_DOCUMENTATION_TARGET_DIRECTORY`** — the path passed to `target-directory`.

Callers reference them as:

```yaml
target-repository: ${{ secrets.SYNC_DOCUMENTATION_TARGET_REPOSITORY }}
target-directory: ${{ secrets.SYNC_DOCUMENTATION_TARGET_DIRECTORY }}
target-github-token: ${{ secrets.REPOSITORY_FULL_ACCESS_GITHUB_TOKEN }}
```

Using the same name across every caller makes it obvious to a reader which secret plugs into which input and keeps rotation procedures consistent.

## Adding or removing an input

- **Adding is safe.** New optional inputs with defaults are backward-compatible; existing callers continue to work.
  Document the input in `action.yml`'s inline description and update this table.
- **Renaming or removing is a breaking change.**
  Every source repo consuming the action pins to a SHA, so a rename doesn't immediately break them — but the next Dependabot bump does.
  Coordinate the change: land a PR here that adds the new input as an alias, cut a release, migrate every caller, then remove the old input in a follow-up.

## Step-by-step behaviour

1. **Validate inputs** — fail fast when a non-dry run is missing target coordinates or PR metadata (skipped when `dry-run` is `"true"`).
2. **Set up Node.js** from `.nvmrc`.
3. **Set up pnpm** from the repo root's `package.json` `packageManager` field.
4. **`pnpm install --frozen-lockfile`** in the action's own directory (`${{ github.action_path }}`).
5. **Run the transformer** with the caller's `source-root`, `transformations-file`, and a scratch `${RUNNER_TEMP}/transformed-docs` output directory. This includes the `coverage:` check when declared. **Dry runs stop here.**
6. **Check out the target repository** at `target-base-branch` into `.sync-docs-target-repository/` (uses the caller-supplied token).
7. **Copy the transformed files** into `<target-directory>` in the checked-out target repo.
8. **Create or update the sync PR:**
   - Configure `github-actions[bot]` as the git author.
   - Stage every change under `<target-directory>`.
   - If the only diff is `lastUpdated:` frontmatter changes (ignored via `git diff -I`), exit cleanly — nothing meaningful changed.
   - Otherwise, force-push the `pr-branch` and open a PR (or rely on the force-push to update an existing open PR). A newly opened PR gets `pr-reviewers` / `pr-assignees` applied when provided.

## Behavior guarantees the composite must preserve

- **No writes outside the target directory in the target repository.**
  The action stages only within `<target-directory>` and rejects PRs that would touch anything else.
- **No writes to the source repository.**
  The action never commits back to the caller's repo.
- **Idempotency on unchanged content.**
  Re-running the workflow when nothing meaningful changed produces no PR (the `lastUpdated`-only diff filter enforces this).
- **PR reuse when the branch already exists.**
  A repeat run force-pushes and lets GitHub update the open PR rather than opening a duplicate.

## Testing changes to `action.yml`

There is no unit test suite for `action.yml` itself.
Meaningful changes should be exercised via:

1. Local dry-run of the engine (`node …/apply-transformations.ts`) to confirm the CLI contract still holds.
2. A caller-side integration test — either a real caller repo pointed at this branch by SHA, or a fixture PR against a scratch target repo.

## Anti-patterns

- **Adding conditional logic to shell steps.**
  If a step needs an `if` on data content, move the logic into a package function and invoke it from shell.
  Shell branching is hard to test and easy to break.
- **Hardcoding Dash0-specific values in defaults.**
  The action lives in a public repo consumed by public callers.
  `target-repository` and `target-directory` used to default to Dash0's private website repository and its internal docs path — those defaults were removed precisely because they published private-repo internals (see "Why the target inputs have no defaults" above).
  Do not reintroduce org-specific defaults; configuration flows through action inputs, fed from caller-side secrets or variables.
