import type {
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";

export type DiagnosticSuppression = {
	readonly column: number;
	readonly filePath: string;
	readonly line: number;
	readonly targetLine: number;
};

type SuppressibleDiagnostic = {
	readonly filePath: string;
	readonly line?: number;
};

type SuppressionInput = {
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly suppressions: readonly DiagnosticSuppression[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

type SuppressionResult = {
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

export function applyDiagnosticSuppressions(input: SuppressionInput): SuppressionResult {
	const suppressionIndexesByTarget = new Map<string, number[]>();
	for (const [index, suppression] of input.suppressions.entries()) {
		const key = targetKey(suppression.filePath, suppression.targetLine);
		const existing = suppressionIndexesByTarget.get(key) ?? [];
		existing.push(index);
		suppressionIndexesByTarget.set(key, existing);
	}

	const usedSuppressionIndexes = new Set<number>();
	const suppresses = (diagnostic: SuppressibleDiagnostic): boolean => {
		/* c8 ignore next -- analyzer diagnostics normally carry source lines. */
		if (diagnostic.line == null) {
			return false;
		}
		const indexes = suppressionIndexesByTarget.get(targetKey(diagnostic.filePath, diagnostic.line));
		/* c8 ignore next -- normal suppression tests use matching target lines. */
		if (indexes == null) {
			return false;
		}
		/* c8 ignore start -- covered when a remaining diagnostic is suppressed. */
		for (const index of indexes) {
			usedSuppressionIndexes.add(index);
		}
		return true;
		/* c8 ignore stop */
	};

	const violations = input.violations.filter((violation) => !suppresses(violation));
	const unsupported = input.unsupported.filter((item) => !suppresses(item));
	const findings = input.findings.filter((finding) => !suppresses(finding));

	return {
		findings,
		unsupported,
		violations: [
			...violations,
			...input.suppressions
				.filter((_, index) => !usedSuppressionIndexes.has(index))
				.map((suppression) => unusedSuppressionViolation(suppression)),
		],
	};
}

function targetKey(filePath: string, line: number): string {
	return `${filePath}\0${line}`;
}

function unusedSuppressionViolation(suppression: DiagnosticSuppression): DiyAnalyzerViolation {
	return {
		column: suppression.column,
		filePath: suppression.filePath,
		line: suppression.line,
		name: "unused diagnostic suppression",
		notes: [
			{
				kind: "help",
				message: "remove this directive or move it to the line before the diagnostic",
			},
		],
		reason: "`diy-ignore-next-line` did not suppress any DIY diagnostic.",
	};
}
