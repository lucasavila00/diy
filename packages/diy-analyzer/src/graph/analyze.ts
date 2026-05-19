import { resolve } from "node:path";

import { buildDiyProgram } from "../core/program.ts";
import type { DiySourceConfig } from "../core/source-files.ts";
import { materializeFunctionFacts } from "../dead-code/function-facts.ts";
import type { AnalyzeOptions, DiyModuleGraph } from "../model/types.ts";
import { analyzeModuleGraph } from "./module-graph.ts";

export async function analyzeDiyModuleGraph(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyModuleGraph> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const program = await buildDiyProgram(config, cwd);
	const factsByPath = materializeFunctionFacts(program.loader, program.modules);
	return analyzeModuleGraph(program.loader, program.modules, factsByPath);
}
