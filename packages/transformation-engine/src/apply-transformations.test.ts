// SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { checkAllDocsCovered, run } from "./apply-transformations.ts";
import type { FileEntry } from "./transformations.ts";

// ---------------------------------------------------------------------------
// Filesystem test harness
// ---------------------------------------------------------------------------

let workDir: string;

beforeEach(() => {
	workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-docs-test-"));
});

afterEach(() => {
	fs.rmSync(workDir, { recursive: true, force: true });
});

function write(relPath: string, content: string): string {
	const abs = path.join(workDir, relPath);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, content);
	return abs;
}

function fileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		source: "README.md",
		target: "out.md",
		title: "Test Title",
		description: "Test description.",
		...overrides,
	};
}

const FIXED_NOW = new Date("2026-04-20T05:00:00.123Z");
const FIXED_TIMESTAMP = "2026-04-20T05:00:00.123Z";

// ---------------------------------------------------------------------------
// checkAllDocsCovered
// ---------------------------------------------------------------------------

describe("checkAllDocsCovered", () => {
	it("passes when every *.md file under docs/ is declared", () => {
		fs.mkdirSync(path.join(workDir, "docs"));
		fs.writeFileSync(path.join(workDir, "docs/a.md"), "");
		fs.writeFileSync(path.join(workDir, "docs/b.md"), "");
		const files: FileEntry[] = [
			fileEntry({ source: "docs/a.md" }),
			fileEntry({ source: "docs/b.md" }),
		];
		assert.doesNotThrow(() => checkAllDocsCovered(workDir, files));
	});

	it("throws listing all undeclared *.md files under docs/", () => {
		fs.mkdirSync(path.join(workDir, "docs"));
		fs.writeFileSync(path.join(workDir, "docs/a.md"), "");
		fs.writeFileSync(path.join(workDir, "docs/b.md"), "");
		fs.writeFileSync(path.join(workDir, "docs/c.md"), "");
		const files: FileEntry[] = [fileEntry({ source: "docs/b.md" })];
		assert.throws(
			() => checkAllDocsCovered(workDir, files),
			/not declared in transformations\.yaml: docs\/a\.md, docs\/c\.md/,
		);
	});

	it("ignores non-md files under docs/", () => {
		fs.mkdirSync(path.join(workDir, "docs"));
		fs.writeFileSync(path.join(workDir, "docs/a.md"), "");
		fs.writeFileSync(path.join(workDir, "docs/image.png"), "");
		const files: FileEntry[] = [fileEntry({ source: "docs/a.md" })];
		assert.doesNotThrow(() => checkAllDocsCovered(workDir, files));
	});

	it("ignores dotfiles under docs/ (e.g. .docs-structure.md)", () => {
		fs.mkdirSync(path.join(workDir, "docs"));
		fs.writeFileSync(path.join(workDir, "docs/a.md"), "");
		fs.writeFileSync(path.join(workDir, "docs/.docs-structure.md"), "");
		const files: FileEntry[] = [fileEntry({ source: "docs/a.md" })];
		assert.doesNotThrow(() => checkAllDocsCovered(workDir, files));
	});

	it("skips the check when the source repo has no docs/ directory", () => {
		const files: FileEntry[] = [fileEntry({ source: "README.md" })];
		assert.doesNotThrow(() => checkAllDocsCovered(workDir, files));
	});
});

// ---------------------------------------------------------------------------
// run — full pipeline through filesystem
// ---------------------------------------------------------------------------

