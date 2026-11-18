import type {
	DiyAnalyzerNote,
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyModuleGraphFunction,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import { sorted } from "./ast-utils.ts";
import type {
	AnalyzedCapabilityFunction,
	PropagationHelperName,
	UnsupportedAnalysisReason,
	UntrackedCapabilitiesPattern,
} from "./native-types.ts";

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
			if (check.helper !== "extend") {
				const replacesAll =
					analyzedFunction.declaredCapabilityIds.size > 0 &&
					Array.from(analyzedFunction.declaredCapabilityIds).every((id) => check.extra.has(id));
				if (replacesAll) {
					violations.push({
						capabilityIds: sorted(analyzedFunction.declaredCapabilityIds),
						column: check.column,
						filePath: analyzedFunction.filePath,
						functionName: analyzedFunction.name,
						line: check.line,
						name: "replaced capabilities bag",
						notes: [
							{
								kind: "note",
								message: "no service from `capabilities` gets to the result",
							},
							{
								kind: "help",
								message:
									"give only the services that change in later arguments; a later argument with a capability type that is too wide also causes this",
							},
						],
						reason: `Capabilities.${check.helper} replaces all capabilities of capabilities`,
					});
				}
				continue;
			}
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
		case "capabilities-not-first-helper-argument":
			return {
				column: reason.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: reason.line,
				notes: [
					{
						kind: "help",
						message: `put the capabilities bag first: \`${helperCallExample(reason.helper, "capabilities")}\``,
					},
				],
				reason: `capabilities bag is not the first argument of \`Capabilities.${reason.helper}(...)\`; the analyzer follows the bag only in the first argument`,
			};
		case "nested-capabilities-helper":
			return {
				column: reason.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: reason.line,
				notes: [
					{
						kind: "help",
						message: `assign the inner result to a local first: \`const bag = ${helperCallExample(reason.inner, "capabilities")}; ${helperCallExample(reason.outer, "bag")}\``,
					},
				],
				reason: `\`Capabilities.${reason.inner}(...)\` is an argument of \`Capabilities.${reason.outer}(...)\`; the analyzer does not follow nested helper calls`,
			};
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
				column: reason.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: reason.line,
				notes: [
					{
						kind: "help",
						message:
							"pass `capabilities` only to functions whose parameter is typed `Capabilities<...>`; read the services you need instead of inspecting the bag",
					},
				],
				reason:
					"capabilities bag passed to a parameter not typed `Capabilities<...>`; the analyzer cannot see which services it uses",
			};
		case "untracked-capabilities-flow":
			return {
				column: reason.column,
				filePath: analyzedFunction.filePath,
				functionName: analyzedFunction.name,
				line: reason.line,
				notes: [{ kind: "help", message: untrackedFlowHelp(reason.pattern) }],
				reason: `${untrackedFlowReason(reason.pattern)}; the analyzer cannot tell which capabilities are used`,
			};
	}
}

function helperCallExample(helper: PropagationHelperName, bag: string): string {
	const other = { extend: "extra", merge: "other", override: "replacement" }[helper];
	return `Capabilities.${helper}(${bag}, ${other})`;
}

function untrackedFlowReason(pattern: UntrackedCapabilitiesPattern): string {
	switch (pattern) {
		case "??":
		case "||":
			return `capabilities bag passed through \`${pattern}\``;
		case "conditional":
			return "capabilities bag passed through a conditional expression";
		case "object-spread":
			return "capabilities bag copied with an object spread";
		case "return":
			return "capabilities bag returned from a function";
		case "wrapper-object":
			return "capabilities bag stored in an object property";
	}
}

function untrackedFlowHelp(pattern: UntrackedCapabilitiesPattern): string {
	const direct = "pass `capabilities` directly as an argument: `run(capabilities)`";
	switch (pattern) {
		case "??":
		case "||":
			return `${direct}; do not pick a capabilities bag with \`${pattern}\``;
		case "conditional":
			return `${direct}; branch around the calls instead, like \`flag ? run(capabilities) : other(capabilities)\``;
		case "object-spread":
			return `${direct}; use \`Capabilities.extend(capabilities, ...)\` to add services`;
		case "return":
			return `${direct}, instead of returning it from a function`;
		case "wrapper-object":
			return "pass `capabilities` directly as its own argument: `run(capabilities, options)`, not inside an object";
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
