// SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { PLACEHOLDER } from "./index.ts";

describe("@dash0hq/docs-invariants (scaffold)", () => {
	// This suite exists so the CI test job has something to run against the scaffold package. Real
	// tests will land alongside the actual API in the follow-up PR that implements the invariants.
	it("exports the scaffold sentinel", () => {
		assert.equal(PLACEHOLDER, "scaffold");
	});
});
