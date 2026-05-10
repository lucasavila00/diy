import {
	getArray,
	getLiteralString,
	getNode,
	getTypeArguments,
	getTypeName,
} from "../frontend/ast.ts";
import type { ModuleLoader } from "../frontend/module-loader.ts";
import type { ImportedBinding } from "../frontend/types.ts";
import type { TypeResolution } from "./types.ts";

type CapabilityModule = {
	readonly aliases: Map<string, unknown>;
	readonly filePath: string;
	readonly imports: Map<string, ImportedBinding>;
};

type MutableTypeResolution = {
	readonly ids: Set<string>;
	readonly reasons: Set<string>;
	resolving: boolean;
};

type CapabilityResolutionContext = {
	readonly aliases: Map<string, MutableTypeResolution>;
};

export function resolveCapabilityIds(
	loader: ModuleLoader,
	moduleInfo: CapabilityModule,
	typeNode: unknown,
	_stack: readonly string[] = [],
): TypeResolution {
	const context: CapabilityResolutionContext = { aliases: new Map() };
	return freezeResolution(resolveCapabilityIdsInner(context, loader, moduleInfo, typeNode));
}

function resolveCapabilityIdsInner(
	context: CapabilityResolutionContext,
	loader: ModuleLoader,
	moduleInfo: CapabilityModule,
	typeNode: unknown,
): MutableTypeResolution {
	const node = getNode(typeNode);
	if (node == null) {
		return makeResolution([], ["missing type node"]);
	}
	if (node.type === "TSParenthesizedType") {
		return resolveCapabilityIdsInner(context, loader, moduleInfo, node["typeAnnotation"]);
	}
	if (node.type === "TSUnionType") {
		const resolution = makeResolution();
		for (const child of getArray(node["types"])) {
			mergeResolution(resolution, resolveCapabilityIdsInner(context, loader, moduleInfo, child));
		}
		return resolution;
	}
	if (node.type !== "TSTypeReference") {
		return makeResolution([], [`unsupported capability type ${node.type}`]);
	}
	const typeName = getTypeName(node);
	if (typeName == null) {
		return makeResolution([], ["unsupported qualified type reference"]);
	}
	const typeArguments = getTypeArguments(node);
	if (typeName === "Capability") {
		const id = getTokenCapabilityId(typeArguments[0]);
		return id == null
			? makeResolution([], ["Capability first type argument is not a string literal"])
			: makeResolution([id]);
	}
	if (typeName === "Exclude") {
		const included = resolveCapabilityIdsInner(context, loader, moduleInfo, typeArguments[0]);
		const excluded = resolveCapabilityIdsInner(context, loader, moduleInfo, typeArguments[1]);
		const ids = new Set(included.ids);
		for (const id of excluded.ids) {
			ids.delete(id);
		}
		return makeResolution(ids, new Set([...included.reasons, ...excluded.reasons]));
	}
	const localAlias = moduleInfo.aliases.get(typeName);
	if (localAlias != null) {
		return resolveAlias(context, loader, moduleInfo, typeName, localAlias);
	}
	const imported = moduleInfo.imports.get(typeName);
	if (imported == null) {
		return makeResolution([], [`unresolved capability alias ${typeName}`]);
	}
	const importedModule = loader.allModules().find((candidate) => {
		const resolvedImport = loader.resolveImport(moduleInfo.filePath, imported.source);
		return resolvedImport === candidate.filePath;
	});
	if (importedModule == null) {
		const resolvedPath = loader.resolveImport(moduleInfo.filePath, imported.source);
		return makeResolution(
			[],
			[
				resolvedPath == null
					? `unresolved import ${imported.source}`
					: `import ${imported.source} was not loaded before resolving ${typeName}`,
			],
		);
	}
	const alias = importedModule.aliases.get(imported.importedName);
	if (alias == null) {
		return makeResolution([], [`unresolved imported capability alias ${typeName}`]);
	}
	return resolveAlias(context, loader, importedModule, imported.importedName, alias);
}

function resolveAlias(
	context: CapabilityResolutionContext,
	loader: ModuleLoader,
	moduleInfo: CapabilityModule,
	typeName: string,
	alias: unknown,
): MutableTypeResolution {
	const key = `${moduleInfo.filePath}:${typeName}`;
	const existing = context.aliases.get(key);
	if (existing != null) {
		return existing;
	}
	const placeholder = makeResolution();
	placeholder.resolving = true;
	context.aliases.set(key, placeholder);

	let changed = true;
	while (changed) {
		const beforeIds = placeholder.ids.size;
		const beforeReasons = placeholder.reasons.size;
		mergeResolution(placeholder, resolveCapabilityIdsInner(context, loader, moduleInfo, alias));
		changed = beforeIds !== placeholder.ids.size || beforeReasons !== placeholder.reasons.size;
	}
	placeholder.resolving = false;
	return placeholder;
}

function makeResolution(
	ids: Iterable<string> = [],
	reasons: Iterable<string> = [],
): MutableTypeResolution {
	return { ids: new Set(ids), reasons: new Set(reasons), resolving: false };
}

function mergeResolution(target: MutableTypeResolution, source: MutableTypeResolution): void {
	for (const id of source.ids) {
		target.ids.add(id);
	}
	for (const reason of source.reasons) {
		target.reasons.add(reason);
	}
}

function freezeResolution(resolution: MutableTypeResolution): TypeResolution {
	return {
		ids: new Set(resolution.ids),
		reasons: Array.from(resolution.reasons).sort(),
	};
}

function getTokenCapabilityId(typeNode: unknown): string | null {
	const node = getNode(typeNode);
	if (node?.type !== "TSLiteralType") {
		return null;
	}
	return getLiteralString(node["literal"]);
}
