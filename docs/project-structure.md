# Project structure

Layout of the repository and what each part is responsible for.

```
sync-docs-action/
├── action.yml                                     Composite action at repo root — the caller-facing surface
├── package.json                                   pnpm workspace root; test/typecheck fan out to packages
├── pnpm-workspace.yaml                            Declares `packages/*` as workspace members
├── pnpm-lock.yaml                                 Committed for reproducible installs
├── tsconfig.base.json                             Shared TS settings; per-package tsconfigs extend
├── .nvmrc                                         Pins Node version consumed by CI and by `actions/setup-node`
├── docs/                                          Focused development guidelines (this directory)
├── packages/
│   ├── transformation-engine/                     Runtime engine invoked by the composite action
│   └── docs-invariants/                           Invariants library (planned publication as `@dash0hq/docs-invariants`)
└── .github/workflows/
    └── ci.yml                                     pnpm install → typecheck → test, all workspace packages
```

## Package roles

### `packages/transformation-engine/`

- **What it does.** Applies transformations declared in a source repo's `transformations.yaml` to documentation files, applies automatic link rewrites (README → `overview`, `docs/…` → sibling, drop `.md`), prepends generated frontmatter, and writes the transformed files to an output directory.
- **How it's used.** `action.yml` invokes `node packages/transformation-engine/src/apply-transformations.ts …` as a CLI.
- **Runtime dependencies.** `yaml` — that's it. Keep the surface small; every dependency lengthens `pnpm install` on every action invocation.
- **Not published.** `private: true`. It exists only to be executed from `action.yml`.

Pure logic lives in `src/transformations.ts`.
I/O (reading `transformations.yaml`, walking the source tree, writing output) lives in `src/apply-transformations.ts`.
The split lets the pure logic be exercised end-to-end from tests without touching the filesystem.

### `packages/docs-invariants/`

- **Planned role.** Reusable library enforcing invariants across `dash0-website`'s docs tree:
  - Redirect key uniqueness across all shards.
  - Redirect target validity (every value resolves to a real page).
  - Shadowing detection (redirect keys must not overlap real page paths).
  - Deletion coverage (removed pages must have a redirect).
- **Consumers.** Both this repo's composite action (invoked before opening the sync PR) and `dash0-website`'s own CI (invoked on every PR touching `redirects/**`).
- **Publication.** Planned as `@dash0hq/docs-invariants` on npm once the API stabilises.
- **Current state.** Scaffold — package metadata, a placeholder export, a smoke test. Real API lands in a follow-up PR.

See @docs-invariants.md for status and the planned API surface.

## What's _not_ in packages

- `action.yml` at the repo root — composite action shell, glues the engine to git+gh.
- `.github/workflows/ci.yml` — repo-level CI, not per-package.
- No `dist/` directory. There is no build step; Node 24 executes `.ts` files directly.
