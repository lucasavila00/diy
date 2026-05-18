import { resolve } from "node:path";

import { applyDiagnosticSuppressions } from "../backend/diagnostic-suppressions.ts";
import { finalizeAnalysis } from "../backend/finalize.ts";
import { analyzeFrontend } from "../frontend/analyze.ts";
import { collectDiagnosticSuppressions } from "../frontend/diagnostic-suppressions.ts";
import { buildDiyProgram } from "../frontend/program.ts";
import type { DiySourceConfig } from "../frontend/source-files.ts";
import { analyzeMiddleEnd } from "../middle-end/analyze.ts";
import type { AnalyzeOptions, DiyAnalysis } from "../model/types.ts";

export async function analyzeDiy(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(config, cwd);
	const frontend = analyzeFrontend(program.loader, program.modules);
	const middleEnd = analyzeMiddleEnd(program.loader, program.modules);
	const suppressions = collectDiagnosticSuppressions(program.modules);
	const suppressed = applyDiagnosticSuppressions({
		findings: middleEnd.findings,
		suppressions: suppressions.suppressions,
		unsupported: [...frontend.unsupported, ...middleEnd.unsupported],
		violations: [...frontend.violations, ...middleEnd.violations, ...suppressions.violations],
	});
	return finalizeAnalysis({
		coveredFiles: program.coveredFiles,
		findings: suppressed.findings,
		unsupported: suppressed.unsupported,
		violations: suppressed.violations,
	});
}
