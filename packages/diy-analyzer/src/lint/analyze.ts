import { resolve } from "node:path";

import { applyDiagnosticSuppressions } from "../backend/diagnostic-suppressions.ts";
import { finalizeAnalysis } from "../backend/finalize.ts";
import { collectDiagnosticSuppressions } from "../core/diagnostic-suppressions.ts";
import { collectParseErrors } from "../core/parse-errors.ts";
import { buildDiyProgram } from "../core/program.ts";
import type { DiySourceConfig } from "../core/source-files.ts";
import type { ModuleInfo } from "../core/types.ts";
import type {
	AnalyzeOptions,
	DiyAnalysis,
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
} from "../model/types.ts";
import { analyzeDiySyntax } from "./syntax-rules.ts";

type LintAnalysis = {
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
};

function analyzeLintModules(modules: readonly ModuleInfo[]): LintAnalysis {
	const violations: DiyAnalyzerViolation[] = [];
	for (const moduleInfo of modules) {
		/* c8 ignore next -- ModuleLoader only materializes configured source files. */
		if (!moduleInfo.reportable) {
			continue;
		}
		violations.push(...analyzeDiySyntax(moduleInfo));
	}
	return { unsupported: collectParseErrors(modules), violations };
}

export async function analyzeDiyLint(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(config, cwd);
	const lint = analyzeLintModules(program.modules);
	const suppressions = collectDiagnosticSuppressions(program.modules);
	const suppressed = applyDiagnosticSuppressions({
		findings: [],
		suppressions: suppressions.suppressions,
		unsupported: lint.unsupported,
		violations: [...lint.violations, ...suppressions.violations],
	});
	return finalizeAnalysis({
		coveredFiles: program.coveredFiles,
		findings: suppressed.findings,
		unsupported: suppressed.unsupported,
		violations: suppressed.violations,
	});
}
