# Transformation engine

`@dash0hq/transformation-engine` applies transformations declared in a source repo's `transformations.yaml` to its documentation files and writes the results to an output directory.
The composite action invokes it via `node packages/transformation-engine/src/apply-transformations.ts …`.

## Modules

- `src/transformations.ts` — **pure logic**, no I/O.
  Types, config parsing, individual transformation application, link rewrites, frontmatter generation, and the full per-file pipeline (`transformContent`).
  Every function is testable in isolation without touching the filesystem.
- `src/apply-transformations.ts` — **CLI + I/O**.
  Parses `argv`, reads the YAML, walks the source tree, invokes `transformContent`, writes the outputs.
  Also enforces the "every `docs/*.md` in the source must be declared in `transformations.yaml`" invariant.

The split matters: it lets the pipeline be exercised end-to-end from tests without a filesystem, and it keeps I/O concerns in one place.

## `transformations.yaml` schema

Top-level shape:

```yaml
common:
  - <transformation>
  - <transformation>
files:
  - source: README.md
    target: dash0/miscellaneous/manage-as-code/manage-foo-as-code.md
    title: Manage Foo as Code
    description: One-line frontmatter description.
    transformations:
      - <transformation>
```

- `common` — optional list applied to every file, in order, before file-specific ones.
- `files` — required non-empty list. Each entry declares one output page.
  `source` is relative to the source root; `target` is relative to `target-directory` in the docs repo.
- `title`, `description` — rendered into the emitted frontmatter.
- `transformations` (per file) — optional list applied after `common`, in order.

### Transformation types

| Type            | Purpose                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepend`       | Insert `content` at the start of the document. Placeholder substitution applies.                                                                                                                                                                                                                                          |
| `replace-regex` | Replace matches of the regex `find` with `replace`. Optional `flags`: `multiline`, `dotall`, `ignorecase`. Backreferences use Python style (`\1`); leading inline flags (`(?s)`, `(?im)`) are lifted into the compiled regex. Python-style compatibility exists to preserve prior `transformations.yaml` files unchanged. |
| `remove-line`   | Remove the whole line containing the literal `line` marker. Collapses resulting runs of blank lines to one.                                                                                                                                                                                                               |

**Every `replace-regex` and `remove-line` must match at least once by default.**
Zero matches fails the run — guards against source docs drifting away from the transformations file (silently reducing a rule to a no-op).
Set `required: false` on an entry to allow zero matches.

### Placeholders

`prepend.content` and `replace-regex.replace` may reference `$timestamp`, expanded to the current UTC time (computed once per run so every occurrence renders identically).

## Automatic link rewrites

After the declared transformations run, the pipeline applies three rewrites in this order:

1. `](README.md#anchor)` → `](overview#anchor)` (relative links pointing at the renamed README).
2. `](docs/foo.md#anchor)` → `](foo#anchor)` (relative links into the source `docs/` directory).
3. `](configuration.md)` → `](configuration)` (drop `.md` from same-directory sibling links).

Only **relative** links are affected.
Absolute URLs (`https://…`) are untouched.
These rewrites exist because the website serves docs pages under extensionless URLs and because the README typically becomes an `overview` page.

## Frontmatter

`prependFrontmatter` produces:

```markdown
---
title: <title>
description: <description>
lastUpdated: <ISO 8601 UTC timestamp>
---
```

Values are serialised through the `yaml` library's `stringify` (with `lineWidth: 0`), so titles containing colons, `#`, `?`, `-`, embedded newlines, or double quotes are quoted or block-scalared correctly.
This behavior is covered by round-trip tests: emit → parse → assert equality with the input.

## Extension points

Adding a new transformation type:

1. Add the type shape to the `Transformation` union in `transformations.ts`.
2. Extend `validateTransformation` to parse it.
3. Handle it in `applyTransformation`'s `switch`.
4. Add tests: happy path, required-match failure (if applicable), and any edge cases.
5. Document the type in @docs/transformation-engine.md (this file).

Do not add engine features that only exist to serve a single caller.
The engine is shared across every source repo; per-caller behaviour belongs in that caller's `transformations.yaml`.
