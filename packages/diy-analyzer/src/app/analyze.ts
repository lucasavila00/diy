import { resolve } from "node:path";

import { finalizeAnalysis } from "../backend/finalize.ts";
import { analyzeFrontend } from "../frontend/analyze.ts";
import { buildDiyProgram } from "../frontend/program.ts";
import type { DiySourceConfig } from "../frontend/source-files.ts";
import { analyzeMiddleEnd } from "../middle-end/analyze.ts";
import type { AnalyzeOptions, DiyAnalysis } from "../middle-end/types.ts";

export async function analyzeDiy(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	/* istanbul ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(config, cwd);
	const frontend = analyzeFrontend(program.modules);
	const middleEnd = analyzeMiddleEnd(program.loader, program.modules);
	return finalizeAnalysis({
		coveredFiles: program.coveredFiles,
		findings: middleEnd.findings,
		unsupported: [...frontend.unsupported, ...middleEnd.unsupported],
		violations: [...frontend.violations, ...middleEnd.violations],
	});
}
