import { resolve } from "node:path";

import type { DiySourceConfig } from "../core/source-files.ts";
import { analyzeNativeModuleGraph } from "../dead-code/native-analysis.ts";
import type { AnalyzeOptions, DiyModuleGraph } from "../model/types.ts";

export async function analyzeDiyModuleGraph(
	config: DiySourceConfig,
	options: AnalyzeOptions = {},
): Promise<DiyModuleGraph> {
	/* c8 ignore next -- CLI/tests always pass cwd; default is process-entry convenience. */
	const cwd = resolve(options.cwd ?? process.cwd());
	return analyzeNativeModuleGraph(config, cwd);
}
