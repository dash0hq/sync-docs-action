# Linting and formatting

Two tools, one job each:

- **ESLint** catches correctness issues (unused variables, `no-explicit-any`, unreachable code, `no-floating-promises`, and so on). Its config lives in `eslint.config.js` at the repo root.
- **Prettier** owns formatting (indentation, quotes, wrapping, trailing commas, arrow-parens). Its config lives in `.prettierrc.json`.

`eslint-config-prettier` is loaded last in the ESLint config to turn off stylistic ESLint rules that would fight Prettier. The two tools cover disjoint concerns; disagreements are Prettier's to settle.

## Commands

- `pnpm run lint` — run ESLint; fail on any error.
- `pnpm run lint:fix` — run ESLint with `--fix` (safe autofixes only).
- `pnpm run format` — rewrite files with Prettier.
- `pnpm run format:check` — check formatting without modifying files (used in CI).

## What the config enforces

Beyond the recommended TypeScript rules:

- **`@typescript-eslint/no-unused-vars: error`** with `argsIgnorePattern: ^_` — prefix a param with `_` to silence intentionally.
- **`@typescript-eslint/no-explicit-any: error`** for source files. Test files disable this because they intentionally construct malformed inputs to exercise error paths.

Prettier settings match the ported engine's existing style:

- **Tabs** for TypeScript (`useTabs: true`), matching the engine's indentation.
- **2-space** indentation for JSON, YAML, and Markdown (per-language override), matching npm and YAML conventions.
- **Trailing commas everywhere** (`trailingComma: "all"`).
- **Double quotes** for strings, **semicolons** on statements, **LF** line endings.
- **100-char** target line width (Prettier respects context; not a hard cap).

## CI

`.github/workflows/ci.yml` runs `lint`, then `format:check`, then `typecheck`, then `test`, in that order. A failure in any step short-circuits the pipeline — no point running tests when the code isn't parseable.

## When adding a new rule

- **Correctness rule?** Add it to `eslint.config.js` in the appropriate block (general vs `**/*.test.ts`).
- **Formatting preference?** Adjust `.prettierrc.json`. Do not add stylistic ESLint rules that duplicate Prettier's job.
- **Rule too noisy on existing code?** Do not disable inline with `// eslint-disable-next-line …` unless the code is genuinely correct and the rule wrong for this case. Prefer fixing the code.

## When disagreements with the tools happen

- **ESLint flags a real bug** → fix the code.
- **ESLint flags a false positive** → open a discussion, adjust the rule config, or annotate inline with a `// eslint-disable-next-line` and a short comment explaining why.
- **Prettier reformats in a way that hurts readability** → this is very rare; if it does happen, adjust `.prettierrc.json` for the affected language.
