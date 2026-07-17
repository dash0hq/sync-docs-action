// SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure transformation logic for the sync-docs action. All functions in this module are I/O-free so
 * that the pipeline can be exercised end-to-end from tests without touching the filesystem. The
 * side-effecting orchestration (reading the YAML file, walking the source tree, writing the outputs)
 * lives in `apply-transformations.ts`.
 */

import { parse as parseYaml, stringify as yamlStringify } from "yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrependTransformation {
	type: "prepend";
	content: string;
	description?: string;
	required?: boolean; // Ignored for prepend (always applies), accepted for schema symmetry.
}

export interface ReplaceRegexTransformation {
	type: "replace-regex";
	find: string;
	replace: string;
	flags?: string[];
	description?: string;
	required?: boolean;
}

export interface RemoveLineTransformation {
	type: "remove-line";
	line: string;
	description?: string;
	required?: boolean;
}

export type Transformation =
	PrependTransformation | ReplaceRegexTransformation | RemoveLineTransformation;

export interface FileEntry {
	source: string;
	target: string;
	title: string;
	description: string;
	transformations?: Transformation[];
}

export interface NavConfig {
	target: string;
	order: number;
	id: string;
	parentPath?: string;
	title: string;
	/**
	 * Optional mapping from directory slug (a path segment in a file's `target`) to display title.
	 * When files land in subdirectories below the common prefix of all `target`s, those
	 * subdirectories become nested groups in the emitted nav tree. This map controls each group's
	 * displayed title; any directory slug not listed here falls back to using the slug itself.
	 */
	groupTitles?: Record<string, string>;
}

export interface NavItem {
	title: string;
	path?: string;
	children?: NavItem[];
}

export interface NavFile {
	order: number;
	id: string;
	parentPath?: string;
	items: NavItem[];
}

export interface CoverageConfig {
	/**
	 * Glob patterns (relative to the source root) selecting the documentation files that must be
	 * covered by the sync. Every file matching one of these patterns must either appear as a
	 * `files[].source` or be listed under `ignore`, otherwise the run fails.
	 */
	include: string[];
	/**
	 * Exact source-relative paths that are intentionally not synced. Listing a file here is the
	 * visible, reviewable way to exclude it from the coverage requirement.
	 */
	ignore: string[];
}

export interface Config {
	common: Transformation[];
	files: FileEntry[];
	nav?: NavConfig;
	coverage?: CoverageConfig;
}

export interface Placeholders {
	$timestamp: string;
	[key: string]: string;
}

// ---------------------------------------------------------------------------
// Configuration parsing
// ---------------------------------------------------------------------------

/**
 * Parse and validate a transformations.yaml document.
 *
 * Rejects malformed configurations early so the caller sees a clear error rather than a mysterious
 * runtime failure deep in the pipeline. The returned `Config` is normalised: `common` is always an
 * array (empty if omitted), each transformation has been checked for the fields its type requires,
 * and each file entry has a non-empty `source`, `target`, `title`, and `description`.
 */
export function parseConfig(yamlText: string): Config {
	const raw: unknown = parseYaml(yamlText);
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(
			"transformations.yaml must contain a top-level mapping with 'common' and 'files'",
		);
	}
	const obj = raw as Record<string, unknown>;

	const commonRaw = obj["common"] ?? [];
	if (!Array.isArray(commonRaw)) {
		throw new Error("'common' in transformations.yaml must be a list of transformations");
	}
	const common = commonRaw.map((t, i) => validateTransformation(t, `common[${i}]`));

	const filesRaw = obj["files"];
	if (!Array.isArray(filesRaw) || filesRaw.length === 0) {
		throw new Error("'files' in transformations.yaml must be a non-empty list of file entries");
	}
	const files: FileEntry[] = filesRaw.map((entry, i) => validateFileEntry(entry, `files[${i}]`));

	const nav = validateNavConfig(obj["nav"]);
	const coverage = validateCoverageConfig(obj["coverage"]);

	return {
		common,
		files,
		...(nav !== undefined ? { nav } : {}),
		...(coverage !== undefined ? { coverage } : {}),
	};
}

