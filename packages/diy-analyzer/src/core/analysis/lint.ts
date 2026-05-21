import { resolve } from "node:path";

import type { DiySourceConfig } from "../config/source-files.ts";
import type { AnalyzeOptions, DiyAnalysis } from "../model/types.ts";
import { buildNativeSyntaxProgram, closeNativeSyntaxProgram } from "./checker-program.ts";
import { applyDiagnosticSuppressions } from "./diagnostic-suppressions.ts";
import { finalizeAnalysis } from "./finalize.ts";
import { analyzeNativeDiySyntax, collectNativeParseErrors } from "./native-syntax-rules.ts";

export async function analyzeDiyLint(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
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
