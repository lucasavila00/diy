import { resolve } from "node:path";

import { buildDiyProgram } from "../frontend/program.ts";
import type { DiySourceConfig } from "../frontend/source-files.ts";
import { analyzeModuleGraph } from "../middle-end/module-graph.ts";
import type { AnalyzeOptions, DiyModuleGraph } from "../model/types.ts";

export async function analyzeDiyModuleGraph(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyModuleGraph> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(config, cwd);
	return analyzeModuleGraph(program.loader, program.modules);
}
