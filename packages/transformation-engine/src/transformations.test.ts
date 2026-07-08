// SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { parse as parseYaml } from "yaml";

import {
	applyTransformation,
	applyTransformations,
	buildPlaceholders,
	compileRegex,
	describeTransformation,
	expandTemplate,
	parseConfig,
	prependFrontmatter,
	removeLine,
	rewriteDocsDirLinks,
	rewriteIntraDocsLinks,
	rewriteReadmeLinks,
	substitutePlaceholders,
	transformContent,
	type FileEntry,
	type Placeholders,
	type RemoveLineTransformation,
	type Transformation,
} from "./transformations.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXED_TIMESTAMP = "2026-04-20T05:00:00.123Z";
const PLACEHOLDERS: Placeholders = { $timestamp: FIXED_TIMESTAMP };

function fileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		source: "README.md",
		target: "path/to/output.md",
		title: "Test Title",
		description: "Test description.",
		transformations: [],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// buildPlaceholders / substitutePlaceholders
// ---------------------------------------------------------------------------

describe("buildPlaceholders", () => {
	it("uses toISOString formatting for the given Date", () => {
		const now = new Date("2026-01-02T03:04:05.678Z");
		const p = buildPlaceholders(now);
		assert.equal(p.$timestamp, "2026-01-02T03:04:05.678Z");
	});

	it("defaults to the current time when no Date is provided", () => {
		const before = Date.now();
		const p = buildPlaceholders();
		const after = Date.now();
		const parsed = Date.parse(p.$timestamp);
		assert.ok(parsed >= before && parsed <= after, `timestamp ${p.$timestamp} out of range`);
	});
});

describe("substitutePlaceholders", () => {
	it("replaces every occurrence of every key with its literal value", () => {
		const out = substitutePlaceholders("A $timestamp B $timestamp C", PLACEHOLDERS);
		assert.equal(out, `A ${FIXED_TIMESTAMP} B ${FIXED_TIMESTAMP} C`);
	});

	it("treats placeholder keys as literal strings (no regex specials)", () => {
		const p: Placeholders = { $timestamp: FIXED_TIMESTAMP, "$foo.bar": "OK" };
		assert.equal(substitutePlaceholders("x$foo.bary", p), "xOKy");
	});

	it("returns the input unchanged when no placeholders match", () => {
		assert.equal(substitutePlaceholders("nothing here", PLACEHOLDERS), "nothing here");
	});
});

// ---------------------------------------------------------------------------
// compileRegex
// ---------------------------------------------------------------------------

describe("compileRegex", () => {
	it("always sets the global flag so replace-all semantics match Python's re.sub", () => {
		const r = compileRegex("a");
		assert.ok(r.flags.includes("g"));
	});

	it("maps declared long flag names to JS single-letter flags", () => {
		const r = compileRegex("^foo$", ["multiline", "ignorecase"]);
		assert.ok(r.flags.includes("m"));
		assert.ok(r.flags.includes("i"));
	});

	it("supports dotall", () => {
		const r = compileRegex("a.b", ["dotall"]);
		assert.equal(r.test("a\nb"), true);
	});

	it("throws on unknown flag names", () => {
		assert.throws(() => compileRegex("x", ["nope"]), /unknown regex flag "nope"/);
	});

	it("lifts leading inline flags like (?s) into the RegExp flags", () => {
		const r = compileRegex("(?s)a.b");
		assert.equal(r.test("a\nb"), true);
	});

	it("lifts combined inline flags", () => {
		const r = compileRegex("(?ims)^foo.bar$");
		assert.ok(r.flags.includes("m"));
		assert.ok(r.flags.includes("s"));
		assert.ok(r.flags.includes("i"));
	});

	it("does not strip inline groups that aren't a leading recognised flag block", () => {
		// `(?:...)` is a non-capturing group, not an inline flag block.
		const r = compileRegex("(?:foo)bar");
		assert.equal(r.test("foobar"), true);
	});

	it("rejects the verbose flag (?x)", () => {
		assert.throws(() => compileRegex("(?x)a\n b"), /verbose regex flag/);
	});

	it("deduplicates flags added from both inline and declared sources", () => {
		const r = compileRegex("(?s)a.b", ["dotall"]);
		// Only one `s`.
		const sCount = [...r.flags].filter((c) => c === "s").length;
		assert.equal(sCount, 1);
	});
});

