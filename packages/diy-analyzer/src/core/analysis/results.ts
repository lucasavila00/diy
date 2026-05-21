import type {
	DiyAnalyzerNote,
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyModuleGraphFunction,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import { sorted } from "./ast-utils.ts";
import type { AnalyzedCapabilityFunction, UnsupportedAnalysisReason } from "./native-types.ts";

export function computeRequiredCapabilityIds(
	functions: readonly AnalyzedCapabilityFunction[],
): ReadonlyMap<string, ReadonlySet<string>> {
	const requiredEntries = functions.map((analyzedFunction) => ({
		analyzedFunction,
		required: new Set(analyzedFunction.directCapabilityIds),
	}));
	let changed = true;
	while (changed) {
		changed = false;
		for (const { analyzedFunction, required } of requiredEntries) {
			for (const forwarding of analyzedFunction.forwardedUses) {
				for (const id of forwarding.required) {
					if (forwarding.provided.has(id) || required.has(id)) {
						continue;
					}
					required.add(id);
					changed = true;
				}
			}
		}
	}
	return new Map(
		requiredEntries.map(({ analyzedFunction, required }) => [analyzedFunction.id, required]),
	);
}

export function collectUnusedFindings(
	functions: readonly AnalyzedCapabilityFunction[],
	required: ReadonlyMap<string, ReadonlySet<string>>,
): readonly DiyUnusedCapabilityFinding[] {
	const findings: DiyUnusedCapabilityFinding[] = [];
	for (const analyzedFunction of functions) {
		if (
			!analyzedFunction.isReportable ||
			analyzedFunction.parameterName === "_capabilities" ||
			hasBlockingUnsupported(analyzedFunction)
		) {
			continue;
		}
		/* c8 ignore next -- required is produced from the same analyzed function list. */
		const functionRequired = required.get(analyzedFunction.id) ?? new Set<string>();
		const unused = Array.from(analyzedFunction.declaredCapabilityIds)
			.filter((id) => !functionRequired.has(id))
			.sort();
		if (unused.length === 0) {
			continue;
		}
		findings.push({
			column: analyzedFunction.column,
			declared: sorted(analyzedFunction.declaredCapabilityIds),
			direct: sorted(analyzedFunction.directCapabilityIds),
			filePath: analyzedFunction.filePath,
			functionName: analyzedFunction.name,
			line: analyzedFunction.line,
			transitive: sorted(functionRequired),
			unused,
		});
	}
	return findings;
}

export function collectUnsupported(
	functions: readonly AnalyzedCapabilityFunction[],
): readonly DiyAnalyzerUnsupported[] {
	const unsupported: DiyAnalyzerUnsupported[] = [];
	for (const analyzedFunction of functions) {
		if (!analyzedFunction.isReportable) {
			continue;
		}
		for (const reason of analyzedFunction.unsupportedReasons) {
			unsupported.push(makeUnsupported(analyzedFunction, reason));
		}
	}
	return unsupported;
}

export function collectProviderViolations(
	functions: readonly AnalyzedCapabilityFunction[],
): readonly DiyAnalyzerViolation[] {
	const violations: DiyAnalyzerViolation[] = [];
	for (const analyzedFunction of functions) {
		if (!analyzedFunction.isReportable) {
			continue;
		}
		for (const check of analyzedFunction.providerChecks) {
			const overlapping = Array.from(check.extra)
				.filter((id) => analyzedFunction.declaredCapabilityIds.has(id))
				.sort();
			if (overlapping.length === 0) {
				continue;
			}
			const verb = overlapping.length === 1 ? "is" : "are";
			violations.push({
				capabilityIds: overlapping,
				column: check.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: check.line,
				name: "redundant capability provider",
				notes: [
					{
						kind: "note",
						message:
							`${overlapping.map((id) => `\`${id}\``).join(", ")} ${verb} already allowed by this function's ` +
							"`capabilities` parameter",
					},
					{
						kind: "help",
						message:
							"use `Capabilities.override(...)` when replacing an existing capability is intentional",
					},
				],
				reason: "Capabilities.extend adds capabilities already present on capabilities",
			});
		}
	}
	return violations;
}

export function graphFunction(
	analyzedFunction: AnalyzedCapabilityFunction,
	required: ReadonlyMap<string, ReadonlySet<string>>,
): DiyModuleGraphFunction {
	/* c8 ignore next -- required is produced from the same analyzed function list. */
	const functionRequired = required.get(analyzedFunction.id) ?? new Set<string>();
	return {
		direct: sorted(analyzedFunction.directCapabilityIds),
		name: analyzedFunction.name,
		transitive: sorted(functionRequired),
	};
}

function makeUnsupported(
	analyzedFunction: AnalyzedCapabilityFunction,
	reason: UnsupportedAnalysisReason,
): DiyAnalyzerUnsupported {
	switch (reason.kind) {
		case "dynamic-capability-access":
			return {
				/* c8 ignore next -- dynamic access reports carry the exact access location. */
				column: reason.column ?? analyzedFunction.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				/* c8 ignore next -- dynamic access reports carry the exact access location. */
				line: reason.line ?? analyzedFunction.line,
				notes: [dynamicCapabilityAccessHelp()],
				reason: "dynamic capability access",
			};
		case "generic-direct-read":
			return {
				column: analyzedFunction.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: analyzedFunction.line,
				notes: [
					{
						kind: "help",
						message:
							"use a concrete `Capabilities<...>` type for functions that read services directly",
					},
				],
				reason: "generic capabilities parameter reads services directly",
			};
		case "open-capability-bag":
			return {
				column: analyzedFunction.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: analyzedFunction.line,
				notes: [
					{
						kind: "help",
						message:
							"use a concrete `Capabilities<...>` union, or `Capabilities<never>` for an empty bag",
					},
				],
				reason: "open-ended capability bag cannot be checked for unused capabilities",
			};
		case "unresolved-declaration":
			return {
				column: analyzedFunction.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: analyzedFunction.line,
				reason: "capabilities declaration could not be resolved",
			};
		case "unresolved-forwarding":
			return {
				column: analyzedFunction.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: analyzedFunction.line,
				notes: [
					{
						kind: "help",
						message:
							"replace the dynamic callee with a named effectful function call, for example `run(capabilities)`",
					},
				],
				reason: "unresolved capabilities forwarding callee",
			};
	}
}

function dynamicCapabilityAccessHelp(): DiyAnalyzerNote {
	return {
		kind: "help",
		message:
			"use direct property access like `capabilities.reader`, or bracket access with a const string key",
	};
}

function hasBlockingUnsupported(analyzedFunction: AnalyzedCapabilityFunction): boolean {
	return analyzedFunction.unsupportedReasons.length > 0;
}