function validateCoverageConfig(raw: unknown): CoverageConfig | undefined {
	if (raw === undefined) return undefined;
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("'coverage' in transformations.yaml must be a mapping");
	}
	const obj = raw as Record<string, unknown>;

	const includeRaw = obj["include"];
	if (
		!Array.isArray(includeRaw) ||
		includeRaw.length === 0 ||
		!includeRaw.every((p) => typeof p === "string" && p.length > 0)
	) {
		throw new Error("coverage.include must be a non-empty list of glob patterns");
	}

	const ignoreRaw = obj["ignore"] ?? [];
	if (!Array.isArray(ignoreRaw) || !ignoreRaw.every((p) => typeof p === "string" && p.length > 0)) {
		throw new Error("coverage.ignore, when present, must be a list of source-relative paths");
	}

	return { include: includeRaw as string[], ignore: ignoreRaw as string[] };
}

function validateNavConfig(raw: unknown): NavConfig | undefined {
	if (raw === undefined) return undefined;
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("'nav' in transformations.yaml must be a mapping");
	}
	const obj = raw as Record<string, unknown>;
	const target = requireString(obj, "target", "nav");
	const id = requireString(obj, "id", "nav");
	const title = requireString(obj, "title", "nav");
	const orderRaw = obj["order"];
	if (typeof orderRaw !== "number" || !Number.isFinite(orderRaw)) {
		throw new Error("nav.order must be a finite number");
	}
	const parentPathRaw = obj["parentPath"];
	if (
		parentPathRaw !== undefined &&
		(typeof parentPathRaw !== "string" || parentPathRaw.length === 0)
	) {
		throw new Error("nav.parentPath, when present, must be a non-empty string");
	}
	const groupTitles = validateGroupTitles(obj["groupTitles"]);
	return {
		target,
		id,
		title,
		order: orderRaw,
		...(parentPathRaw !== undefined ? { parentPath: parentPathRaw as string } : {}),
		...(groupTitles !== undefined ? { groupTitles } : {}),
	};
}

function validateGroupTitles(raw: unknown): Record<string, string> | undefined {
	if (raw === undefined) return undefined;
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("nav.groupTitles, when present, must be a mapping of directory slug to string");
	}
	const obj = raw as Record<string, unknown>;
	const out: Record<string, string> = {};
	for (const [slug, value] of Object.entries(obj)) {
		if (typeof value !== "string" || value.length === 0) {
			throw new Error(`nav.groupTitles[${JSON.stringify(slug)}] must be a non-empty string`);
		}
		out[slug] = value;
	}
	return out;
}

function validateFileEntry(raw: unknown, path: string): FileEntry {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`${path}: file entry must be a mapping`);
	}
	const obj = raw as Record<string, unknown>;
	const source = requireString(obj, "source", path);
	const target = requireString(obj, "target", path);
	const title = requireString(obj, "title", path);
	const description = requireString(obj, "description", path);
	const transformationsRaw = obj["transformations"] ?? [];
	if (!Array.isArray(transformationsRaw)) {
		throw new Error(`${path}.transformations must be a list`);
	}
	const transformations = transformationsRaw.map((t, i) =>
		validateTransformation(t, `${path}.transformations[${i}]`),
	);
	return { source, target, title, description, transformations };
}

function validateTransformation(raw: unknown, path: string): Transformation {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error(`${path}: transformation must be a mapping`);
	}
	const obj = raw as Record<string, unknown>;
	const type = obj["type"];
	const description =
		typeof obj["description"] === "string" ? (obj["description"] as string) : undefined;
	const required = typeof obj["required"] === "boolean" ? (obj["required"] as boolean) : undefined;

	if (type === "prepend") {
		return {
			type: "prepend",
			content: requireString(obj, "content", path),
			description,
			required,
		};
	}
	if (type === "replace-regex") {
		const flagsRaw = obj["flags"] ?? [];
		if (!Array.isArray(flagsRaw) || !flagsRaw.every((f) => typeof f === "string")) {
			throw new Error(`${path}.flags must be a list of strings`);
		}
		return {
			type: "replace-regex",
			find: requireString(obj, "find", path),
			replace: requireString(obj, "replace", path, /* allowEmpty */ true),
			flags: flagsRaw as string[],
			description,
			required,
		};
	}
	if (type === "remove-line") {
		return {
			type: "remove-line",
			line: requireString(obj, "line", path),
			description,
			required,
		};
	}
	throw new Error(`${path}: unknown transformation type ${JSON.stringify(type)}`);
}

