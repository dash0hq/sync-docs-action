# Sync docs action

Composite GitHub Action + supporting TypeScript libraries that sync source-repository documentation into
[`dash0hq/dash0-website`](https://github.com/dash0hq/dash0-website).

> **Note:** Unless you are working on Dash0, this action is probably irrelevant to you.

Source repositories (`dash0hq/otel-cicd-action`, `dash0hq/dash0-operator`, `dash0hq/dash0-sdk-web`, ...) call
this action from their own workflows to publish transformed READMEs and topic files into
`dash0-website`'s docs tree, opening or updating a pull request against the website for review.

## Layout

```
sync-docs-action/
├── action.yml                          # composite action at repo root; consumed as
│                                       #   uses: dash0hq/sync-docs-action@<sha>
├── CLAUDE.md / AGENTS.md               # thin index of agentic instructions; details in docs/
├── docs/                               # focused development guidelines
├── packages/
│   ├── transformation-engine/          # Applies transformations.yaml to source-repo docs;
│   │                                   #   invoked by the composite action at runtime.
│   └── docs-invariants/                # Redirect/URL invariants library (WIP; skeleton only in the
│                                       #   initial scaffold). Will be published as @dash0hq/docs-invariants
│                                       #   and consumed by both this action and dash0-website's own CI.
└── .github/workflows/ci.yml            # typecheck + tests for all packages
```

Contributor and agent guidance is split across `CLAUDE.md` / `AGENTS.md` (thin index) and focused documents under `docs/` — start there before making changes.

## Status

Initial scaffold ports the transformation engine (with its 87-test suite) from the closed `dash0hq/dash0-website` in-repo prototype. See PR history for the design rationale that led to extracting to a standalone public repo.

`docs-invariants` is a skeleton in the initial scaffold and will grow into a full library covering:

- Uniqueness of redirect keys across all shards in `dash0-website`'s `redirects/*.ts` layout.
- Verifying that every redirect target resolves to a real page.
- Detecting when a redirect key shadows a still-existing page.
- Failing sync flows that would delete pages without a corresponding redirect.

## Development

Node 24 (see `.nvmrc`) and pnpm 10.

```bash
pnpm install
pnpm test           # runs tests across all workspace packages
pnpm typecheck      # tsc --noEmit across all workspace packages
```

## License

Apache 2.0.
