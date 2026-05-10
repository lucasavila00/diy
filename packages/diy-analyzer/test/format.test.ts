import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyzeDiy } from "../src/app/analyze.ts";
import { formatDiyAnalysis } from "../src/backend/format.ts";
import { createCase, packagePrelude, writeSource } from "./helpers.ts";

const combinedFailuresSnapshotPath = fileURLToPath(
	new URL("./__snapshots__/format/combined-failures.txt", import.meta.url),
);

describe("formatDiyAnalysis", () => {
	it("formats combined DIY rule and unused-capability failures", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"packages/alpha/src/sample.ts",
			`${packagePrelude}
type WriteCapability = Capability<"core.write", unknown>;

export function bad(capabilities: Capabilities<FsCapability | WriteCapability>, id: string): void {
	capabilities.need(id);
	capabilities.need("core.fs");
}
`,
		);

		const analysis = await analyzeDiy(["packages/alpha/src/sample.ts"], {
			cwd: root,
		});
		const output = formatDiyAnalysis(analysis, { cwd: root });

		await expect(output).toMatchFileSnapshot(combinedFailuresSnapshotPath);
	});
});