// ---------------------------------------------------------------------------
// expandTemplate
// ---------------------------------------------------------------------------

describe("expandTemplate", () => {
	it("expands \\1 .. \\9 to the corresponding capture group", () => {
		assert.equal(
			expandTemplate("[\\1](url/\\2)", "[label](url)", ["label", "url"]),
			"[label](url/url)",
		);
	});

	it("expands \\0 to the whole match", () => {
		assert.equal(expandTemplate("[\\0]", "hello", []), "[hello]");
	});

	it("treats missing groups as empty strings", () => {
		assert.equal(expandTemplate("[\\1][\\2]", "match", ["only"]), "[only][]");
	});

	it("treats \\\\ as a literal backslash", () => {
		assert.equal(expandTemplate("path\\\\here", "match", []), "path\\here");
	});

	it("passes through non-backreference escapes", () => {
		assert.equal(expandTemplate("\\a", "match", []), "\\a");
	});

	it("does not touch $ characters (they are only special in JS's replace, not in our template)", () => {
		assert.equal(expandTemplate("price is $5", "m", []), "price is $5");
	});
});

// ---------------------------------------------------------------------------
// applyTransformation — prepend
// ---------------------------------------------------------------------------

describe("applyTransformation: prepend", () => {
	it("prepends the given content to the document", () => {
		const t: Transformation = { type: "prepend", content: "HEAD\n" };
		assert.equal(applyTransformation("body", t, 1, PLACEHOLDERS), "HEAD\nbody");
	});

	it("substitutes placeholders inside the prepended content", () => {
		const t: Transformation = { type: "prepend", content: "at $timestamp\n" };
		assert.equal(applyTransformation("x", t, 1, PLACEHOLDERS), `at ${FIXED_TIMESTAMP}\nx`);
	});
});

// ---------------------------------------------------------------------------
// applyTransformation — replace-regex
// ---------------------------------------------------------------------------

describe("applyTransformation: replace-regex", () => {
	it("replaces every match by default", () => {
		const t: Transformation = { type: "replace-regex", find: "a", replace: "b" };
		assert.equal(applyTransformation("banana", t, 1, PLACEHOLDERS), "bbnbnb");
	});

	it("supports Python-style backreferences in the replacement", () => {
		const t: Transformation = {
			type: "replace-regex",
			find: "\\[([^\\]]+)\\]\\((?!https?://|/)([^)]+)\\)",
			replace: "[\\1](https://github.com/example/repo/blob/main/\\2)",
			required: false,
		};
		const input = "See [docs](docs/foo.md) and [external](https://example.com).";
		const out = applyTransformation(input, t, 1, PLACEHOLDERS);
		assert.equal(
			out,
			"See [docs](https://github.com/example/repo/blob/main/docs/foo.md) and [external](https://example.com).",
		);
	});

	it("substitutes placeholders in the replacement before regex expansion", () => {
		const t: Transformation = {
			type: "replace-regex",
			find: "TS",
			replace: "$timestamp",
		};
		assert.equal(applyTransformation("TS", t, 1, PLACEHOLDERS), FIXED_TIMESTAMP);
	});

	it("supports the multiline flag", () => {
		const t: Transformation = {
			type: "replace-regex",
			find: "^X",
			replace: "Y",
			flags: ["multiline"],
		};
		assert.equal(applyTransformation("X\nX\nX", t, 1, PLACEHOLDERS), "Y\nY\nY");
	});

	it("supports the dotall flag", () => {
		const t: Transformation = {
			type: "replace-regex",
			find: "a.c",
			replace: "Z",
			flags: ["dotall"],
		};
		assert.equal(applyTransformation("a\nc", t, 1, PLACEHOLDERS), "Z");
	});

	it("supports the ignorecase flag", () => {
		const t: Transformation = {
			type: "replace-regex",
			find: "hello",
			replace: "hi",
			flags: ["ignorecase"],
		};
		assert.equal(applyTransformation("Hello HELLO hello", t, 1, PLACEHOLDERS), "hi hi hi");
	});

	it("throws when a required transformation matches nothing", () => {
		const t: Transformation = { type: "replace-regex", find: "zzz", replace: "yyy" };
		assert.throws(() => applyTransformation("abc", t, 1, PLACEHOLDERS), /matched nothing/);
	});

	it("returns input unchanged when a non-required transformation matches nothing", () => {
		const t: Transformation = {
			type: "replace-regex",
			find: "zzz",
			replace: "yyy",
			required: false,
		};
		assert.equal(applyTransformation("abc", t, 1, PLACEHOLDERS), "abc");
	});

	it("includes the description in required-match errors", () => {
		const t: Transformation = {
			type: "replace-regex",
			find: "zzz",
			replace: "yyy",
			description: "strip zzz",
		};
		assert.throws(() => applyTransformation("abc", t, 1, PLACEHOLDERS), /strip zzz/);
	});
});

