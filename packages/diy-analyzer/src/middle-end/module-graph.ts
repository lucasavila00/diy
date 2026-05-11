import type { ModuleLoader } from "../frontend/module-loader.ts";
import type { ModuleInfo } from "../frontend/types.ts";
import { buildMiddleEndArena } from "./arena.ts";
import type { ArenaFunction, ArenaModule, MiddleEndArena } from "./arena.ts";
import { analyzeRequiredCapabilities } from "./required-capabilities.ts";
import type {
	DiyModuleGraph,
	DiyModuleGraphCall,
	DiyModuleGraphFunction,
	DiyModuleGraphImport,
	DiyModuleGraphModule,
} from "./types.ts";

export function analyzeModuleGraph(
	loader: ModuleLoader,
	modules: readonly ModuleInfo[],
): DiyModuleGraph {
	const arena = buildMiddleEndArena(loader, modules);
	const requiredCapabilities = analyzeRequiredCapabilities(arena);
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
	const required = requiredByFunction[functionInfo.index] ?? new Set<string>();
	return {
		calls: functionInfo.calls.map((call) => {
			if (call.target == null) {
				return {
					calleeName: call.calleeName,
					calls: [],
					transitive: [],
				};
			}
			const callee = arena.functions[call.target];
			if (callee == null) {
				return {
					calleeName: call.calleeName,
					calls: [],
					transitive: [],
				};
			}
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
	return Array.from(moduleInfo.imports.entries())
		.map(([localName, imported]) => {
			const resolvedPath = loader.resolveImport(moduleInfo.filePath, imported.source);
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
		.sort(
			(left, right) =>
				left.source.localeCompare(right.source) ||
				left.localName.localeCompare(right.localName) ||
				left.importedName.localeCompare(right.importedName),
		);
}

function compareModules(left: ArenaModule, right: ArenaModule): number {
	return left.filePath.localeCompare(right.filePath);
}

function compareFunctions(left: ArenaFunction, right: ArenaFunction): number {
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
	return Array.from(values)
		.filter((value) => !excluded.has(value))
		.sort();
}
