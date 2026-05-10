import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { formatDiyAnalysis } from "../src/backend/format.ts";
import { analyzePackageSource } from "./helpers.ts";

function snapshotPath(name: string): string {
	return fileURLToPath(new URL(`./__snapshots__/syntax-rules/${name}.txt`, import.meta.url));
}

function formatPackageSourceResult(
	result: Awaited<ReturnType<typeof analyzePackageSource>>,
): string {
	return formatDiyAnalysis(result.analysis, result);
}

function assertNoErrors(result: Awaited<ReturnType<typeof analyzePackageSource>>): void {
	expect(formatPackageSourceResult(result)).toBe("");
}

async function assertHasError(
	result: Awaited<ReturnType<typeof analyzePackageSource>>,
	name: string,
): Promise<void> {
	const output = formatPackageSourceResult(result);
	expect(output).not.toBe("");
	await expect(output).toMatchFileSnapshot(snapshotPath(name));
}

describe("analyzeDiy syntax rules", () => {
	it("allows valid DIY parameter shapes and direct service usage", async () => {
		const result = await analyzePackageSource(`
type FinanceModelCapability = FsCapability | ClockCapability | ModelRootCapability;

export function narrow(capabilities: Capabilities<FsCapability>, path: string): void {
	const fs = capabilities.need("core.fs");
	use(fs);
	use(path);
}

export function union(capabilities: Capabilities<ClockCapability>): void {
	const clock = capabilities.need("core.clock");
	use(clock);
}

export function aggregate(capabilities: Capabilities<ModelRootCapability>): void {
	const modelRootDir = capabilities.need("finance-model.modelRootDir");
	use(modelRootDir);
}
`);

		assertNoErrors(result);
	});

	it("reports invalid DIY capabilities parameters", async () => {
		const result = await analyzePackageSource(`
declare const defaultCapabilities: Capabilities<FsCapability>;

export function renamed(svc: Capabilities<FsCapability>): void {
	use(svc);
}

export function second(path: string, capabilities: Capabilities<FsCapability>): void {
	use(path);
	use(capabilities);
}

export function defaulted(capabilities: Capabilities<FsCapability> = defaultCapabilities): void {
	use(capabilities);
}

export function untyped(capabilities: unknown): void {
	use(capabilities);
}
`);

		await assertHasError(result, "invalid-capabilities-parameters");
	});

	it("reports dynamic or indirect capability method calls", async () => {
		const result = await analyzePackageSource(`
export function bad(capabilities: Capabilities<FsCapability>, id: string): void {
	use(capabilities.need(id));
	use(capabilities.need(\`core.\${id}\`));
	use(capabilities["need"]("core.fs"));
	use(capabilities["provide"]({ "core.clock": {} }));
	use(capabilities.override?.({ "core.fs": {} }));
}
`);

		await assertHasError(result, "dynamic-capability-method-calls");
	});

	it("reports escaped capabilities values", async () => {
		const result = await analyzePackageSource(`
let moduleCapabilities: unknown;

declare function child(input: string, capabilities: Capabilities<FsCapability>): void;
declare const ServiceBox: { new (capabilities: Capabilities<FsCapability>): unknown };

export function bad(capabilities: Capabilities<FsCapability>, input: string): unknown {
	const local = capabilities;
	const box = { capabilities };
	const list = [capabilities];
	moduleCapabilities = capabilities;
	child(input, capabilities);
	use(new ServiceBox(capabilities));
	use(capabilities.logger);
	use(local);
	use(box);
	use(list);
	use(moduleCapabilities);
	return capabilities;
}
`);

		await assertHasError(result, "escaped-capabilities-values");
	});

	it("allows first-argument forwarding from nested functions", async () => {
		const result = await analyzePackageSource(`
declare function queueMicrotask(callback: () => void): void;

function child(capabilities: Capabilities<FsCapability>): void {
	use(capabilities.need("core.fs"));
}

export function good(capabilities: Capabilities<FsCapability>): void {
	queueMicrotask(() => child(capabilities));
	queueMicrotask(() => {
		use(capabilities.need("core.fs"));
	});
}
`);

		assertNoErrors(result);
	});

	it("reports aliasing capability methods", async () => {
		const result = await analyzePackageSource(`
export function bad(capabilities: Capabilities<FsCapability>): void {
	const direct = capabilities.need;
	const { provide: provideCapabilities, need, override } = capabilities;
	let rebound = direct;
	rebound = capabilities.need;
	rebound = capabilities.provide;
	rebound = capabilities.override;
	use(capabilities.need);
	use(capabilities.provide);
	use(capabilities.override);
	use(provideCapabilities);
	use(need);
	use(override);
}

export function returns(capabilities: Capabilities<FsCapability>) {
	return capabilities.override;
}
`);

		await assertHasError(result, "capability-method-aliasing");
	});
});