describe("run", () => {
	it("transforms README.md and writes it to the output directory", () => {
		write("README.md", "# Big Title\n\nHello world.\n");
		const yamlPath = write(
			"transformations.yaml",
			`
common:
  - description: strip top-level heading
    type: replace-regex
    find: "^# [^\\n]*\\n"
    replace: ""
    flags: [multiline]
files:
  - source: README.md
    target: dash0/foo/manage-x-as-code.md
    title: Manage X as Code
    description: Do X the declarative way.
`,
		);
		const outDir = path.join(workDir, "out");

		run(workDir, yamlPath, outDir, { now: FIXED_NOW, log: () => {} });

		const outFile = path.join(outDir, "dash0/foo/manage-x-as-code.md");
		const content = fs.readFileSync(outFile, "utf-8");
		assert.equal(
			content,
			[
				"---",
				"title: Manage X as Code",
				"description: Do X the declarative way.",
				`lastUpdated: ${FIXED_TIMESTAMP}`,
				"---",
				"Hello world.",
				"",
			].join("\n"),
		);
	});

	it("creates nested output directories as needed", () => {
		write("README.md", "body\n");
		const yamlPath = write(
			"transformations.yaml",
			`
files:
  - source: README.md
    target: a/b/c/deep.md
    title: T
    description: D
`,
		);
		const outDir = path.join(workDir, "out");
		run(workDir, yamlPath, outDir, { now: FIXED_NOW, log: () => {} });
		assert.ok(fs.existsSync(path.join(outDir, "a/b/c/deep.md")));
	});

	it("processes multiple files in order", () => {
		write("README.md", "readme body\n");
		write("docs/one.md", "one body\n");
		write("docs/two.md", "two body\n");
		const yamlPath = write(
			"transformations.yaml",
			`
files:
  - source: README.md
    target: overview.md
    title: Overview
    description: The overview.
  - source: docs/one.md
    target: one.md
    title: One
    description: The one.
  - source: docs/two.md
    target: two.md
    title: Two
    description: The two.
`,
		);
		const outDir = path.join(workDir, "out");
		run(workDir, yamlPath, outDir, { now: FIXED_NOW, log: () => {} });
		assert.ok(fs.existsSync(path.join(outDir, "overview.md")));
		assert.ok(fs.existsSync(path.join(outDir, "one.md")));
		assert.ok(fs.existsSync(path.join(outDir, "two.md")));
	});

	it("fails when the transformations.yaml misses a *.md file under docs/", () => {
		write("README.md", "body");
		write("docs/covered.md", "body");
		write("docs/uncovered.md", "body");
		const yamlPath = write(
			"transformations.yaml",
			`
files:
  - source: docs/covered.md
    target: covered.md
    title: T
    description: D
`,
		);
		assert.throws(
			() => run(workDir, yamlPath, path.join(workDir, "out"), { now: FIXED_NOW, log: () => {} }),
			/docs\/uncovered\.md/,
		);
	});

	it("propagates errors from a required transformation that matches nothing", () => {
		write("README.md", "just text\n");
		const yamlPath = write(
			"transformations.yaml",
			`
files:
  - source: README.md
    target: out.md
    title: T
    description: D
    transformations:
      - type: replace-regex
        find: not-here
        replace: x
`,
		);
		assert.throws(
			() => run(workDir, yamlPath, path.join(workDir, "out"), { now: FIXED_NOW, log: () => {} }),
			/matched nothing/,
		);
	});

	it("uses the injected `now` for the lastUpdated frontmatter field", () => {
		write("README.md", "body\n");
		const yamlPath = write(
			"transformations.yaml",
			`
files:
  - source: README.md
    target: out.md
    title: T
    description: D
`,
		);
		const custom = new Date("2000-01-01T00:00:00.000Z");
		run(workDir, yamlPath, path.join(workDir, "out"), { now: custom, log: () => {} });
		const content = fs.readFileSync(path.join(workDir, "out/out.md"), "utf-8");
		assert.match(content, /^lastUpdated: 2000-01-01T00:00:00\.000Z$/m);
	});

	it("emits log messages for each applied transformation via the log callback", () => {
		write("README.md", "body\n");
		const yamlPath = write(
			"transformations.yaml",
			`
common:
  - description: keep-body
    type: prepend
    content: "H\\n"
files:
  - source: README.md
    target: out.md
    title: T
    description: D
    transformations:
      - description: file-specific
        type: prepend
        content: "F\\n"
`,
		);
		const logs: string[] = [];
		run(workDir, yamlPath, path.join(workDir, "out"), {
			now: FIXED_NOW,
			log: (m) => logs.push(m),
		});
		assert.deepEqual(logs, [
			"[README.md] applied (common): keep-body",
			"[README.md] applied: file-specific",
			`[README.md] wrote transformed document to ${path.join(workDir, "out/out.md")}`,
		]);
	});
});

