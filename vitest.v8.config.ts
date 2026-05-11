import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			include: ["packages/diy-analyzer/src/**/*.ts"],
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			thresholds: {
				100: true,
			},
		},
		include: ["v8-tests/**/*.test.ts"],
	},
});
