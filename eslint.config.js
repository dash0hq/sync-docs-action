// SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
// SPDX-License-Identifier: Apache-2.0

// Flat config for ESLint 9+. See https://eslint.org/docs/latest/use/configure/configuration-files
// The order matters: later entries override earlier ones.
//   1. Global ignores (must be the first entry with only `ignores`).
//   2. Recommended TypeScript rules.
//   3. Repo-specific overrides.
//   4. `eslint-config-prettier` last — turns off any rules that would fight Prettier.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
	{
		ignores: ["**/node_modules/**", "**/dist/**", "**/.pnpm-store/**", "pnpm-lock.yaml"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: {
				console: "readonly",
				process: "readonly",
			},
		},
		rules: {
			// The engine is a small, self-contained CLI; unused vars almost always indicate a bug or
			// a leftover. Prefix with `_` to intentionally silence.
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			// The transformation engine handles YAML-parsed data (`unknown`). Allow explicit `any`
			// nowhere — force callers to narrow through validators.
			"@typescript-eslint/no-explicit-any": "error",
		},
	},
	{
		// Test files exercise error paths and construct malformed inputs on purpose; loosen a few
		// rules that would otherwise complain about intentionally weird test fixtures.
		files: ["**/*.test.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	prettier,
);