// ---------------------------------------------------------------------------
// applyTransformation — remove-line & removeLine
// ---------------------------------------------------------------------------

describe("applyTransformation: remove-line", () => {
	it("removes the whole line containing the literal marker", () => {
		const t: Transformation = { type: "remove-line", line: "REMOVE" };
		const input = "keep 1\nprefix REMOVE suffix\nkeep 2\n";
		assert.equal(applyTransformation(input, t, 1, PLACEHOLDERS), "keep 1\nkeep 2\n");
	});

	it("collapses resulting runs of blank lines to a single blank line", () => {
		const t: RemoveLineTransformation = { type: "remove-line", line: "GONE" };
		const input = "before\n\nGONE\n\nafter";
		assert.equal(removeLine(input, t, "d"), "before\n\nafter");
	});

	it("removes only the first occurrence", () => {
		const t: Transformation = { type: "remove-line", line: "MARK" };
		const input = "MARK\nsomething\nMARK\n";
		assert.equal(applyTransformation(input, t, 1, PLACEHOLDERS), "something\nMARK\n");
	});

	it("removes the last line when it has no trailing newline", () => {
		const t: Transformation = { type: "remove-line", line: "tail" };
		assert.equal(applyTransformation("head\ntail", t, 1, PLACEHOLDERS), "head\n");
	});

	it("throws when a required marker is not found", () => {
		const t: Transformation = {
			type: "remove-line",
			line: "not-there",
			description: "strip banner",
		};
		assert.throws(() => applyTransformation("abc", t, 1, PLACEHOLDERS), /strip banner/);
	});

	it("returns input unchanged when a non-required marker is not found", () => {
		const t: Transformation = {
			type: "remove-line",
			line: "missing",
			required: false,
		};
		assert.equal(applyTransformation("abc", t, 1, PLACEHOLDERS), "abc");
	});
});

// ---------------------------------------------------------------------------
// applyTransformations (sequence)
// ---------------------------------------------------------------------------

describe("applyTransformations", () => {
	it("applies transformations left-to-right", () => {
		const list: Transformation[] = [
			{ type: "replace-regex", find: "a", replace: "b" },
			{ type: "replace-regex", find: "b", replace: "c" },
		];
		assert.equal(applyTransformations("aaa", list, PLACEHOLDERS), "ccc");
	});

	it("returns input unchanged when list is empty", () => {
		assert.equal(applyTransformations("x", [], PLACEHOLDERS), "x");
	});
});

// ---------------------------------------------------------------------------
// describeTransformation
// ---------------------------------------------------------------------------

