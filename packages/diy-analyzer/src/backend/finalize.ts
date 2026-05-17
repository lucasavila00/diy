import type {
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyAnalysis,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";
import { sortFindings, sortUnsupported, sortViolations } from "./format.ts";

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
