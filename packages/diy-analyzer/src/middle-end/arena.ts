import type { ModuleLoader } from "../frontend/module-loader.ts";
import type {
	CapabilitiesProvideCheck,
	ImportedBinding,
	ModuleInfo,
	UnsupportedReason,
} from "../frontend/types.ts";

export type ModuleIndex = number & {
	readonly __brand: "ModuleIndex";
};

export type FunctionIndex = number & {
	readonly __brand: "FunctionIndex";
};

export type MiddleEndArena = {
	readonly functions: readonly ArenaFunction[];
	readonly modules: readonly ArenaModule[];
};

export type ArenaModule = {
	readonly aliases: Map<string, unknown>;
	readonly filePath: string;
	readonly functions: readonly FunctionIndex[];
	readonly imports: Map<string, ImportedBinding>;
	readonly reportable: boolean;
};

export type ArenaFunction = {
	readonly calls: readonly ArenaCall[];
	readonly column: number;
	readonly declared: ReadonlySet<string>;
	readonly direct: ReadonlySet<string>;
	readonly filePath: string;
	readonly forwardsTransformedCapabilities: boolean;
	readonly index: FunctionIndex;
	readonly line: number;
	readonly moduleIndex: ModuleIndex;
	readonly name: string;
	readonly provideChecks: readonly CapabilitiesProvideCheck[];
	readonly unsupportedReasons: readonly UnsupportedReason[];
};

export type ArenaCall = {
	readonly calleeName: string;
	readonly providedType: unknown | null;
	readonly target?: FunctionIndex;
};

export function buildMiddleEndArena(
	loader: ModuleLoader,
	moduleInfos: readonly ModuleInfo[],
): MiddleEndArena {
	const modules: ArenaModule[] = [];
	const moduleIndices: ModuleIndex[] = [];
	const functions: ArenaFunction[] = [];
	const moduleIndexByPath = new Map<string, ModuleIndex>();
	const functionIndexByModule = new Map<ModuleIndex, Map<string, FunctionIndex>>();

	for (const moduleInfo of moduleInfos) {
		const moduleIndex = makeModuleIndex(modules.length);
		moduleIndices.push(moduleIndex);
		moduleIndexByPath.set(moduleInfo.filePath, moduleIndex);
		functionIndexByModule.set(moduleIndex, new Map());
		modules.push({
			aliases: moduleInfo.aliases,
			filePath: moduleInfo.filePath,
			functions: [],
			imports: moduleInfo.imports,
			reportable: moduleInfo.reportable,
		});
	}

	for (const [modulePosition, moduleInfo] of moduleInfos.entries()) {
		const moduleIndex = moduleIndices[modulePosition];
		if (moduleIndex == null) {
			continue;
		}
		const moduleFunctionIndices: FunctionIndex[] = [];
		const functionsByName = functionIndexByModule.get(moduleIndex);
		for (const functionInfo of moduleInfo.functions.values()) {
			const functionIndex = makeFunctionIndex(functions.length);
			functionsByName?.set(functionInfo.name, functionIndex);
			moduleFunctionIndices.push(functionIndex);
			functions.push({
				calls: [],
				column: functionInfo.column,
				declared: functionInfo.declared,
				direct: functionInfo.direct,
				filePath: functionInfo.filePath,
				forwardsTransformedCapabilities: functionInfo.forwardsTransformedCapabilities,
				index: functionIndex,
				line: functionInfo.line,
				moduleIndex,
				name: functionInfo.name,
				provideChecks: functionInfo.provideChecks,
				unsupportedReasons: functionInfo.unsupportedReasons,
			});
		}
		const module = modules[moduleIndex];
		if (module != null) {
			modules[moduleIndex] = { ...module, functions: moduleFunctionIndices };
		}
	}

	for (const [functionPosition, functionInfo] of functions.entries()) {
		const moduleInfo = moduleInfos[functionInfo.moduleIndex];
		if (moduleInfo == null) {
			continue;
		}
		const calls = Array.from(moduleInfo.functions.get(functionInfo.name)?.calls ?? [])
			.sort((left, right) => left.calleeName.localeCompare(right.calleeName))
			.map((call) => {
				const target = resolveArenaCallee(
					loader,
					modules,
					moduleIndexByPath,
					functionIndexByModule,
					functionInfo.moduleIndex,
					call.calleeName,
				);
				if (target == null) {
					return call;
				}
				return { ...call, target };
			});
		functions[functionPosition] = { ...functionInfo, calls };
	}

	return { functions, modules };
}

function resolveArenaCallee(
	loader: ModuleLoader,
	modules: readonly ArenaModule[],
	moduleIndexByPath: ReadonlyMap<string, ModuleIndex>,
	functionIndexByModule: ReadonlyMap<ModuleIndex, ReadonlyMap<string, FunctionIndex>>,
	moduleIndex: ModuleIndex,
	calleeName: string,
): FunctionIndex | null {
	const local = functionIndexByModule.get(moduleIndex)?.get(calleeName);
	if (local != null) {
		return local;
	}
	const moduleInfo = modules[moduleIndex];
	const imported = moduleInfo?.imports.get(calleeName);
	if (moduleInfo == null || imported == null) {
		return null;
	}
	const resolvedPath = loader.resolveImport(moduleInfo.filePath, imported.source);
	if (resolvedPath == null) {
		return null;
	}
	const importedModuleIndex = moduleIndexByPath.get(resolvedPath);
	if (importedModuleIndex == null) {
		return null;
	}
	return functionIndexByModule.get(importedModuleIndex)?.get(imported.importedName) ?? null;
}

function makeModuleIndex(position: number): ModuleIndex {
	// oxlint-disable-next-line local/no-type-assertion
	return position as ModuleIndex;
}

function makeFunctionIndex(position: number): FunctionIndex {
	// oxlint-disable-next-line local/no-type-assertion
	return position as FunctionIndex;
}