describe("describeTransformation", () => {
	it("returns the declared description when present", () => {
		const t: Transformation = { type: "prepend", content: "x", description: "add header" };
		assert.equal(describeTransformation(t, 3), "add header");
	});

	it("falls back to a positional label when description is missing", () => {
		const t: Transformation = { type: "prepend", content: "x" };
		assert.equal(describeTransformation(t, 3), "transformation #3");
	});
});

// ---------------------------------------------------------------------------
// Link rewrites
// ---------------------------------------------------------------------------

describe("rewriteReadmeLinks", () => {
	it("rewrites ./README.md, ../README.md, and README.md", () => {
		const input = "[a](README.md) [b](./README.md) [c](../README.md)";
		assert.equal(rewriteReadmeLinks(input), "[a](overview) [b](overview) [c](overview)");
	});

	it("preserves anchors and queries", () => {
		assert.equal(
			rewriteReadmeLinks("[a](../README.md#supported-runtimes)"),
			"[a](overview#supported-runtimes)",
		);
		assert.equal(rewriteReadmeLinks("[a](README.md?foo=1)"), "[a](overview?foo=1)");
	});

	it("does not touch absolute URLs that happen to end in README.md", () => {
		const input = "[a](https://github.com/example/repo/blob/main/README.md)";
		assert.equal(rewriteReadmeLinks(input), input);
	});
});

describe("rewriteDocsDirLinks", () => {
	it("rewrites docs/foo.md and ./docs/foo.md to foo", () => {
		const input = "[a](docs/foo.md) [b](./docs/bar.md)";
		assert.equal(rewriteDocsDirLinks(input), "[a](foo) [b](bar)");
	});

	it("preserves nested paths under docs/", () => {
		assert.equal(rewriteDocsDirLinks("[a](docs/sub/thing.md#x)"), "[a](sub/thing#x)");
	});

	it("handles docs/ links without an .md suffix", () => {
		assert.equal(rewriteDocsDirLinks("[a](docs/foo)"), "[a](foo)");
	});

	it("does not touch absolute URLs containing docs/", () => {
		const input = "[k8s](https://kubernetes.io/docs/reference)";
		assert.equal(rewriteDocsDirLinks(input), input);
	});
});

describe("rewriteIntraDocsLinks", () => {
	it("drops the .md suffix from same-directory links", () => {
		assert.equal(rewriteIntraDocsLinks("[a](configuration.md)"), "[a](configuration)");
	});

	it("preserves the ./ prefix and any anchor", () => {
		assert.equal(
			rewriteIntraDocsLinks("[a](./configuration.md#enable)"),
			"[a](./configuration#enable)",
		);
	});

	it("does not touch links with a path (../ or docs/…)", () => {
		assert.equal(rewriteIntraDocsLinks("[a](../foo.md)"), "[a](../foo.md)");
		assert.equal(rewriteIntraDocsLinks("[a](docs/foo.md)"), "[a](docs/foo.md)");
	});

	it("does not touch absolute URLs", () => {
		const input = "[a](https://example.com/thing.md)";
		assert.equal(rewriteIntraDocsLinks(input), input);
	});
});

// ---------------------------------------------------------------------------
// prependFrontmatter
// ---------------------------------------------------------------------------

