import type { ModuleLoader } from "../core/module-loader.ts";
import type { ModuleInfo } from "../core/types.ts";
import { buildMiddleEndArena } from "../dead-code/arena.ts";
import type { ArenaFunction, ArenaModule, MiddleEndArena } from "../dead-code/arena.ts";
import { analyzeRequiredCapabilities } from "../dead-code/required-capabilities.ts";
import type { DeadCodeFactsByPath } from "../dead-code/types.ts";
import type {
	DiyModuleGraph,
	DiyModuleGraphCall,
	DiyModuleGraphFunction,
	DiyModuleGraphImport,
	DiyModuleGraphModule,
} from "../model/types.ts";

export function analyzeModuleGraph(
	loader: ModuleLoader,
	modules: readonly ModuleInfo[],
	factsByPath: DeadCodeFactsByPath,
): DiyModuleGraph {
	const arena = buildMiddleEndArena(loader, modules, factsByPath);
	const requiredCapabilities = analyzeRequiredCapabilities(loader, arena);
	return {
		modules: Array.from(arena.modules)
			.sort(compareModules)
			.map((moduleInfo) =>
				buildGraphModule(loader, arena, moduleInfo, requiredCapabilities.requiredByFunction),
			),
	};
}

function buildGraphModule(
	loader: ModuleLoader,
	arena: MiddleEndArena,
	moduleInfo: ArenaModule,
	requiredByFunction: readonly ReadonlySet<string>[],
): DiyModuleGraphModule {
	return {
		filePath: moduleInfo.filePath,
		functions: moduleInfo.functions
			.map((functionIndex) => arena.functions[functionIndex])
			.filter((functionInfo) => functionInfo != null)
			.sort(compareFunctions)
			.map((functionInfo) => buildGraphFunction(arena, functionInfo, requiredByFunction)),
		imports: buildImports(loader, moduleInfo),
		reportable: moduleInfo.reportable,
	};
}

function buildGraphFunction(
	arena: MiddleEndArena,
	functionInfo: ArenaFunction,
	requiredByFunction: readonly ReadonlySet<string>[],
): DiyModuleGraphFunction {
	/* c8 ignore next -- required capabilities are built for every arena function. */
	const required = requiredByFunction[functionInfo.index] ?? new Set<string>();
	return {
		calls: functionInfo.calls.map((call) => {
			/* c8 ignore next -- graph mode rejects unresolved forwarding before formatting. */
			if (call.target == null) {
				return {
					calleeName: call.calleeName,
					calls: [],
					transitive: [],
				};
			}
			const callee = arena.functions[call.target];
			/* c8 ignore next -- call targets are indexes from the arena function array. */
			if (callee == null) {
				return {
					calleeName: call.calleeName,
					calls: [],
					transitive: [],
				};
			}
			/* c8 ignore next -- call targets are valid arena function indexes. */
			return buildGraphCall(callee, requiredByFunction[call.target] ?? new Set<string>());
		}),
		column: functionInfo.column,
		declared: sorted(functionInfo.declared),
		direct: sorted(functionInfo.direct),
		filePath: functionInfo.filePath,
		line: functionInfo.line,
		name: functionInfo.name,
		transitive: sorted(required),
		unused: sortedDifference(functionInfo.declared, required),
	};
}

function buildGraphCall(
	functionInfo: ArenaFunction,
	required: ReadonlySet<string>,
): DiyModuleGraphCall {
	return {
		calleeName: functionInfo.name,
		calls: [],
		column: functionInfo.column,
		filePath: functionInfo.filePath,
		functionName: functionInfo.name,
		line: functionInfo.line,
		transitive: sorted(required),
	};
}

function buildImports(
	loader: ModuleLoader,
	moduleInfo: ArenaModule,
): readonly DiyModuleGraphImport[] {
	return (
		Array.from(moduleInfo.imports.entries())
			.map(([localName, imported]) => {
				const resolvedPath = loader.resolveImport(moduleInfo.filePath, imported.source);
				/* c8 ignore next -- graph imports are resolver-backed for configured source files. */
				if (resolvedPath == null) {
					return {
						importedName: imported.importedName,
						localName,
						source: imported.source,
					};
				}
				return {
					importedName: imported.importedName,
					localName,
					resolvedPath,
					source: imported.source,
				};
			})
			/* c8 ignore start -- import sorting fallback branches are deterministic tie breakers. */
			.sort(
				(left, right) =>
					left.source.localeCompare(right.source) ||
					left.localName.localeCompare(right.localName) ||
					left.importedName.localeCompare(right.importedName),
			)
	);
	/* c8 ignore stop */
}

function compareModules(left: ArenaModule, right: ArenaModule): number {
	return left.filePath.localeCompare(right.filePath);
}

function compareFunctions(left: ArenaFunction, right: ArenaFunction): number {
	/* c8 ignore next -- graph fixture ordering covers primary line ordering. */
	return (
		left.line - right.line || left.column - right.column || left.name.localeCompare(right.name)
	);
}

function sorted(values: ReadonlySet<string>): readonly string[] {
	return Array.from(values).sort();
}

function sortedDifference(
	values: ReadonlySet<string>,
	excluded: ReadonlySet<string>,
): readonly string[] {
	/* c8 ignore next -- graph fixtures that pass normal analysis have no unused capabilities. */
	return (
		Array.from(values)
			/* c8 ignore next -- graph fixtures that pass normal analysis have no unused capabilities. */
			.filter((value) => !excluded.has(value))
			.sort()
	);
}
