import type { ModuleLoader } from "../frontend/module-loader.ts";
import type {
	CapabilitiesProvideCheck,
	ImportedBinding,
	ModuleInfo,
	UnsupportedReason,
} from "../frontend/types.ts";
import { resolveCapabilityIds } from "./capabilities.ts";
import type { TypeResolutionReason } from "./types.ts";

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
	readonly lineStarts: readonly number[];
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
			lineStarts: moduleInfo.lineStarts,
			reportable: moduleInfo.reportable,
		});
	}

	for (const [modulePosition, moduleInfo] of moduleInfos.entries()) {
		const moduleIndex = moduleIndices[modulePosition];
		/* c8 ignore next -- module indices are created from the same moduleInfos array. */
		if (moduleIndex == null) {
			continue;
		}
		const moduleFunctionIndices: FunctionIndex[] = [];
		const functionsByName = functionIndexByModule.get(moduleIndex);
		for (const functionInfo of moduleInfo.functions.values()) {
			const declared = resolveCapabilityIds(loader, moduleInfo, functionInfo.declaredType, []);
			const functionIndex = makeFunctionIndex(functions.length);
			functionsByName?.set(functionInfo.name, functionIndex);
			moduleFunctionIndices.push(functionIndex);
			functions.push({
				calls: [],
				column: functionInfo.column,
				declared: declared.ids,
				direct: functionInfo.direct,
				filePath: functionInfo.filePath,
				forwardsTransformedCapabilities: functionInfo.forwardsTransformedCapabilities,
				index: functionIndex,
				line: functionInfo.line,
				moduleIndex,
				name: functionInfo.name,
				provideChecks: functionInfo.provideChecks,
				unsupportedReasons: [
					...declared.reasons.map(makeCapabilityResolutionReason),
					...functionInfo.unsupportedReasons,
				],
			});
		}
		const module = modules[moduleIndex];
		/* c8 ignore next -- moduleIndex is created from modules.length in this same pass. */
		if (module != null) {
			modules[moduleIndex] = { ...module, functions: moduleFunctionIndices };
		}
	}

	for (const [functionPosition, functionInfo] of functions.entries()) {
		const moduleInfo = moduleInfos[functionInfo.moduleIndex];
		/* c8 ignore next -- function moduleIndex is assigned from moduleInfos positions. */
		if (moduleInfo == null) {
			continue;
		}
		/* c8 ignore next -- functions in the arena are backed by source function metadata. */
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
	/* c8 ignore next -- unresolved imports are reported before graph resolution matters. */
	if (resolvedPath == null) {
		return null;
	}
	const importedModuleIndex = moduleIndexByPath.get(resolvedPath);
	/* c8 ignore next -- resolved imports point at modules in the arena. */
	if (importedModuleIndex == null) {
		return null;
	}
	/* c8 ignore next -- resolved imported functions are present in the module function index. */
	return functionIndexByModule.get(importedModuleIndex)?.get(imported.importedName) ?? null;
}

function makeCapabilityResolutionReason(reason: TypeResolutionReason): UnsupportedReason {
	const unsupported: {
		column?: number;
		filePath?: string;
		kind: "capability-resolution";
		line?: number;
		message: string;
		notes?: readonly { readonly kind: "help" | "note"; readonly message: string }[];
	} = {
		kind: "capability-resolution",
		message: reason.message,
	};
	/* c8 ignore next -- capability resolution reasons include a column. */
	if (reason.column != null) {
		unsupported.column = reason.column;
	}
	/* c8 ignore next -- capability resolution reasons include a source file. */
	if (reason.filePath != null) {
		unsupported.filePath = reason.filePath;
	}
	/* c8 ignore next -- capability resolution reasons include a line. */
	if (reason.line != null) {
		unsupported.line = reason.line;
	}
	if (reason.notes != null) {
		unsupported.notes = reason.notes;
	}
	return unsupported;
}

function makeModuleIndex(position: number): ModuleIndex {
	// oxlint-disable-next-line local/no-type-assertion
	return position as ModuleIndex;
}

function makeFunctionIndex(position: number): FunctionIndex {
	// oxlint-disable-next-line local/no-type-assertion
	return position as FunctionIndex;
}
