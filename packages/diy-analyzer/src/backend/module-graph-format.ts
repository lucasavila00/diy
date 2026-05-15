import { relative, resolve } from "node:path";

import { normalizePath } from "../frontend/source-files.ts";
import type {
	AnalyzeOptions,
	DiyModuleGraph,
	DiyModuleGraphCall,
	DiyModuleGraphFunction,
	DiyModuleGraphModule,
} from "../middle-end/types.ts";

export function formatDiyModuleGraph(graph: DiyModuleGraph, options: AnalyzeOptions = {}): string {
	const modules = graph.modules.filter((moduleInfo) => moduleInfo.functions.length > 0);
	if (modules.length === 0) {
		return "No functions found.\n";
	}
	/* c8 ignore next -- CLI/tests pass cwd explicitly. */
	const cwd = resolve(options.cwd ?? process.cwd());
	const labels = buildFunctionLabels(cwd, modules);
	const lines = ["Module graph", ""];
	for (const [index, moduleInfo] of modules.entries()) {
		if (index > 0) {
			lines.push("");
		}
		lines.push(formatModule(cwd, labels, moduleInfo));
	}
	return `${lines.join("\n")}\n`;
}

function formatModule(
	cwd: string,
	labels: ReadonlyMap<string, string>,
	moduleInfo: DiyModuleGraphModule,
): string {
	const lines = [formatPath(cwd, moduleInfo.filePath)];
	for (const [index, functionInfo] of moduleInfo.functions.entries()) {
		lines.push(
			formatFunction(cwd, labels, functionInfo, index === moduleInfo.functions.length - 1),
		);
		if (index < moduleInfo.functions.length - 1) {
			lines.push("|");
		}
	}
	return lines.join("\n");
}

function formatFunction(
	cwd: string,
	labels: ReadonlyMap<string, string>,
	functionInfo: DiyModuleGraphFunction,
	lastFunction: boolean,
): string {
	const prefix = lastFunction ? "`--" : "+--";
	const childPrefix = lastFunction ? "   " : "|  ";
	const lines = [`${prefix} ${functionInfo.name}: ${formatList(functionInfo.transitive)}`];
	const calls = functionInfo.calls.map((call) => formatCall(labels, call));
	if (calls.length > 0) {
		lines.push(`${childPrefix}\`-- calls: ${calls.join(", ")}`);
	}
	return lines.join("\n");
}

function formatCall(labels: ReadonlyMap<string, string>, call: DiyModuleGraphCall): string {
	/* c8 ignore next -- graph mode rejects unresolved forwarding before formatting. */
	if (call.filePath == null || call.functionName == null) {
		return call.calleeName;
	}
	/* c8 ignore next -- unresolved graph calls are blocked before graph formatting. */
	return labels.get(functionKey(call.filePath, call.functionName)) ?? call.functionName;
}

function formatPath(cwd: string, filePath: string): string {
	return normalizePath(relative(cwd, filePath));
}

function buildFunctionLabels(
	cwd: string,
	modules: readonly DiyModuleGraphModule[],
): ReadonlyMap<string, string> {
	const functions = modules.flatMap((moduleInfo) =>
		moduleInfo.functions.map((functionInfo) => ({
			filePath: functionInfo.filePath,
			functionName: functionInfo.name,
			path: formatPath(cwd, functionInfo.filePath),
		})),
	);
	const labels = new Map<string, string>();
	for (const item of functions) {
		const segments = item.path.split("/");
		for (let length = 0; length <= segments.length; length++) {
			const candidate =
				length === 0
					? item.functionName
					: `${segments.slice(-length).join("/")}:${item.functionName}`;
			if (isUniqueCandidate(functions, item, candidate, length)) {
				labels.set(functionKey(item.filePath, item.functionName), candidate);
				break;
			}
		}
	}
	return labels;
}

function isUniqueCandidate(
	functions: readonly {
		readonly filePath: string;
		readonly functionName: string;
		readonly path: string;
	}[],
	item: { readonly filePath: string; readonly functionName: string; readonly path: string },
	candidate: string,
	length: number,
): boolean {
	return functions.every((other) => {
		if (other.filePath === item.filePath && other.functionName === item.functionName) {
			return true;
		}
		const otherSegments = other.path.split("/");
		const otherCandidate =
			length === 0
				? other.functionName
				: `${otherSegments.slice(-length).join("/")}:${other.functionName}`;
		return otherCandidate !== candidate;
	});
}

function functionKey(filePath: string, functionName: string): string {
	return `${filePath}:${functionName}`;
}

function formatList(values: readonly string[]): string {
	/* c8 ignore next -- materialized graph functions have at least one capability. */
	return values.length === 0 ? "(none)" : values.join(", ");
}