function requireString(
	obj: Record<string, unknown>,
	key: string,
	path: string,
	allowEmpty = false,
): string {
	const value = obj[key];
	if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
		throw new Error(`${path}.${key} must be a non-empty string`);
	}
	return value;
}

// ---------------------------------------------------------------------------
// Docs coverage
// ---------------------------------------------------------------------------

/**
 * Return the candidate files that are neither declared as a `files[].source` nor listed under
 * `coverage.ignore`, in sorted order.
 *
 * `candidates` is the glob-expanded list of files matching `coverage.include` (the globbing is I/O
 * and therefore lives in `apply-transformations.ts`); paths are compared literally, so the caller
 * must normalise them to `/`-separated source-relative form. A non-empty result means the sync
 * declarations have drifted behind the source docs and the run must fail — this restores the
 * guard the Python engine used to provide, where adding a docs page without a transformation
 * entry broke the workflow instead of being silently skipped.
 */
export function findUnmappedDocs(candidates: string[], config: Config): string[] {
	const covered = new Set<string>(config.files.map((f) => f.source));
	for (const ignored of config.coverage?.ignore ?? []) {
		covered.add(ignored);
	}
	return candidates.filter((candidate) => !covered.has(candidate)).sort();
}

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

/**
 * Build the placeholder values that can be referenced in inserted/replacement text.
 *
 * Currently the only supported placeholder is `$timestamp`, which renders the current UTC date/time
 * (e.g. `2026-04-20T05:00:00.123Z`). The value is computed once per run so every occurrence renders
 * identically. Pass an explicit `now` to make tests deterministic.
 */
export function buildPlaceholders(now: Date = new Date()): Placeholders {
	return { $timestamp: now.toISOString() };
}

/**
 * Substitute every occurrence of each placeholder key in `text` with its value. Uses literal string
 * matching, so keys containing regex-special characters (like `$`) are handled correctly.
 */
export function substitutePlaceholders(text: string, placeholders: Placeholders): string {
	let result = text;
	for (const [key, value] of Object.entries(placeholders)) {
		result = result.split(key).join(value);
	}
	return result;
}

// ---------------------------------------------------------------------------
// Regex compilation and Python-style replacement templates
// ---------------------------------------------------------------------------

const FLAG_NAMES: Record<string, string> = {
	multiline: "m",
	dotall: "s",
	ignorecase: "i",
};

/**
 * Compile a Python-style regex pattern into a JavaScript `RegExp`.
 *
 * Two Python-isms are handled so existing transformations.yaml files ported from the Python engine
 * work unchanged:
 *   1. Leading inline flags like `(?i)`, `(?s)`, `(?m)` (or combinations, e.g. `(?ims)`) are
 *      stripped from the pattern and folded into the RegExp flags.
 *   2. The declared flag list uses long names (`multiline`, `dotall`, `ignorecase`) rather than
 *      single-letter suffixes.
 *
 * The compiled regex always carries the `g` flag because Python's `re.sub` replaces every
 * non-overlapping match, and `String.replace(regex, …)` only does so when `g` is set.
 */
export function compileRegex(pattern: string, flagList: string[] = []): RegExp {
	const jsFlagSet = new Set<string>(["g"]);

	for (const name of flagList) {
		const short = FLAG_NAMES[name];
		if (short === undefined) {
			throw new Error(
				`unknown regex flag ${JSON.stringify(name)}; allowed flags: ${Object.keys(FLAG_NAMES).sort().join(", ")}`,
			);
		}
		jsFlagSet.add(short);
	}

	// Strip leading inline flag groups: `(?i)`, `(?ms)`, etc. Only the recognised flags are lifted;
	// anything else (e.g. `(?P<name>…)`) is left alone. `x` (verbose) mode is not supported and will
	// slip through here — if the pattern relies on it, the regex compile below will most likely
	// throw, which is the correct signal.
	let cleanPattern = pattern;
	const inlineMatch = cleanPattern.match(/^\(\?([imsx]+)\)/);
	if (inlineMatch) {
		for (const c of inlineMatch[1]!) {
			if (c === "x") {
				throw new Error(
					"verbose regex flag (?x) is not supported; rewrite the pattern without whitespace/comments",
				);
			}
			jsFlagSet.add(c);
		}
		cleanPattern = cleanPattern.slice(inlineMatch[0].length);
	}

	return new RegExp(cleanPattern, [...jsFlagSet].join(""));
}

