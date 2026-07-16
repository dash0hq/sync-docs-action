# Transformation engine

`@dash0hq/transformation-engine` applies transformations declared in a source repo's `transformations.yaml` to its documentation files and writes the results to an output directory.
The composite action invokes it via `node packages/transformation-engine/src/apply-transformations.ts …`.

## Modules

- `src/transformations.ts` — **pure logic**, no I/O.
  Types, config parsing, individual transformation application, link rewrites, frontmatter generation, and the full per-file pipeline (`transformContent`).
  Every function is testable in isolation without touching the filesystem.
- `src/apply-transformations.ts` — **CLI + I/O**.
  Parses `argv`, reads the YAML, walks the source tree, invokes `transformContent`, writes the outputs, and (when configured) writes a generated `nav.json`.

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
  `files` is the sole opt-in list: any file in the source repo that is not declared here is ignored by the sync.
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

## Nav.json generation

Add an optional top-level `nav` block to `transformations.yaml` to generate a `nav.json` alongside the synced pages:

```yaml
nav:
  target: dash0/miscellaneous/glossary/nav.json
  order: 74
  id: glossary
  parentPath: Miscellaneous
  title: Glossary
files:
  - source: docs/overview.md
    target: dash0/miscellaneous/glossary/overview.md
    title: About the Glossary
    description: One-line frontmatter description.
```

Fields:

- `target` — output path for the nav.json, relative to `target-directory` in the target repo.
- `order` — number used by `dash0-website` to sort sections.
- `id` — stable identifier for the section (matches `dash0-website`'s existing nav.json convention).
- `parentPath` — optional; parent section title shown in the nav breadcrumb.
- `title` — the section title rendered as `items[0].title`.
- `groupTitles` — optional map from directory slug to display title, used when the file targets nest below the common prefix (see [Nested groups](#nested-groups) below).

The generator emits a single group under `items[0]` whose `children` reflect the on-disk hierarchy of the `target` paths.
Each leaf is a `{ title, path }` entry whose `title` comes from the file's `title` and whose `path` is the file's `target`, in the order the files are declared.

For a flat sync (every file lands in the same directory), this produces the same shape used across `dash0-website` (`items[0]` with a `title` and a `children` list of `{ title, path }` leaves).

### Nested groups

When some files sit in a subdirectory below the common directory prefix of every `target`, those subdirectories become **group** nodes in the emitted tree.
The engine walks each file's `target`, strips the longest directory prefix shared by every file, and inserts the remaining path segments as nested `{ title, children }` groups.

Given, for example:

```yaml
nav:
  target: dash0-cli/nav.json
  order: 72.6
  id: dash0-cli
  parentPath: Tooling
  title: Dash0 CLI
  groupTitles:
    github-actions: GitHub Actions

files:
  - source: docs/about.md
    target: miscellaneous/tooling/dash0-cli/about.md
    title: About the Dash0 CLI
    description: ...
  - source: docs/commands.md
    target: miscellaneous/tooling/dash0-cli/commands.md
    title: Command Reference
    description: ...
  - source: .github/actions/setup/README.md
    target: miscellaneous/tooling/dash0-cli/github-actions/setup.md
    title: Setup Dash0 CLI
    description: ...
  - source: .github/actions/send-log-event/README.md
    target: miscellaneous/tooling/dash0-cli/github-actions/send-log-event.md
    title: Send log event
    description: ...
```

The common prefix is `miscellaneous/tooling/dash0-cli`, so the first two files land as top-level leaves and the last two are grouped under a `"GitHub Actions"` node (title looked up in `groupTitles`; slugs not listed there fall back to using the slug itself).
Nesting can go arbitrarily deep — every additional directory segment produces another group level.
Groups are inserted at the position of the first file that references them; a later file reusing the same subdirectory joins the existing group instead of opening a new one.

## Extension points

Adding a new transformation type:

1. Add the type shape to the `Transformation` union in `transformations.ts`.
2. Extend `validateTransformation` to parse it.
3. Handle it in `applyTransformation`'s `switch`.
4. Add tests: happy path, required-match failure (if applicable), and any edge cases.
5. Document the type in @docs/transformation-engine.md (this file).

Do not add engine features that only exist to serve a single caller.
The engine is shared across every source repo; per-caller behaviour belongs in that caller's `transformations.yaml`.
