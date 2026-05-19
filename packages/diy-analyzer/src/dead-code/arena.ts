import type { ModuleLoader } from "../core/module-loader.ts";
import type { ImportedBinding, ModuleInfo } from "../core/types.ts";
import { resolveCapabilityIds } from "./capabilities.ts";
import type {
	CapabilitiesProvideCheck,
	DeadCodeFactsByPath,
	TypeResolutionReason,
	UnsupportedReason,
} from "./types.ts";

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
	readonly declaredOpaque: boolean;
	readonly direct: ReadonlySet<string>;
	readonly filePath: string;
	readonly forwardsTransformedCapabilities: boolean;
	readonly index: FunctionIndex;
	readonly line: number;
	readonly moduleIndex: ModuleIndex;
	readonly name: string;
	readonly namespaceName: string | null;
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
	factsByPath: DeadCodeFactsByPath,
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
		const facts = factsByPath.get(moduleInfo.filePath);
		/* c8 ignore next -- facts are created for every loaded module before arena construction. */
		for (const functionInfo of facts?.functions.values() ?? []) {
			const declared = resolveCapabilityIds(
				loader,
				moduleInfo,
				functionInfo.declaredType,
				functionInfo.typeParameters,
				functionInfo.namespaceName,
			);
			const functionIndex = makeFunctionIndex(functions.length);
			functionsByName?.set(functionInfo.name, functionIndex);
			moduleFunctionIndices.push(functionIndex);
			functions.push({
				calls: [],
				column: functionInfo.column,
				declared: declared.ids,
				declaredOpaque: declared.opaque,
				direct: functionInfo.direct,
				filePath: functionInfo.filePath,
				forwardsTransformedCapabilities: functionInfo.forwardsTransformedCapabilities,
				index: functionIndex,
				line: functionInfo.line,
				moduleIndex,
				name: functionInfo.name,
				namespaceName: functionInfo.namespaceName,
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
		const calls = Array.from(
			factsByPath.get(moduleInfo.filePath)?.functions.get(functionInfo.name)?.calls ?? [],
		)
			.sort((left, right) => left.calleeName.localeCompare(right.calleeName))
			.map((call) => {
				const target = resolveArenaCallee(
					loader,
					modules,
					moduleIndexByPath,
					functionIndexByModule,
					functionInfo.moduleIndex,
					call.calleeName,
					functionInfo.namespaceName,
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
	callerNamespaceName: string | null,
): FunctionIndex | null {
	const functionsByName = functionIndexByModule.get(moduleIndex);
	const local = functionsByName?.get(calleeName);
	if (local != null) {
		return local;
	}
	const namespaceLocal = resolveNamespaceLocalCallee(
		functionsByName,
		calleeName,
		callerNamespaceName,
	);
	if (namespaceLocal != null) {
		return namespaceLocal;
	}
	const moduleInfo = modules[moduleIndex];
	const importedRoot = splitImportedCallee(calleeName);
	const imported = moduleInfo?.imports.get(importedRoot.name);
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
	const importedFunctionName = resolveImportedFunctionName(imported, importedRoot.memberPath);
	return functionIndexByModule.get(importedModuleIndex)?.get(importedFunctionName) ?? null;
}

function resolveNamespaceLocalCallee(
	functionsByName: ReadonlyMap<string, FunctionIndex> | undefined,
	calleeName: string,
	callerNamespaceName: string | null,
): FunctionIndex | null {
	if (functionsByName == null || callerNamespaceName == null || calleeName.includes(".")) {
		return null;
	}
	const namespaceParts = callerNamespaceName.split(".");
	for (let length = namespaceParts.length; length > 0; length -= 1) {
		const candidateName = `${namespaceParts.slice(0, length).join(".")}.${calleeName}`;
		const candidate = functionsByName.get(candidateName);
		if (candidate != null) {
			return candidate;
		}
	}
	/* c8 ignore next -- unresolved namespace fallbacks are reported as unresolved targets. */
	return null;
}

function splitImportedCallee(calleeName: string): {
	readonly memberPath: string | null;
	readonly name: string;
} {
	const dotIndex = calleeName.indexOf(".");
	if (dotIndex === -1) {
		return { memberPath: null, name: calleeName };
	}
	return {
		memberPath: calleeName.slice(dotIndex + 1),
		name: calleeName.slice(0, dotIndex),
	};
}

function resolveImportedFunctionName(imported: ImportedBinding, memberPath: string | null): string {
	if (imported.kind === "namespace") {
		/* c8 ignore next -- namespace imports are not callable in valid TypeScript. */
		if (memberPath == null) {
			return imported.importedName;
		}
		return memberPath;
	}
	if (memberPath == null) {
		return imported.importedName;
	}
	return `${imported.importedName}.${memberPath}`;
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