// ---------------------------------------------------------------------------
// End-to-end scenario mirroring the otel-cicd-action transformations
// ---------------------------------------------------------------------------

describe("run — end-to-end scenario", () => {
	it("mirrors the otel-cicd-action sync from README to a docs page", () => {
		write(
			"README.md",
			[
				"# Dash0 GitHub Action",
				"",
				"> **📢 Deprecation notice**",
				"> This action was renamed; the old name will redirect.",
				"",
				"This action exports CI/CD workflows to OpenTelemetry.",
				"",
				"See [issues](https://github.com/dash0hq/otel-cicd-action/issues) if you hit a bug.",
				"",
				"Also [config](docs/config.md) covers the details.",
				"",
			].join("\n"),
		);

		const yamlPath = write(
			"transformations.yaml",
			`
common:
  - description: remove deprecation blockquote
    type: replace-regex
    find: '(?s)^>\\s*\\*\\*📢.*?redirect.*?\\n\\n'
    replace: ""
    flags: [multiline, dotall]
    required: false
  - description: strip top-level heading
    type: replace-regex
    find: '^\\#\\s+[^\\n]*\\n'
    replace: ""
    flags: [multiline]

files:
  - source: README.md
    target: dash0/miscellaneous/manage-as-code/manage-cicd-observability-as-code.md
    title: Manage CI/CD Observability as Code
    description: Add OpenTelemetry to your CI/CD pipelines.
    transformations:
      - description: add intro
        type: prepend
        content: |
          This GitHub Action instruments CI/CD pipelines with OpenTelemetry.
      - description: rewrite relative links to absolute GitHub URLs
        type: replace-regex
        find: '\\[([^\\]]+)\\]\\((?!https?://|/)([^)]+)\\)'
        replace: '[\\1](https://github.com/dash0hq/otel-cicd-action/blob/main/\\2)'
        required: false
      - description: update issue references
        type: replace-regex
        find: 'https://github\\.com/dash0hq/otel-cicd-action/issues'
        replace: 'https://github.com/dash0hq/otel-cicd-action/issues (or [contact support](https://www.dash0.com/support))'
        required: false
`,
		);

		const outDir = path.join(workDir, "out");
		run(workDir, yamlPath, outDir, { now: FIXED_NOW, log: () => {} });

		const outFile = path.join(
			outDir,
			"dash0/miscellaneous/manage-as-code/manage-cicd-observability-as-code.md",
		);
		const content = fs.readFileSync(outFile, "utf-8");

		// Frontmatter present.
		assert.match(content, /^---\n/);
		assert.match(content, /^title: Manage CI\/CD Observability as Code$/m);
		assert.match(content, new RegExp(`^lastUpdated: ${FIXED_TIMESTAMP}$`, "m"));

		// Deprecation blockquote gone.
		assert.doesNotMatch(content, /Deprecation notice/);

		// Top-level heading gone.
		assert.doesNotMatch(content, /^# Dash0 GitHub Action/m);

		// Intro added.
		assert.match(content, /This GitHub Action instruments CI\/CD pipelines with OpenTelemetry\./);

		// Issue reference augmented with the support link.
		assert.match(content, /contact support/);

		// Relative link rewritten to absolute GitHub URL, then had docs/ link rewriting apply after.
		// The transformations first make docs/config.md into an absolute URL, so the docs-dir
		// rewrite ignores it (correct behaviour).
		assert.match(
			content,
			/\[config\]\(https:\/\/github\.com\/dash0hq\/otel-cicd-action\/blob\/main\/docs\/config\.md\)/,
		);
	});
});
