import { resolve } from "node:path";

import type { DiySourceConfig } from "../config/source-files.ts";
import { expandSourceFiles } from "../config/source-files.ts";
import type { AnalyzeOptions, DiyAnalysis } from "../model/types.ts";
import { applyDiagnosticSuppressions } from "./diagnostic-suppressions.ts";
import { finalizeAnalysis } from "./finalize.ts";
import { analyzeNativeDeadCodeFromFiles } from "./native-analysis.ts";
import { timeDeadCodePhase, timeDeadCodePhaseAsync } from "./timing.ts";

export async function analyzeDiyDeadCode(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const coveredFiles = await timeDeadCodePhaseAsync("source expansion", () =>
		expandSourceFiles(config, cwd),
	);
	const middleEnd = await timeDeadCodePhaseAsync("tsgo dead-code analysis", () =>
		analyzeNativeDeadCodeFromFiles(coveredFiles, cwd),
	);
	const suppressed = timeDeadCodePhase("apply suppressions", () =>
		applyDiagnosticSuppressions({
			findings: middleEnd.findings,
			suppressions: middleEnd.suppressions.suppressions,
			unsupported: middleEnd.unsupported,
			violations: [...middleEnd.violations, ...middleEnd.suppressions.violations],
		}),
	);
	return timeDeadCodePhase("finalize analysis", () =>
		finalizeAnalysis({
			coveredFiles: middleEnd.coveredFiles,
			findings: suppressed.findings,
			unsupported: suppressed.unsupported,
			violations: suppressed.violations,
		}),
	);
}
