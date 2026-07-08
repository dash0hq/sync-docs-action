# Code style

TypeScript conventions for this repository.

## Erasable TypeScript only

Node 24 runs `.ts` files directly via type stripping.
Any TypeScript syntax that requires transformation (rather than pure erasure) breaks the composite action at runtime.

**Do not use:**

- `enum` — use string literal unions instead (`type Kind = "a" | "b"`).
- `namespace` — use ES modules.
- Parameter properties (`constructor(private x: string)`) — write the assignment explicitly.
- `import` with `.ts` extensions elsewhere than a caller that has `allowImportingTsExtensions: true` in its `tsconfig.json` — inside this repo it's on, so `import "./foo.ts"` is fine within packages.

The linter can't catch every case; if you're unsure, run the composite action's script locally: `node packages/transformation-engine/src/apply-transformations.ts …`.
Runtime errors like `Unknown file extension` or `SyntaxError: enums are not supported` mean the code isn't erasable.

## Module and export shape

- `"type": "module"` in every workspace package. Use ESM `import`/`export`, not `require`.
- Prefer **named exports**.
  Default exports lose their name at the import site and complicate refactors.
- Group **pure logic** in one module and **I/O** in another so tests can exercise the logic without a filesystem or network.

## Types and generics

- Prefer **narrow, purpose-built types** over broad generic contracts.
  If a function only ever takes `FileEntry`, don't generalise it to `T extends { source: string }`.
- Use `noUncheckedIndexedAccess` (enabled in `tsconfig.base.json`): every array/object index returns `T | undefined`, and the caller decides how to handle absence. Don't disable this per-file.
- Use `unknown` for values from untyped sources (YAML parse, JSON parse). Validate before narrowing.

## Comments

- Default to **no comments**.
  Named identifiers and clear code are the primary documentation.
- Add a comment only when the **why** is non-obvious — a hidden constraint, a subtle invariant, or a workaround for a specific bug.
  Don't comment what the code already says.
- Doc-comment the **exported** functions of a package explaining what the caller needs to know.
  Skip internal helper functions unless their contract is subtle.

## Errors

- Throw `Error` (or a subclass) with a message that names the failing item (path, key, transformation description).
  The composite action surfaces these in the workflow log; the more specific the message, the shorter the debugging loop.
- Do not throw strings.
- At the CLI entry point (`apply-transformations.ts`), catch and `console.error(err.message); process.exit(1)` — do not print a stack trace unless a `DEBUG` env var is set.

## Async

- The engine is currently synchronous (uses `fs.readFileSync` / `writeFileSync`).
  Do not introduce async I/O in the hot path unless there is a concrete throughput reason; async adds concurrency edge cases that the linear pipeline doesn't otherwise have.

## Formatting

- Tabs for indentation (matches the ported engine's style).
- Trailing commas everywhere they're syntactically valid.
- Line width: no hard limit, but prefer breaking long lines for readability rather than fitting into 80 columns.
