# Testing

Test conventions for this repository.

## Framework

`node:test` — the Node.js built-in test runner.
No `jest`, no `vitest`, no additional dependency.
Node 24 discovers and runs `*.test.ts` files directly.

The `spec` reporter is used for readable output:

```
node --test --test-reporter=spec 'src/*.test.ts'
```

## Placement

Tests live **next to the module they cover**, sharing the base filename:

- `src/transformations.ts` → `src/transformations.test.ts`
- `src/apply-transformations.ts` → `src/apply-transformations.test.ts`

`test.ts` files are excluded from the published surface of a package (via `.npmignore` or `files` in `package.json` when we start publishing), but they're first-class citizens of the source tree — no `__tests__/` subdirectory, no separate `tests/` root.

## Structure

Use `describe` and `it` from `node:test` for grouping.
Use `strict` assertions from `node:assert`:

```ts
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

describe("myFunction", () => {
  it("does the expected thing", () => {
    assert.equal(myFunction(1), 2);
  });
});
```

## Running tests

- All packages: `pnpm run test` (fans out via `pnpm --recursive --parallel test`).
- One package: `pnpm --filter @dash0hq/transformation-engine test`.
- Watch mode: `pnpm --filter @dash0hq/transformation-engine run test:watch`.
- Single file: `node --test --test-reporter=spec packages/transformation-engine/src/transformations.test.ts`.

## What to test

- **Every exported function** of a package should have at least one test that exercises its happy path.
- **Every error path** the module can throw should have a test that triggers it.
  Tests that assert error messages catch regressions where an error message changes in a way that breaks a downstream consumer parsing it.
- **Edge cases the code deliberately handles** (empty inputs, missing files, malformed data) get dedicated tests.
- **End-to-end filesystem behavior** for the `apply-transformations` CLI is exercised in `apply-transformations.test.ts` using `mkdtempSync` for isolation.

## What not to test

- **Framework code and library internals.** Trust `node:fs`, trust `yaml.parse` — test only the code you own.
- **Type assertions.** TypeScript's type system catches those.

## Discipline

- Do not merge a PR with `.skip()` markers to make CI go green.
  If a test can't be written, the change isn't ready.
- Do not lower assertion strictness (`assert.deepEqual` → `assert.ok`) to make a flaky test pass.
  Fix the source of flakiness or reproduce it with a more precise test.
- Tests must be deterministic.
  Where a test would depend on wall-clock time (frontmatter's `lastUpdated`), inject the timestamp via a helper (`buildPlaceholders(now)`).
