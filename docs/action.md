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

| Input                  | Required | Default                                            | Purpose                                                                           |
| ---------------------- | -------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `source-root`          | no       | `.`                                                | Directory containing the source docs, relative to the caller workspace            |
| `transformations-file` | no       | `.github/workflows/sync-docs/transformations.yaml` | Path (relative to `source-root`) to the transformation declarations               |
| `target-repository`    | no       | `dash0hq/dash0-website`                            | The docs repo to push to                                                          |
| `target-directory`     | no       | `src/app/(core)/docs/content`                      | Directory inside the target repo receiving the transformed files                  |
| `target-github-token`  | yes      | —                                                  | Fine-grained PAT with `contents:write` + `pull-requests:write` on the target repo |
| `target-base-branch`   | no       | `main`                                             | Branch the PR is opened against                                                   |
| `pr-branch`            | yes      | —                                                  | Branch name used for the sync PR                                                  |
| `pr-title`             | yes      | —                                                  | PR title                                                                          |
| `pr-body`              | yes      | —                                                  | PR body                                                                           |
| `commit-message`       | no       | value of `pr-title`                                | Commit message when the sync produces changes                                     |

## Recommended caller-side secret naming

The action's `target-github-token` input is generic; callers decide what to name the underlying secret in their own repository.
For Dash0-owned callers (`otel-cicd-action`, `dash0-operator`, `dash0-sdk-web`, ...), standardise on:

- **`REPOSITORY_FULL_ACCESS_GITHUB_TOKEN`** — fine-grained PAT with `contents:write` + `pull-requests:write` on the target docs repo.

Callers reference it as:

```yaml
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

1. **Set up Node.js** from `.nvmrc`.
2. **Set up pnpm** from the repo root's `package.json` `packageManager` field.
3. **`pnpm install --frozen-lockfile`** in the action's own directory (`${{ github.action_path }}`).
4. **Run the transformer** with the caller's `source-root`, `transformations-file`, and a scratch `${RUNNER_TEMP}/transformed-docs` output directory.
5. **Check out the target repository** at `target-base-branch` into `.sync-docs-target-repository/` (uses the caller-supplied token).
6. **Copy the transformed files** into `<target-directory>` in the checked-out target repo.
7. **Create or update the sync PR:**
   - Configure `github-actions[bot]` as the git author.
   - Stage every change under `<target-directory>`.
   - If the only diff is `lastUpdated:` frontmatter changes (ignored via `git diff -I`), exit cleanly — nothing meaningful changed.
   - Otherwise, force-push the `pr-branch` and open a PR (or rely on the force-push to update an existing open PR).

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
  `target-repository` has `dash0hq/dash0-website` as a default because that's a legitimate assumption for the primary use case; do not extend that pattern to secrets or environment-specific values.
