import { resolve } from "node:path";

import { finalizeAnalysis } from "../backend/finalize.ts";
import { analyzeFrontend } from "../frontend/analyze.ts";
import { buildDiyProgram } from "../frontend/program.ts";
import { analyzeMiddleEnd } from "../middle-end/analyze.ts";
import type { AnalyzeOptions, DiyAnalysis } from "../middle-end/types.ts";

export async function analyzeDiy(
	inputs: readonly string[],
	options: AnalyzeOptions = {},
): Promise<DiyAnalysis> {
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(inputs, cwd);
	const frontend = analyzeFrontend(program.modules);
	const middleEnd = analyzeMiddleEnd(program.loader, program.modules);
	return finalizeAnalysis({
		coveredFiles: program.coveredFiles,
		findings: middleEnd.findings,
		unsupported: [...frontend.unsupported, ...middleEnd.unsupported],
		violations: [...frontend.violations, ...middleEnd.violations],
	});
}
