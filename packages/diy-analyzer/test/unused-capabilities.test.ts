import { describe, expect, it } from "vitest";

import { analyzeDiy } from "../src/app/analyze.ts";
import { createCase, writeSource } from "./helpers.ts";

type Analysis = Awaited<ReturnType<typeof analyzeDiy>>;

function displayPath(filePath: string): string {
	const normalized = filePath.replaceAll("\\", "/");
	if (normalized.includes("/.tmp/diy-analyzer-tests/")) {
		const srcIndex = normalized.lastIndexOf("/src/");
		return srcIndex < 0 ? normalized : normalized.slice(srcIndex + 1);
	}
	const packageIndex = normalized.lastIndexOf("/packages/");
	if (packageIndex >= 0) {
		return normalized.slice(packageIndex + 1);
	}
	const srcIndex = normalized.lastIndexOf("/src/");
	return srcIndex < 0 ? normalized : normalized.slice(srcIndex + 1);
}

function stableAnalysis(analysis: Analysis): string {
	return `${JSON.stringify(
		{
			coveredFiles: analysis.coveredFiles.map(displayPath),
			findings: analysis.findings.map((finding) => ({
				...finding,
				filePath: displayPath(finding.filePath),
			})),
			unsupported: analysis.unsupported.map((item) => ({
				...item,
				filePath: displayPath(item.filePath),
			})),
			violations: analysis.violations.map((violation) => ({
				...violation,
				filePath: displayPath(violation.filePath),
			})),
		},
		null,
		2,
	)}\n`;
}

describe("analyzeDiy unused capabilities", () => {
	it("reports directly unused capabilities", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = { need(id: string): unknown };
type Read = Capability<"read", unknown>;
type Write = Capability<"write", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };

export function load(capabilities: Capabilities<Read | Write>): void {
	capabilities.need("read");
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [
			    {
			      "column": 8,
			      "declared": [
			        "read",
			        "write"
			      ],
			      "direct": [
			        "read"
			      ],
			      "filePath": "src/sample.ts",
			      "functionName": "load",
			      "line": 7,
			      "transitive": [
			        "read"
			      ],
			      "unused": [
			        "write"
			      ]
			    }
			  ],
			  "unsupported": [],
			  "violations": []
			}
			"
		`);
	});

	it("retains capabilities required by forwarded callees", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = { need(id: string): unknown };
type Read = Capability<"read", unknown>;
type Write = Capability<"write", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };

function child(capabilities: Capabilities<Write>): void {
	capabilities.need("write");
}

export function parent(capabilities: Capabilities<Read | Write>): void {
	child(capabilities);
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [
			    {
			      "column": 8,
			      "declared": [
			        "read",
			        "write"
			      ],
			      "direct": [],
			      "filePath": "src/sample.ts",
			      "functionName": "parent",
			      "line": 11,
			      "transitive": [
			        "write"
			      ],
			      "unused": [
			        "read"
			      ]
			    }
			  ],
			  "unsupported": [],
			  "violations": []
			}
			"
		`);
	});

	it("retains capabilities required through cyclic forwarded callees", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = { need(id: string): unknown };
type Read = Capability<"read", unknown>;
type Write = Capability<"write", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };

export function alpha(capabilities: Capabilities<Read | Write>): void {
	capabilities.need("read");
	beta(capabilities);
}

