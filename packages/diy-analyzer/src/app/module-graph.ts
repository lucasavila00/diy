import { resolve } from "node:path";

import { buildDiyProgram } from "../frontend/program.ts";
import { analyzeModuleGraph } from "../middle-end/module-graph.ts";
import type { AnalyzeOptions, DiyModuleGraph } from "../middle-end/types.ts";

export async function analyzeDiyModuleGraph(
	inputs: readonly string[],
	options: AnalyzeOptions = {},
): Promise<DiyModuleGraph> {
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(inputs, cwd);
	return analyzeModuleGraph(program.loader, program.modules);
}
