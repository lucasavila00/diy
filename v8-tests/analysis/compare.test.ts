import { describe, expect, it } from "vitest";

import { compareStrings } from "../../packages/diy-analyzer/src/shared/compare.ts";

describe("compareStrings", () => {
	it("orders by UTF-16 code unit, not by locale collation", () => {
		expect(["ä.ts", "z.ts", "a.ts", "B.ts"].sort(compareStrings)).toEqual([
			"B.ts",
			"a.ts",
			"z.ts",
			"ä.ts",
		]);
	});

	it("returns 0 for equal strings", () => {
		expect(compareStrings("a", "a")).toBe(0);
	});
});
