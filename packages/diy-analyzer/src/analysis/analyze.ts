import { resolve } from "node:path";

import type { DiySourceConfig } from "../config/source-files.ts";
import { expandSourceFiles } from "../config/source-files.ts";
import type { AnalyzeOptions, DiyAnalysis } from "../model/types.ts";
import { buildNativeSyntaxProgram, closeNativeSyntaxProgram } from "./checker-program.ts";
import { applyDiagnosticSuppressions } from "./diagnostic-suppressions.ts";
import { finalizeAnalysis } from "./finalize.ts";
import { analyzeNativeDeadCodeFromFiles } from "./native-analysis.ts";
import { analyzeNativeDiySyntax, collectNativeParseErrors } from "./native-syntax-rules.ts";
import { timeDeadCodePhase, timeDeadCodePhaseAsync } from "./timing.ts";

export async function analyzeDiy(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	if (options.graph === true && options.deadCodeAnalysis === false) {
		throw new Error("Cannot combine --graph and --no-dead-code-analysis.");
	}
	if (options.deadCodeAnalysis === false) {
		return analyzeDiySyntax(config, cwd);
	}

	const coveredFiles = await timeDeadCodePhaseAsync("source expansion", () =>
		expandSourceFiles(config, cwd),
	);
	const middleEnd = await timeDeadCodePhaseAsync("tsgo dead-code analysis", () =>
		analyzeNativeDeadCodeFromFiles(
			coveredFiles,
			cwd,
			options.graph === true ? { graph: true } : {},
		),
	);
	const suppressed = timeDeadCodePhase("apply suppressions", () =>
		applyDiagnosticSuppressions({
			findings: middleEnd.findings,
			suppressions: middleEnd.suppressions.suppressions,
			unsupported: middleEnd.unsupported,
			violations: [...middleEnd.violations, ...middleEnd.suppressions.violations],
		}),
	);
	const analysis = timeDeadCodePhase("finalize analysis", () =>
		finalizeAnalysis({
			coveredFiles: middleEnd.coveredFiles,
			findings: suppressed.findings,
			unsupported: suppressed.unsupported,
			violations: suppressed.violations,
		}),
	);
	return middleEnd.graph == null ? analysis : { ...analysis, graph: middleEnd.graph };
}

async function analyzeDiySyntax(config: DiySourceConfig, cwd: string): Promise<DiyAnalysis> {
	const program = await buildNativeSyntaxProgram(config, cwd);
	try {
		const suppressed = applyDiagnosticSuppressions({
			findings: [],
			suppressions: program.suppressions.suppressions,
			unsupported: collectNativeParseErrors(program.project, program.sourceFiles),
			violations: [
				...analyzeNativeDiySyntax(program.project, program.sourceFiles),
				...program.suppressions.violations,
			],
		});
		return finalizeAnalysis({
			coveredFiles: program.coveredFiles,
			findings: suppressed.findings,
			unsupported: suppressed.unsupported,
			violations: suppressed.violations,
		});
	} finally {
		closeNativeSyntaxProgram(program);
	}
}
