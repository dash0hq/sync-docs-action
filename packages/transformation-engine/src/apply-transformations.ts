#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Apply the transformations declared in transformations.yaml to a source repository's documentation
 * files, writing the results into an output directory. Used by the sync-docs composite action to
 * adapt documentation from a source repository (README.md and, optionally, topic files under
 * docs/) into pages ready to drop into the dash0-website documentation.
 *
 * The transformation declarations themselves live in the caller's transformations.yaml, which is
 * the first-class source of truth for how the docs are modified. This script only knows how to
 * apply them; the pure logic sits in `transformations.ts`.
 *
 * Usage:
 *   apply-transformations.ts <source-root> <transformations.yaml> <output-dir>
 *
 *   source-root           Directory containing the source docs; the `source` paths in
 *                         transformations.yaml are resolved relative to it.
 *   transformations.yaml  The transformation declarations.
 *   output-dir            Directory the transformed files are written into (created if necessary),
 *                         using each entry's `target` path.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
	buildPlaceholders,
	parseConfig,
	transformContent,
	type Config,
	type FileEntry,
} from "./transformations.ts";

export function run(
	sourceRoot: string,
	transformationsPath: string,
	outputDir: string,
	options: {
		now?: Date;
		log?: (message: string) => void;
	} = {},
): void {
	const log = options.log ?? ((msg: string) => console.log(msg));

	const yamlText = fs.readFileSync(transformationsPath, "utf-8");
	const config = parseConfig(yamlText);

	checkAllDocsCovered(sourceRoot, config.files);

	const placeholders = buildPlaceholders(options.now);

	for (const fileEntry of config.files) {
		processFile(fileEntry, config, sourceRoot, outputDir, placeholders, log);
	}
}

/**
 * Fail if a `*.md` file directly under `<sourceRoot>/docs` is not declared in `files`. Guards
 * against new topic files being silently omitted from the sync. Dotfiles (e.g.
 * `.docs-structure.md`) are intentionally ignored, as they are documentation metadata rather than
 * pages. For repositories without a docs/ directory, this check is skipped.
 */
export function checkAllDocsCovered(sourceRoot: string, files: FileEntry[]): void {
	const docsDir = path.join(sourceRoot, "docs");
	let entries: string[];
	try {
		const stat = fs.statSync(docsDir);
		if (!stat.isDirectory()) return;
		entries = fs.readdirSync(docsDir);
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
		throw err;
	}

	const declared = new Set(files.map((entry) => entry.source));
	const missing: string[] = [];
	for (const name of entries.sort()) {
		if (!name.endsWith(".md")) continue;
		if (name.startsWith(".")) continue;
		const source = `docs/${name}`;
		if (!declared.has(source)) missing.push(source);
	}

	if (missing.length > 0) {
		throw new Error(
			`these docs files are not declared in transformations.yaml: ${missing.join(", ")}`,
		);
	}
}

function processFile(
	fileEntry: FileEntry,
	config: Config,
	sourceRoot: string,
	outputDir: string,
	placeholders: ReturnType<typeof buildPlaceholders>,
	log: (message: string) => void,
): void {
	const sourcePath = path.join(sourceRoot, fileEntry.source);
	const content = fs.readFileSync(sourcePath, "utf-8");

	const transformed = transformContent(content, fileEntry, config.common, placeholders, log);

	const outputPath = path.join(outputDir, fileEntry.target);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, transformed);
	log(`[${fileEntry.source}] wrote transformed document to ${outputPath}`);
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function isMain(): boolean {
	const entry = process.argv[1];
	if (!entry) return false;
	return import.meta.url === pathToFileURL(entry).href;
}

if (isMain()) {
	const [, , sourceRoot, transformationsPath, outputDir] = process.argv;
	if (!sourceRoot || !transformationsPath || !outputDir) {
		const self = fileURLToPath(import.meta.url);
		console.error(`usage: ${self} <source-root> <transformations.yaml> <output-dir>`);
		process.exit(2);
	}
	try {
		run(sourceRoot, transformationsPath, outputDir);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`error: ${message}`);
		process.exit(1);
	}
}
