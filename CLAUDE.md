# sync-docs-action development guide

This repository provides the composite GitHub Action + supporting TypeScript libraries that sync source-repository documentation into
[`dash0hq/dash0-website`](https://github.com/dash0hq/dash0-website), enabling source repos (`otel-cicd-action`, `dash0-operator`,
`dash0-sdk-web`, and future ones) to publish transformed READMEs and topic files as canonical Dash0 documentation pages.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Lint: `pnpm run lint` (autofix: `pnpm run lint:fix`)
- Format: `pnpm run format` (check-only: `pnpm run format:check`)
- Typecheck all packages: `pnpm run typecheck`
- Test all packages: `pnpm run test`
- Test one package: `pnpm --filter @dash0hq/transformation-engine test`
- Test in watch mode: `pnpm --filter @dash0hq/transformation-engine run test:watch`
- Run the transformer against a source repo locally:
  `node packages/transformation-engine/src/apply-transformations.ts <source-root> <source-root>/<path/to/transformations.yaml> ./.transformed-docs`

## Development guidelines

Detailed guidelines are split into focused documents:

- @docs/project-structure.md — monorepo layout, package roles, where each responsibility lives
- @docs/code-style.md — TypeScript conventions, erasable-TS rule, comments, exports
- @docs/testing.md — `node:test`, test placement, running individual tests, coverage expectations
- @docs/linting.md — ESLint + Prettier config, when to disable, formatting conventions per language
- @docs/documentation.md — prose rules for every doc, README, PR description, and inline commentary in this repo
- @docs/action.md — composite action design, inputs, PR flow, how to change caller-facing surface
- @docs/transformation-engine.md — engine architecture, `transformations.yaml` schema, extension points
- @docs/docs-invariants.md — status and planned scope of `@dash0hq/docs-invariants`
- @docs/releasing.md — tag conventions, when to cut a release, what to include in the changelog

## Hard rules

- **Do not introduce non-erasable TypeScript syntax** (`enum`, `namespace`, parameter properties, `TSX`).
  Node 24 runs `.ts` files directly via type stripping; anything not erasable breaks the composite action at runtime.
  Prefer string literal unions over enums.
- **Business logic belongs in packages, not in `action.yml`.** The composite action is a thin wrapper over `node …/apply-transformations.ts` plus git/gh calls.
  If a step needs conditional logic or data transformation, add it to a package and invoke the package from the shell.
- **Every PR must pass `pnpm run typecheck && pnpm run test`** in CI.
  Do not add TODO-quality tests or `.skip()` markers to make CI go green.
  If a test can't be written, the change isn't ready.
- **`action.yml` at the repo root is the caller-facing surface.** Its input names and defaults are effectively public API for every source repo consuming the action; don't rename or remove inputs without a coordinated migration.
  Adding an input is fine; changing or removing one is a breaking change.
- **The action runs in a public repo consumed by other public repos.** Never embed tokens, internal URLs, org-specific defaults, or anything that assumes the caller is a Dash0-owned repository.
  Configuration flows through action inputs.

## Key concepts

### The `/etc/*.d/` redirect layout in `dash0-website`

Source-repo syncs write redirect entries into `dash0-website`'s
[`src/app/(core)/docs/redirects/`](https://github.com/dash0hq/dash0-website/tree/main/src/app/%28core%29/docs/redirects) directory, one shard file per source repo (`otel-cicd-action.ts`, `dash0-operator.ts`, ...).
Each shard exports `redirects: Record<string, DocumentationPagePath>`; `dash0-website`'s `scripts/build-redirects.ts` aggregates them into a single generated map at build time.

Two consequences that shape how this action must behave:

- **The action writes to exactly one shard file per source repo**, named after the caller repo by default (`${GITHUB_REPOSITORY##*/}.ts`).
  Two syncs against different source repos physically cannot conflict on the redirects surface because they never touch the same file.
- **A key must not appear in more than one shard.**
  `dash0-website`'s aggregator fails the build if it does.
  Before writing a redirect, the action should verify no other shard already claims the key (once `@dash0hq/docs-invariants` lands).

### Transformation ordering

The engine applies transformations in a fixed order per file:

1. `common` transformations from `transformations.yaml`, in declared order.
2. File-specific `transformations`, in declared order.
3. Automatic link rewrites: `README.md` → `overview`, `docs/…` → sibling, drop `.md` suffix.
4. Frontmatter prepended (`title`, `description`, `lastUpdated`).

Do not reorder these steps.
The rewrites in step 3 rely on step 2 having already converted absolute link intent into relative form; running rewrites first would miss transformations that produce new links.
