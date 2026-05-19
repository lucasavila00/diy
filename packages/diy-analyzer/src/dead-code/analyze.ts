import { resolve } from "node:path";

import { applyDiagnosticSuppressions } from "../backend/diagnostic-suppressions.ts";
import { finalizeAnalysis } from "../backend/finalize.ts";
import { collectDiagnosticSuppressions } from "../core/diagnostic-suppressions.ts";
import { buildDiyProgram } from "../core/program.ts";
import type { DiySourceConfig } from "../core/source-files.ts";
import { analyzeLintModules } from "../lint/analyze.ts";
import type { AnalyzeOptions, DiyAnalysis } from "../model/types.ts";
import { analyzeMiddleEnd } from "./analyze-middle.ts";
import { materializeFunctionFacts } from "./function-facts.ts";

export async function analyzeDiyDeadCode(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(config, cwd);
	const lint = analyzeLintModules(program.modules);
	const factsByPath = materializeFunctionFacts(program.loader, program.modules);
	const middleEnd = analyzeMiddleEnd(program.loader, program.modules, factsByPath);
	const suppressions = collectDiagnosticSuppressions(program.modules);
	const suppressed = applyDiagnosticSuppressions({
		findings: middleEnd.findings,
		suppressions: suppressions.suppressions,
		unsupported: [...lint.unsupported, ...middleEnd.unsupported],
		violations: [...lint.violations, ...middleEnd.violations, ...suppressions.violations],
	});
	return finalizeAnalysis({
		coveredFiles: program.coveredFiles,
		findings: suppressed.findings,
		unsupported: suppressed.unsupported,
		violations: suppressed.violations,
	});
}