/**
 * Expand a Python-style replacement template using a match.
 *
 * Supports these substitutions:
 *   - `\0`         → the entire match
 *   - `\1` .. `\9` → the corresponding capture group (empty string if the group did not participate)
 *   - `\\`         → a literal backslash
 *
 * Anything else after a backslash is preserved verbatim. This mirrors the behaviour of Python's
 * `re.sub` for the subset of substitutions the transformations.yaml files actually use, so callers
 * can keep writing `\1`, `\2`, etc.
 */
export function expandTemplate(
	template: string,
	match: string,
	groups: (string | undefined)[],
): string {
	let out = "";
	let i = 0;
	while (i < template.length) {
		const c = template[i];
		if (c === "\\" && i + 1 < template.length) {
			const next = template[i + 1]!;
			if (next >= "0" && next <= "9") {
				const idx = Number(next);
				out += idx === 0 ? match : (groups[idx - 1] ?? "");
				i += 2;
				continue;
			}
			if (next === "\\") {
				out += "\\";
				i += 2;
				continue;
			}
			// Unrecognised escape: preserve as-is.
			out += c + next;
			i += 2;
			continue;
		}
		out += c;
		i += 1;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Individual transformations
// ---------------------------------------------------------------------------

export function describeTransformation(transformation: Transformation, index: number): string {
	return transformation.description ?? `transformation #${index}`;
}

/**
 * Apply a single transformation to `content` and return the new content.
 *
 * Throws if a required `replace-regex` or `remove-line` transformation does not match anything —
 * this guards against the docs drifting away from the transformation declarations and a
 * modification silently becoming a no-op.
 */
export function applyTransformation(
	content: string,
	transformation: Transformation,
	index: number,
	placeholders: Placeholders,
): string {
	const description = describeTransformation(transformation, index);

	switch (transformation.type) {
		case "prepend": {
			return substitutePlaceholders(transformation.content, placeholders) + content;
		}
		case "replace-regex": {
			const regex = compileRegex(transformation.find, transformation.flags);
			const template = substitutePlaceholders(transformation.replace, placeholders);
			let count = 0;
			const replaced = content.replace(regex, (...args) => {
				count++;
				const match = args[0] as string;
				// String.replace passes: (match, group1, ..., groupN, offset, wholeString, namedGroups?)
				// Named groups object (an object, not a string) appears only if the pattern has named
				// groups. Strip trailing non-group entries defensively.
				let end = args.length - 2;
				if (typeof args[end] === "object" && args[end] !== null) {
					end -= 1;
				}
				const groups = args.slice(1, end) as (string | undefined)[];
				return expandTemplate(template, match, groups);
			});
			if (count === 0 && (transformation.required ?? true)) {
				throw new Error(`replace-regex transformation matched nothing: ${description}`);
			}
			return replaced;
		}
		case "remove-line": {
			return removeLine(content, transformation, description);
		}
	}
}

/**
 * Remove the whole line(s) containing the first occurrence of the literal marker. If the removal
 * leaves multiple consecutive empty lines behind, they are normalised to a single empty line so the
 * document does not gain gaps.
 */
export function removeLine(
	content: string,
	transformation: RemoveLineTransformation,
	description: string,
): string {
	const marker = transformation.line;
	const required = transformation.required ?? true;

	const idx = content.indexOf(marker);
	if (idx === -1) {
		if (required) {
			throw new Error(`remove-line transformation did not find 'line' marker: ${description}`);
		}
		return content;
	}

	// Expand the removal span to whole lines: back to the start of the line containing the marker,
	// forward to just past the newline where the marker ends.
	const lineStart = content.lastIndexOf("\n", idx - 1) + 1;
	const nextNewline = content.indexOf("\n", idx + marker.length);
	const lineEnd = nextNewline === -1 ? content.length : nextNewline + 1;

	const result = content.slice(0, lineStart) + content.slice(lineEnd);
	// Collapse runs of three-or-more consecutive newlines down to two (one blank line).
	return result.replace(/\n{3,}/g, "\n\n");
}

/**
 * Apply a sequence of transformations in order. Returned value is the fully transformed content.
 */
export function applyTransformations(
	content: string,
	transformations: Transformation[],
	placeholders: Placeholders,
): string {
	let result = content;
	transformations.forEach((transformation, i) => {
		result = applyTransformation(result, transformation, i + 1, placeholders);
	});
	return result;
}

// ---------------------------------------------------------------------------
// Automatic link rewrites
// ---------------------------------------------------------------------------

const README_LINK_PATTERN = /\]\(((?:\.{1,2}\/)*)README\.md((?:#|\?)[^)]*)?\)/g;

/**
 * Rewrite relative markdown links that point at the source README (`README.md`, `./README.md`,
 * `../README.md`) so they point at a same-directory `overview` sibling. The `.md` suffix is dropped
 * because the website serves pages under extensionless URLs. Any anchor or query is preserved.
 * Absolute URLs (`https://…/README.md`) are not affected.
 */
export function rewriteReadmeLinks(content: string): string {
	return content.replace(README_LINK_PATTERN, (_m, _prefix, tail: string | undefined) => {
		return `](overview${tail ?? ""})`;
	});
}

const DOCS_DIR_LINK_PATTERN = /\]\(((?:\.{1,2}\/)*)docs\/([^)#?]*?)(?:\.md)?((?:#|\?)[^)]*)?\)/g;

/**
 * Rewrite relative markdown links into `docs/…` to same-directory sibling links. The renamed
 * README (overview) and the topic files share the same target directory, so the `docs/` segment
 * (and any `./`/`../` prefix) is dropped and the `.md` suffix removed. Absolute URLs are not
 * affected because they carry a scheme.
 */
export function rewriteDocsDirLinks(content: string): string {
	return content.replace(
		DOCS_DIR_LINK_PATTERN,
		(_m, _prefix, path: string, tail: string | undefined) => `](${path}${tail ?? ""})`,
	);
}

const INTRA_DOCS_LINK_PATTERN = /\]\((\.\/)?([^)/:?#]+)\.md((?:#|\?)[^)]*)?\)/g;

/**
 * Drop the `.md` suffix from relative same-directory markdown links between topic files. Links that
 * cross a rename boundary (`../README.md`, `docs/…`) are handled by the dedicated rewrites above;
 * absolute URLs are not matched because they contain a `:` before the `.md`.
 */
export function rewriteIntraDocsLinks(content: string): string {
	return content.replace(
		INTRA_DOCS_LINK_PATTERN,
		(_m, prefix: string | undefined, name: string, tail: string | undefined) =>
			`](${prefix ?? ""}${name}${tail ?? ""})`,
	);
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Prepend the generated frontmatter block (title, description, lastUpdated) to `content`, dropping
 * any leading blank lines that the earlier transformations may have left behind.
 *
 * The title/description/lastUpdated values are serialised through the YAML library so any value that
 * would break a naive `key: value` line (colons, hashes, leading `-`, quotes, embedded newlines from
 * a YAML `|` block scalar in transformations.yaml) is quoted or block-scalared correctly. The
 * `lineWidth: 0` option disables line-folding for long strings so a very long description remains on
 * one logical line rather than getting soft-wrapped.
 */
export function prependFrontmatter(
	content: string,
	fileEntry: FileEntry,
	placeholders: Placeholders,
): string {
	const body = yamlStringify(
		{
			title: fileEntry.title,
			description: fileEntry.description,
			lastUpdated: placeholders.$timestamp,
		},
		{ lineWidth: 0 },
	);
	return `---\n${body}---\n${content.replace(/^\n+/, "")}`;
}

// ---------------------------------------------------------------------------
// Nav.json generation
// ---------------------------------------------------------------------------

/**
 * Build a `nav.json` document from the file entries the sync produces.
 *
 * Emits a single top-level group (`items[0]`) titled `navConfig.title`. The group's `children` mirror
 * the on-disk hierarchy implied by each file's `target` path: files that share the common directory
 * prefix appear as leaves at the top of the group, and files that sit in a deeper subdirectory are
 * nested inside a group node whose title is looked up in `navConfig.groupTitles` (falling back to the
 * directory slug itself when no mapping is provided). Nesting is arbitrary — every additional
 * directory segment produces another group level.
 *
 * When every file shares the same directory (no subdirectories below the common prefix), the output
 * is a flat one-level tree that matches the v0.2.0 shape.
 *
 * File order is preserved: leaves appear in the order the files were declared, and each new group
 * is inserted at the position of the first file that references it. Each leaf's `title` comes from
 * the file entry's `title` and its `path` from the file entry's `target` (the same value used by
 * `dash0-website`'s content path resolver).
 *
 * The function is pure: it does no I/O and does not mutate its inputs. The caller is responsible for
 * serialising the result to JSON and writing it to disk.
 */
export function generateNav(navConfig: NavConfig, files: FileEntry[]): NavFile {
	const groupTitles = navConfig.groupTitles ?? {};
	const prefix = commonDirPrefix(files.map((f) => f.target));

	const rootChildren: NavItem[] = [];
	// For each in-flight `NavItem[]` (a group's `children` array, or the root array), we need a fast
	// way to find the group node already inserted for a given directory slug so a later file with the
	// same slug lands in the same group. WeakMap keeps the lookup index tied to the array identity
	// without leaking outside this function.
	const groupIndex = new WeakMap<NavItem[], Map<string, NavItem>>();
	groupIndex.set(rootChildren, new Map());

	for (const file of files) {
		const rel = stripDirPrefix(file.target, prefix);
		const segments = rel.split("/");
		let siblings = rootChildren;
		for (let i = 0; i < segments.length - 1; i++) {
			const slug = segments[i]!;
			const index = groupIndex.get(siblings)!;
			let group = index.get(slug);
			if (group === undefined) {
				group = { title: groupTitles[slug] ?? slug, children: [] };
				siblings.push(group);
				index.set(slug, group);
				groupIndex.set(group.children!, new Map());
			}
			siblings = group.children!;
		}
		siblings.push({ title: file.title, path: file.target });
	}

	const group: NavItem = { title: navConfig.title, children: rootChildren };
	return {
		order: navConfig.order,
		id: navConfig.id,
		...(navConfig.parentPath !== undefined ? { parentPath: navConfig.parentPath } : {}),
		items: [group],
	};
}

/**
 * Return the longest directory prefix (as a `"a/b/c"` string, no trailing slash) shared by every
 * target. Operates on `/`-separated segments so a partial-segment overlap (e.g. `foo-x` and `foo-y`
 * sharing `foo-`) is never treated as a common prefix. The filename segment is intentionally
 * excluded from consideration so `[a/b/x.md, a/b/y.md]` returns `"a/b"`, not the whole path.
 */
function commonDirPrefix(targets: string[]): string {
	if (targets.length === 0) return "";
	const dirsList = targets.map((t) => t.split("/").slice(0, -1));
	const minLen = Math.min(...dirsList.map((d) => d.length));
	const common: string[] = [];
	for (let i = 0; i < minLen; i++) {
		const seg = dirsList[0]![i]!;
		if (dirsList.every((d) => d[i] === seg)) {
			common.push(seg);
		} else {
			break;
		}
	}
	return common.join("/");
}

function stripDirPrefix(target: string, prefix: string): string {
	if (prefix === "") return target;
	const withSlash = prefix + "/";
	return target.startsWith(withSlash) ? target.substring(withSlash.length) : target;
}

// ---------------------------------------------------------------------------
// Full per-file pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full transformation pipeline for one file. The order is:
 *
 *   1. Common transformations (from the top-level `common` list).
 *   2. File-specific transformations (from the file entry's `transformations` list).
 *   3. Automatic link rewrites (README → overview, docs/ → sibling, `.md` suffix drop).
 *   4. Frontmatter prepended.
 *
 * Logging is delegated to the caller via the optional `log` callback, so this function stays pure
 * and easy to test.
 */
export function transformContent(
	content: string,
	fileEntry: FileEntry,
	common: Transformation[],
	placeholders: Placeholders,
	log?: (message: string) => void,
): string {
	let result = content;
	common.forEach((transformation, i) => {
		result = applyTransformation(result, transformation, i + 1, placeholders);
		log?.(
			`[${fileEntry.source}] applied (common): ${describeTransformation(transformation, i + 1)}`,
		);
	});
	(fileEntry.transformations ?? []).forEach((transformation, i) => {
		result = applyTransformation(result, transformation, i + 1, placeholders);
		log?.(`[${fileEntry.source}] applied: ${describeTransformation(transformation, i + 1)}`);
	});
	result = rewriteReadmeLinks(result);
	result = rewriteDocsDirLinks(result);
	result = rewriteIntraDocsLinks(result);
	result = prependFrontmatter(result, fileEntry, placeholders);
	return result;
}
