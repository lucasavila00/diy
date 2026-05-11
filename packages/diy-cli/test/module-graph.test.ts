import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyzeDiyModuleGraph } from "../src/app/module-graph.ts";
import { formatDiyModuleGraph } from "../src/backend/module-graph-format.ts";
import { createCase, writeSources } from "./helpers.ts";

const transitiveSnapshotPath = fileURLToPath(
	new URL("./__snapshots__/module-graph/transitive-chain.txt", import.meta.url),
);

const cycleSnapshotPath = fileURLToPath(
	new URL("./__snapshots__/module-graph/cycle.txt", import.meta.url),
);

async function snapshotGraph(
	sources: Readonly<Record<string, string>>,
	inputs: readonly string[],
): Promise<string> {
	const root = await createCase();
	await writeSources(root, sources);
	const graph = await analyzeDiyModuleGraph(inputs, { cwd: root });
	return formatDiyModuleGraph(graph, { cwd: root });
}

describe("DIY module graph", () => {
	it("shows transitive capability chains across modules", async () => {
		const output = await snapshotGraph(
			{
				"packages/app/src/main.ts": `
import type { AppCapability } from "./types.ts";
import { readClock } from "../../core/src/clock.ts";
import { readConfig } from "../../core/src/config.ts";
import type { Capabilities } from "../../core/src/deps.ts";

export function run(capabilities: Capabilities<AppCapability>): void {
	capabilities.need("core.fs");
	readConfig(capabilities);
	readClock(capabilities);
}
`,
				"packages/app/src/types.ts": `
import type { ClockCapability, FsCapability, LogCapability } from "../../core/src/deps.ts";

export type AppCapability = ClockCapability | FsCapability | LogCapability;
`,
				"packages/core/src/clock.ts": `
import type { Capabilities, ClockCapability } from "./deps.ts";

export function readClock(capabilities: Capabilities<ClockCapability>): void {
	capabilities.need("core.clock");
}
`,
				"packages/core/src/config.ts": `
import type { Capabilities, FsCapability } from "./deps.ts";

export function readConfig(capabilities: Capabilities<FsCapability>): void {
	capabilities.need("core.fs");
}
`,
				"packages/core/src/deps.ts": `
export type Capabilities<T> = { need(id: string): unknown };
export type Capability<Id extends string, Service> = { readonly id: Id };
export type ClockCapability = Capability<"core.clock", unknown>;
export type FsCapability = Capability<"core.fs", unknown>;
export type LogCapability = Capability<"core.log", unknown>;
`,
			},
			["packages/app/src/main.ts"],
		);

		await expect(output).toMatchFileSnapshot(transitiveSnapshotPath);
	});

	it("shows cycles without recursing forever", async () => {
		const output = await snapshotGraph(
			{
				"packages/app/src/main.ts": `
type Capabilities<T> = { need(id: string): unknown };
type Capability<Id extends string, Service> = { readonly id: Id };
type FsCapability = Capability<"core.fs", unknown>;
type ClockCapability = Capability<"core.clock", unknown>;

export function alpha(capabilities: Capabilities<FsCapability | ClockCapability>): void {
	capabilities.need("core.fs");
	beta(capabilities);
}

export function beta(capabilities: Capabilities<FsCapability | ClockCapability>): void {
	capabilities.need("core.clock");
	alpha(capabilities);
}
`,
			},
			["packages/app/src/main.ts"],
		);

		await expect(output).toMatchFileSnapshot(cycleSnapshotPath);
	});
});
