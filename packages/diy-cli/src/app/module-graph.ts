import { resolve } from "node:path";

import { buildDiyProgram } from "../frontend/program.ts";
import type { DiySourceConfig } from "../frontend/source-files.ts";
import { analyzeModuleGraph } from "../middle-end/module-graph.ts";
import type { AnalyzeOptions, DiyModuleGraph } from "../middle-end/types.ts";

export async function analyzeDiyModuleGraph(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyModuleGraph> {
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(config, cwd);
	return analyzeModuleGraph(program.loader, program.modules);
}