describe("prependFrontmatter", () => {
	// Extract the frontmatter block from a rendered document so tests can parse it back with the
	// same YAML engine `gray-matter` uses on the website (yaml v2).
	function extractFrontmatter(rendered: string): Record<string, unknown> {
		const match = rendered.match(/^---\n([\s\S]*?)\n---\n/);
		assert.ok(match, `no frontmatter block found in:\n${rendered}`);
		return parseYaml(match[1]!) as Record<string, unknown>;
	}

	it("produces the expected block with title, description, and lastUpdated", () => {
		const out = prependFrontmatter("body", fileEntry(), PLACEHOLDERS);
		assert.equal(
			out,
			`---\ntitle: Test Title\ndescription: Test description.\nlastUpdated: ${FIXED_TIMESTAMP}\n---\nbody`,
		);
	});

	it("drops leading blank lines from the content before attaching the frontmatter", () => {
		const out = prependFrontmatter("\n\n\nHello", fileEntry(), PLACEHOLDERS);
		assert.ok(out.endsWith("---\nHello"));
	});

	it("safely encodes a title containing a colon", () => {
		const entry = fileEntry({ title: "Has: colon" });
		const out = prependFrontmatter("body", entry, PLACEHOLDERS);
		const parsed = extractFrontmatter(out);
		assert.equal(parsed.title, "Has: colon");
	});

	it("safely encodes a title containing YAML-significant leading characters", () => {
		for (const title of ["#Hashy", "- Dashy", "? Questiony", "@AtSign"]) {
			const entry = fileEntry({ title });
			const out = prependFrontmatter("body", entry, PLACEHOLDERS);
			const parsed = extractFrontmatter(out);
			assert.equal(parsed.title, title, `round-trip failed for title ${JSON.stringify(title)}`);
		}
	});

	it("safely encodes a description containing embedded newlines (e.g. from a YAML | block scalar)", () => {
		const entry = fileEntry({ description: "line one\nline two\nline three" });
		const out = prependFrontmatter("body", entry, PLACEHOLDERS);
		const parsed = extractFrontmatter(out);
		assert.equal(parsed.description, "line one\nline two\nline three");
	});

	it("safely encodes a description containing double quotes", () => {
		const entry = fileEntry({ description: 'Says "hi" to the reader' });
		const out = prependFrontmatter("body", entry, PLACEHOLDERS);
		const parsed = extractFrontmatter(out);
		assert.equal(parsed.description, 'Says "hi" to the reader');
	});

	it("keeps the body immediately after the frontmatter closing marker", () => {
		const entry = fileEntry({ title: "Has: colon" });
		const out = prependFrontmatter("body content", entry, PLACEHOLDERS);
		assert.ok(out.endsWith("---\nbody content"), `unexpected output:\n${out}`);
	});

	it("does not soft-wrap long descriptions (lineWidth disabled)", () => {
		const longWord = "word ".repeat(100).trimEnd();
		const entry = fileEntry({ description: longWord });
		const out = prependFrontmatter("body", entry, PLACEHOLDERS);
		const parsed = extractFrontmatter(out);
		assert.equal(parsed.description, longWord);
	});
});

// ---------------------------------------------------------------------------
// transformContent — full per-file pipeline
// ---------------------------------------------------------------------------

describe("transformContent", () => {
	it("applies common, then file-specific, then link rewrites, then frontmatter", () => {
		const common: Transformation[] = [
			// Strip the leading heading; the frontmatter title replaces it.
			{
				type: "replace-regex",
				find: "^# [^\\n]*\\n",
				replace: "",
				flags: ["multiline"],
			},
		];
		const entry = fileEntry({
			transformations: [
				{
					type: "prepend",
					content: "Intro paragraph.\n\n",
				},
			],
		});
		const input = "# Big Title\n[home](./README.md#top) and [conf](configuration.md)";
		const out = transformContent(input, entry, common, PLACEHOLDERS);
		assert.equal(
			out,
			[
				"---",
				"title: Test Title",
				"description: Test description.",
				`lastUpdated: ${FIXED_TIMESTAMP}`,
				"---",
				"Intro paragraph.",
				"",
				"[home](overview#top) and [conf](configuration)",
			].join("\n"),
		);
	});

	it("calls the log callback for each applied transformation", () => {
		const logs: string[] = [];
		transformContent(
			"body",
			fileEntry({
				source: "README.md",
				transformations: [{ type: "prepend", content: "X\n", description: "add X" }],
			}),
			[{ type: "prepend", content: "Y\n", description: "add Y" }],
			PLACEHOLDERS,
			(m) => logs.push(m),
		);
		assert.deepEqual(logs, ["[README.md] applied (common): add Y", "[README.md] applied: add X"]);
	});

	it("propagates errors from required transformations", () => {
		assert.throws(
			() =>
				transformContent(
					"body",
					fileEntry({
						transformations: [{ type: "replace-regex", find: "zzz", replace: "y" }],
					}),
					[],
					PLACEHOLDERS,
				),
			/matched nothing/,
		);
	});
});

