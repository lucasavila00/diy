import { relative, resolve } from "node:path";

import type {
	AnalyzeOptions,
	DiyModuleGraph,
	DiyModuleGraphFunction,
	DiyModuleGraphModule,
} from "../model/types.ts";
import { normalizePath } from "../shared/path.ts";

export function formatDiyModuleGraph(graph: DiyModuleGraph, options: AnalyzeOptions = {}): string {
	const modules = graph.modules.filter((moduleInfo) => moduleInfo.functions.length > 0);
	if (modules.length === 0) {
		return "No functions found.\n";
	}
	/* c8 ignore next -- CLI/tests pass cwd explicitly. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const lines = ["Module graph", ""];
	for (const [index, moduleInfo] of modules.entries()) {
		if (index > 0) {
			lines.push("");
		}
		lines.push(formatModule(cwd, moduleInfo));
	}
	return `${lines.join("\n")}\n`;
}

function formatModule(cwd: string, moduleInfo: DiyModuleGraphModule): string {
	const lines = [formatPath(cwd, moduleInfo.filePath)];
	for (const [index, functionInfo] of moduleInfo.functions.entries()) {
		lines.push(formatFunction(functionInfo, index === moduleInfo.functions.length - 1));
		if (index < moduleInfo.functions.length - 1) {
			lines.push("|");
		}
	}
	return lines.join("\n");
}

function formatFunction(functionInfo: DiyModuleGraphFunction, lastFunction: boolean): string {
	const prefix = lastFunction ? "`--" : "+--";
	const childPrefix = lastFunction ? "   " : "|  ";
	const lines = [`${prefix} ${functionInfo.name}`];
	lines.push(`${childPrefix}+-- direct: ${formatList(functionInfo.direct)}`);
	lines.push(`${childPrefix}\`-- indirect: ${formatList(indirectCapabilities(functionInfo))}`);
	return lines.join("\n");
}

function indirectCapabilities(functionInfo: DiyModuleGraphFunction): readonly string[] {
	const direct = new Set(functionInfo.direct);
	return functionInfo.transitive.filter((capabilityId) => !direct.has(capabilityId));
}

function formatPath(cwd: string, filePath: string): string {
	return normalizePath(relative(cwd, filePath));
}

function formatList(values: readonly string[]): string {
	/* c8 ignore next -- materialized graph functions have at least one capability. */
	return values.length === 0 ? "(none)" : values.join(", ");
}
