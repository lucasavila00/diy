import { resolve } from "node:path";

import { applyDiagnosticSuppressions } from "../backend/diagnostic-suppressions.ts";
import { finalizeAnalysis } from "../backend/finalize.ts";
import { buildDiyProgram } from "../core/program.ts";
import type { DiySourceConfig } from "../core/source-files.ts";
import { analyzeLintModules } from "../lint/analyze.ts";
import type { AnalyzeOptions, DiyAnalysis } from "../model/types.ts";
import { analyzeNativeDeadCode } from "./native-analysis.ts";

export async function analyzeDiyDeadCode(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const [program, middleEnd] = await Promise.all([
		buildDiyProgram(config, cwd),
		analyzeNativeDeadCode(config, cwd),
	]);
	const lint = analyzeLintModules(program.modules);
	const suppressed = applyDiagnosticSuppressions({
		findings: middleEnd.findings,
		suppressions: middleEnd.suppressions.suppressions,
		unsupported: [...lint.unsupported, ...middleEnd.unsupported],
		violations: [...lint.violations, ...middleEnd.violations, ...middleEnd.suppressions.violations],
	});
	return finalizeAnalysis({
		coveredFiles: middleEnd.coveredFiles,
		findings: suppressed.findings,
		unsupported: suppressed.unsupported,
		violations: suppressed.violations,
	});
}
