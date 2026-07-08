// SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * `@dash0hq/docs-invariants` — invariants library for dash0-website's docs tree.
 *
 * This package is a scaffold in the initial commit. The real implementation is a follow-up PR and
 * will cover the invariants that both this action and dash0-website's own CI need to enforce:
 *
 *   1. Redirect uniqueness across every shard in `redirects/*.ts` (already enforced by the aggregator
 *      in dash0-website; this package will re-implement it for consumption without depending on the
 *      website's build script).
 *   2. Redirect target validity: every value must resolve to a real page path.
 *   3. Redirect key shadowing detection: fail if a redirect key matches a real page (which would let
 *      the redirect silently hijack live traffic).
 *   4. Deletion coverage: when a sync flow removes a page, require a redirect entry that covers the
 *      dead URL, or fail the sync.
 *
 * See the repo README and CLAUDE.md for context on the split between this library, the transformation
 * engine, and the composite action.
 */

export const PLACEHOLDER = "scaffold";