export function beta(capabilities: Capabilities<Read | Write>): void {
	capabilities.need("write");
	alpha(capabilities);
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [],
			  "unsupported": [],
			  "violations": []
			}
			"
		`);
	});

	it("resolves recursive capability aliases", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = { need(id: string): unknown };
type Read = Capability<"read", unknown>;
type Write = Capability<"write", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };
type RecursiveRead = Read | RecursiveWrite;
type RecursiveWrite = Write | RecursiveRead;

export function load(capabilities: Capabilities<RecursiveRead>): void {
	capabilities.need("read");
	capabilities.need("write");
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [],
			  "unsupported": [],
			  "violations": []
			}
			"
		`);
	});

	it("expands imported aggregate aliases and Exclude", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"packages/core/src/deps.ts",
			`
export type Capability<Id extends string, Service> = { readonly id: Id };
export type FsCapability = Capability<"core.fs", unknown>;
export type ClockCapability = Capability<"core.clock", unknown>;
export type SpawnCapability = Capability<"core.spawn", unknown>;
`,
		);
		await writeSource(
			root,
			"packages/model/src/types.ts",
			`
import type { ClockCapability, FsCapability, SpawnCapability } from "@q/core/src/deps.ts";

export type ModelCapability = ClockCapability | FsCapability | SpawnCapability;
`,
		);
		await writeSource(
			root,
			"packages/app/src/main.ts",
			`
import type { Capabilities } from "@beff/diy/capabilities";
import type { SpawnCapability } from "@q/core/src/deps.ts";
import type { ModelCapability } from "@q/model/src/types.ts";

type AppCapability = Exclude<ModelCapability, SpawnCapability>;

export function run(capabilities: Capabilities<AppCapability>): void {
	capabilities.need("core.fs");
}
`,
		);

		const analysis = await analyzeDiy(["packages/app/src/main.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/main.ts"
			  ],
			  "findings": [
			    {
			      "column": 8,
			      "declared": [
			        "core.clock",
			        "core.fs"
			      ],
			      "direct": [
			        "core.fs"
			      ],
			      "filePath": "src/main.ts",
			      "functionName": "run",
			      "line": 8,
			      "transitive": [
			        "core.fs"
			      ],
			      "unused": [
			        "core.clock"
			      ]
			    }
			  ],
			  "unsupported": [],
			  "violations": []
			}
			"
		`);
	});

	it("attributes nested closure service usage to the enclosing effectful function", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = { need(id: string): unknown };
type Read = Capability<"read", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };

export function load(capabilities: Capabilities<Read>): void {
	queueMicrotask(() => {
		capabilities.need("read");
	});
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [],
			  "unsupported": [],
			  "violations": []
			}
			"
		`);
	});

	it("retains capabilities forwarded through capabilities.provide", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = {
	provide<U>(serviceMap: Record<string, unknown>): Capabilities<T | U>;
	need(id: string): unknown;
};
type Read = Capability<"read", unknown>;
type Write = Capability<"write", unknown>;
type Log = Capability<"log", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };

export function load(capabilities: Capabilities<Read | Write>): Capabilities<Read | Write | Log> {
	return capabilities.provide<Log>({ log: {} });
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [],
			  "unsupported": [],
			  "violations": []
			}
			"
		`);
	});

	it("reports capabilities.provide capabilities already present on capabilities", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = {
	provide<U>(serviceMap: Record<string, unknown>): Capabilities<T | U>;
	need(id: string): unknown;
};
type Read = Capability<"read", unknown>;
type Write = Capability<"write", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };

export function load(capabilities: Capabilities<Read | Write>): Capabilities<Read | Write> {
	return capabilities.provide<Write>({ write: {} });
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [],
			  "unsupported": [],
			  "violations": [
			    {
			      "capabilityIds": [
			        "write"
			      ],
			      "column": 9,
			      "filePath": "src/sample.ts",
			      "functionName": "load",
			      "line": 11,
			      "name": "redundant capability provider",
			      "reason": "capabilities.provide adds capabilities already present on capabilities"
			    }
			  ]
			}
			"
		`);
	});

	it("retains capabilities forwarded through capabilities.override", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = {
	need(id: string): unknown;
	override<U>(serviceMap: Record<string, unknown>): Capabilities<T>;
};
type Read = Capability<"read", unknown>;
type Write = Capability<"write", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };

function child(capabilities: Capabilities<Write>): void {
	capabilities.need("write");
}

export function load(capabilities: Capabilities<Read | Write>): void {
	child(capabilities.override<Write>({ write: {} }));
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [],
			  "unsupported": [],
			  "violations": []
			}
			"
		`);
	});

	it("reports unresolved forwarding as unsupported", async () => {
		const root = await createCase();
		await writeSource(
			root,
			"src/sample.ts",
			`
type Capabilities<T> = { need(id: string): unknown };
type Read = Capability<"read", unknown>;
type Capability<Id extends string, Service> = { readonly id: Id };

declare const registry: { run(capabilities: Capabilities<Read>): void };

export function load(capabilities: Capabilities<Read>): void {
	registry.run(capabilities);
}
`,
		);

		const analysis = await analyzeDiy(["src/sample.ts"], { cwd: root });

		expect(stableAnalysis(analysis)).toMatchInlineSnapshot(`
			"{
			  "coveredFiles": [
			    "src/sample.ts"
			  ],
			  "findings": [],
			  "unsupported": [
			    {
			      "column": 8,
			      "filePath": "src/sample.ts",
			      "functionName": "load",
			      "line": 8,
			      "reason": "unresolved capabilities forwarding callee"
			    }
			  ],
			  "violations": []
			}
			"
		`);
	});
});