// ---------------------------------------------------------------------------
// parseConfig
// ---------------------------------------------------------------------------

describe("parseConfig", () => {
	it("parses a minimal valid config", () => {
		const yaml = `
files:
  - source: README.md
    target: out.md
    title: T
    description: D
`;
		const cfg = parseConfig(yaml);
		assert.equal(cfg.files.length, 1);
		assert.equal(cfg.files[0]?.source, "README.md");
		assert.deepEqual(cfg.common, []);
	});

	it("parses common and file-specific transformations", () => {
		const yaml = `
common:
  - type: prepend
    content: "hello\\n"
files:
  - source: README.md
    target: out.md
    title: T
    description: D
    transformations:
      - type: replace-regex
        find: a
        replace: b
        flags: [multiline]
        required: false
      - type: remove-line
        line: DROP
`;
		const cfg = parseConfig(yaml);
		assert.equal(cfg.common.length, 1);
		assert.equal(cfg.common[0]?.type, "prepend");
		assert.equal(cfg.files[0]?.transformations?.length, 2);
		const t0 = cfg.files[0]?.transformations?.[0];
		assert.ok(t0 && t0.type === "replace-regex");
		assert.deepEqual(t0.flags, ["multiline"]);
		assert.equal(t0.required, false);
	});

	it("allows an empty replace string", () => {
		const yaml = `
files:
  - source: README.md
    target: out.md
    title: T
    description: D
    transformations:
      - type: replace-regex
        find: "^#"
        replace: ""
`;
		const cfg = parseConfig(yaml);
		const t = cfg.files[0]?.transformations?.[0];
		assert.ok(t && t.type === "replace-regex");
		assert.equal(t.replace, "");
	});

	it("rejects a top-level array", () => {
		assert.throws(() => parseConfig("- foo\n- bar\n"), /must contain a top-level mapping/);
	});

	it("rejects an empty files list", () => {
		assert.throws(
			() => parseConfig("files: []\n"),
			/'files' in transformations.yaml must be a non-empty list/,
		);
	});

	it("rejects a common list that isn't a list", () => {
		assert.throws(
			() =>
				parseConfig(
					"common: nope\nfiles:\n  - source: a\n    target: b\n    title: t\n    description: d\n",
				),
			/'common' in transformations.yaml must be a list/,
		);
	});

	it("rejects a file entry missing required fields", () => {
		assert.throws(
			() => parseConfig("files:\n  - source: README.md\n    target: out.md\n    title: T\n"),
			/files\[0\]\.description/,
		);
	});

	it("rejects an unknown transformation type", () => {
		const yaml = `
files:
  - source: a
    target: b
    title: t
    description: d
    transformations:
      - type: teleport
        content: hi
`;
		assert.throws(() => parseConfig(yaml), /unknown transformation type "teleport"/);
	});

	it("rejects a replace-regex missing 'find'", () => {
		const yaml = `
files:
  - source: a
    target: b
    title: t
    description: d
    transformations:
      - type: replace-regex
        replace: hi
`;
		assert.throws(() => parseConfig(yaml), /files\[0\]\.transformations\[0\]\.find/);
	});

	it("rejects a remove-line missing 'line'", () => {
		const yaml = `
files:
  - source: a
    target: b
    title: t
    description: d
    transformations:
      - type: remove-line
`;
		assert.throws(() => parseConfig(yaml), /files\[0\]\.transformations\[0\]\.line/);
	});

	it("rejects a flags value that isn't a list of strings", () => {
		const yaml = `
files:
  - source: a
    target: b
    title: t
    description: d
    transformations:
      - type: replace-regex
        find: x
        replace: y
        flags: multiline
`;
		assert.throws(() => parseConfig(yaml), /flags must be a list of strings/);
	});
});
