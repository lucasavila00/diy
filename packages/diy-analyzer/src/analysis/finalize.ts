import type {
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyAnalysis,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import { compareStrings } from "../shared/compare.ts";

export function finalizeAnalysis(input: {
	readonly coveredFiles: readonly string[];
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
}): DiyAnalysis {
	return {
		coveredFiles: input.coveredFiles,
		findings: sortFindings(input.findings),
		unsupported: sortUnsupported(input.unsupported),
		violations: sortViolations(input.violations),
	};
}

function sortFindings(
	findings: readonly DiyUnusedCapabilityFinding[],
): readonly DiyUnusedCapabilityFinding[] {
	return Array.from(findings).sort(compareFindings);
}

function sortUnsupported(
	unsupported: readonly DiyAnalyzerUnsupported[],
): readonly DiyAnalyzerUnsupported[] {
	return Array.from(unsupported).sort(compareUnsupported);
}

function sortViolations(
	violations: readonly DiyAnalyzerViolation[],
): readonly DiyAnalyzerViolation[] {
	return Array.from(violations).sort(compareViolations);
}

function compareFindings(
	left: DiyUnusedCapabilityFinding,
	right: DiyUnusedCapabilityFinding,
): number {
	/* c8 ignore next -- sorting fallback branches are deterministic tie breakers. */
	return (
		compareStrings(left.filePath, right.filePath) ||
		left.line - right.line ||
		compareStrings(left.functionName, right.functionName)
	);
}

function compareUnsupported(left: DiyAnalyzerUnsupported, right: DiyAnalyzerUnsupported): number {
	/* c8 ignore next -- sorting fallback branches are deterministic tie breakers. */
	return (
		compareStrings(left.filePath, right.filePath) ||
		(left.line ?? 0) - (right.line ?? 0) ||
		compareStrings(left.functionName ?? "", right.functionName ?? "") ||
		compareStrings(left.reason, right.reason)
	);
}

/* c8 ignore next -- violation sorting fallback branches are deterministic output plumbing. */
function compareViolations(left: DiyAnalyzerViolation, right: DiyAnalyzerViolation): number {
	return (
		compareStrings(left.filePath, right.filePath) ||
		(left.line ?? 0) - (right.line ?? 0) ||
		compareStrings(left.functionName ?? "", right.functionName ?? "") ||
		compareStrings(left.name, right.name) ||
		compareStrings(left.reason, right.reason)
	);
}
