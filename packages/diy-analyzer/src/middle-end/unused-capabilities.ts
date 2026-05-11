import type { ModuleLoader } from "../frontend/module-loader.ts";
import type { ModuleInfo } from "../frontend/types.ts";
import { buildMiddleEndArena } from "./arena.ts";
import { resolveCapabilityIds } from "./capabilities.ts";
import { analyzeRequiredCapabilities } from "./required-capabilities.ts";
import type {
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyUnusedCapabilityFinding,
} from "./types.ts";

type UnusedCapabilityResult = {
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

function formatCapabilityIdsForNote(ids: readonly string[]): string {
	return ids.map((id) => `\`${id}\``).join(", ");
}

export function analyzeUnusedCapabilities(
	loader: ModuleLoader,
	modules: readonly ModuleInfo[],
): UnusedCapabilityResult {
	const findings: DiyUnusedCapabilityFinding[] = [];
	const unsupported: DiyAnalyzerUnsupported[] = [];
	const violations: DiyAnalyzerViolation[] = [];
	const arena = buildMiddleEndArena(loader, modules);
	const requiredCapabilities = analyzeRequiredCapabilities(arena);
	unsupported.push(...requiredCapabilities.unsupported);
	for (const moduleInfo of arena.modules) {
		if (!moduleInfo.reportable) {
			continue;
		}
		for (const functionIndex of moduleInfo.functions) {
			const functionInfo = arena.functions[functionIndex];
			if (functionInfo == null) {
				continue;
			}
			for (const check of functionInfo.provideChecks) {
				const extra = resolveCapabilityIds(loader, moduleInfo, check.extraType, []);
				if (extra.reasons.length > 0) {
					for (const reason of extra.reasons) {
						unsupported.push({
							column: check.column,
							filePath: functionInfo.filePath,
							functionName: functionInfo.name,
							line: check.line,
							notes: [
								{
									kind: "help",
									message:
										'use a resolvable `Capability<"id", ...>` type or union for the `capabilities.provide<...>` extra capability type',
								},
							],
							reason: `capabilities.provide extra capability type: ${reason}`,
						});
					}
					continue;
				}
				const overlapping = Array.from(extra.ids)
					.filter((id) => functionInfo.declared.has(id))
					.sort();
				if (overlapping.length > 0) {
					const verb = overlapping.length === 1 ? "is" : "are";
					violations.push({
						capabilityIds: overlapping,
						column: check.column,
						filePath: functionInfo.filePath,
						functionName: functionInfo.name,
						line: check.line,
						name: "redundant capability provider",
						notes: [
							{
								kind: "note",
								message:
									`${formatCapabilityIdsForNote(overlapping)} ${verb} already allowed by this function's ` +
									"`capabilities` parameter",
							},
							{
								kind: "help",
								message:
									"use `capabilities.override(...)` when replacing an existing capability is intentional",
							},
						],
						reason: "capabilities.provide adds capabilities already present on capabilities",
					});
				}
			}
			if (requiredCapabilities.unsupportedFunctionIndices.has(functionInfo.index)) {
				continue;
			}
			const required = requiredCapabilities.requiredByFunction[functionInfo.index];
			if (required == null) {
				continue;
			}
			const unused = Array.from(functionInfo.declared)
				.filter((id) => !required.has(id))
				.sort();
			if (unused.length === 0) {
				continue;
			}
			findings.push({
				column: functionInfo.column,
				declared: Array.from(functionInfo.declared).sort(),
				direct: Array.from(functionInfo.direct).sort(),
				filePath: functionInfo.filePath,
				functionName: functionInfo.name,
				line: functionInfo.line,
				transitive: Array.from(required).sort(),
				unused,
			});
		}
	}
	return { findings, unsupported, violations };
}
