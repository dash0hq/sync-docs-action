# Documentation

Every piece of prose in this repository — README, CLAUDE.md/AGENTS.md, every file under `docs/`, PR descriptions, and inline commentary — follows the rules below.
The rules are borrowed from `dash0hq/dash0-cli`; keeping them consistent across Dash0 repos means contributors switching between projects don't have to relearn conventions.

## Line and paragraph structure

- **One sentence per line** (semantic line breaks).
  Each sentence starts on its own line; do not wrap mid-sentence.
- Separate paragraphs with a single blank line.
- Keep paragraphs between 2 and 5 sentences.

Semantic line breaks make diffs review-friendly: a rewritten sentence shows up as one changed line, not a whole reflowed paragraph.
Prettier's `proseWrap: "preserve"` (the default) respects this — do not switch to `always` or `never`.

## Section headers

- **Sentence case**, e.g. `## Adding or removing an input` — not `## Adding Or Removing An Input`.
- Proper nouns keep their capitalisation (`TypeScript`, `GitHub Actions`, `Dash0`).
- No trailing punctuation.

## Links

- Use inline Markdown links: `[visible text](url)`.
- Link the most specific relevant term, not generic phrases like "click here" or "this page".
- Cross-references within the repo use relative paths (`@docs/testing.md` in CLAUDE.md/AGENTS.md; `docs/testing.md` in other docs); external references use the full URL.

## Code blocks

- Fence with triple backticks and a language identifier (` ```bash `, ` ```ts `, ` ```yaml `).
- **One independent command per code block.**
  A reader's copy action should never grab more than one thing they intended to run.
  Exceptions: a multi-line invocation continued with `\`, a `KEY=value` env-var prefix followed by the command, or a pipeline (`foo | jq …`) — those are a single command.
- Multi-step workflows use one code block per step with prose in between explaining what the previous step accomplished and what the next one does.

## Punctuation and typography

- End sentences with full stops.
- Use the **Oxford comma** (e.g. "engine, invariants, and action").
- Straight quotes are fine inside code blocks and in inline `code`; prefer typographic quotes elsewhere when convenient, but do not over-engineer this — inconsistent quotes are not worth chasing across a diff.
- Write numbers as digits and spell out "percent" (e.g. "10 percent", not "10%").

## Voice and directness

- **Active voice** — "The action writes to one shard file per source repo" beats "One shard file per source repo is written to by the action".
- **Direct instructions** — "Add a new input to `action.yml`" beats "You can add a new input by editing `action.yml`".
- **Concise** — prefer shorter sentences over longer ones. If a sentence has more than one comma, consider splitting it.

## What not to do

- **Do not use em dashes (`—`) to split a sentence** — write a shorter sentence instead.
  (This rule is inherited from `dash0-website`; it is less strict than dash0-cli's, but Dash0 prose reads better without them.)
  Em dashes inside parenthetical asides in prose about code are grudgingly acceptable when a comma or period would be unclear; use them sparingly.
- Do not use rhetorical questions ("But what if the caller does X?") — state the case directly.
- Do not add "Note:" or "Important:" prefixes to sentences that are neither notes nor especially important.
  If the whole document is instructional, everything is important.

## Examples in prose about the composite action

- When quoting an input name, use inline code: `target-github-token`.
- When quoting a file path, use inline code: `packages/transformation-engine/src/apply-transformations.ts`.
- When quoting a workflow event or step name, use inline code: `pull_request`, `Install dependencies`.
- Full commands go in code blocks, not inline.
