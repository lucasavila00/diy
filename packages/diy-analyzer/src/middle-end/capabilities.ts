import {
	getArray,
	getIdentifierName,
	getLiteralString,
	getNode,
	getTypeArguments,
	getTypeName,
	locationForOffset,
} from "../frontend/ast.ts";
import type { ModuleLoader } from "../frontend/module-loader.ts";
import { resolveStringConstantName } from "../frontend/string-constants.ts";
import type { StringConstantModule } from "../frontend/string-constants.ts";
import type { ImportedBinding } from "../frontend/types.ts";
import type { TypeResolution, TypeResolutionReason } from "./types.ts";

type CapabilityModule = StringConstantModule & {
	readonly aliases: Map<string, unknown>;
	readonly filePath: string;
	readonly imports: Map<string, ImportedBinding>;
	readonly lineStarts: readonly number[];
};

type MutableTypeResolution = {
	readonly ids: Set<string>;
	readonly reasons: TypeResolutionReason[];
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
	/* c8 ignore next -- syntax rules reject Capabilities without a type argument before resolution. */
	if (node == null) {
		return makeResolution([], [makeReason(moduleInfo, null, "missing type node")]);
	}
	/* c8 ignore next -- formatter removes parenthesized type aliases in fixtures. */
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
		return makeResolution(
			[],
			[makeReason(moduleInfo, node, `unsupported capability type ${node.type}`)],
		);
	}
	const typeName = getTypeName(node);
	if (typeName == null) {
		return makeResolution(
			[],
			[makeReason(moduleInfo, node, "unsupported qualified type reference")],
		);
	}
	const typeArguments = getTypeArguments(node);
	if (typeName === "Capability") {
		const id = getCapabilityId(loader, moduleInfo, typeArguments[0]);
		return id == null
			? makeResolution([], [makeReason(moduleInfo, node, capabilityIdNotStringConstantMessage)])
			: makeResolution([id]);
	}
	if (typeName === "Exclude") {
		const included = resolveCapabilityIdsInner(context, loader, moduleInfo, typeArguments[0]);
		const excluded = resolveCapabilityIdsInner(context, loader, moduleInfo, typeArguments[1]);
		const ids = new Set(included.ids);
		for (const id of excluded.ids) {
			ids.delete(id);
		}
		return makeResolution(ids, [...included.reasons, ...excluded.reasons]);
	}
	const localAlias = moduleInfo.aliases.get(typeName);
	if (localAlias != null) {
		return resolveAlias(context, loader, moduleInfo, typeName, localAlias);
	}
	const imported = moduleInfo.imports.get(typeName);
	if (imported == null) {
		return makeResolution(
			[],
			[makeReason(moduleInfo, node, `unresolved capability alias ${typeName}`)],
		);
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
				makeReason(
					moduleInfo,
					node,
					/* c8 ignore next -- dependency loading prevents resolved-but-unloaded imports. */
					resolvedPath == null
						? `unresolved import ${imported.source}`
						: `import ${imported.source} was not loaded before resolving ${typeName}`,
				),
			],
		);
	}
	const alias = importedModule.aliases.get(imported.importedName);
	if (alias == null) {
		return makeResolution(
			[],
			[makeReason(moduleInfo, node, `unresolved imported capability alias ${typeName}`)],
		);
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
		const beforeReasons = placeholder.reasons.length;
		mergeResolution(placeholder, resolveCapabilityIdsInner(context, loader, moduleInfo, alias));
		changed = beforeIds !== placeholder.ids.size || beforeReasons !== placeholder.reasons.length;
	}
	placeholder.resolving = false;
	return placeholder;
}

function makeResolution(
	ids: Iterable<string> = [],
	reasons: Iterable<TypeResolutionReason> = [],
): MutableTypeResolution {
	return { ids: new Set(ids), reasons: Array.from(reasons), resolving: false };
}

function mergeResolution(target: MutableTypeResolution, source: MutableTypeResolution): void {
	for (const id of source.ids) {
		target.ids.add(id);
	}
	for (const reason of source.reasons) {
		if (!target.reasons.some((existing) => sameReason(existing, reason))) {
			target.reasons.push(reason);
		}
	}
}

function freezeResolution(resolution: MutableTypeResolution): TypeResolution {
	return {
		ids: new Set(resolution.ids),
		reasons: Array.from(resolution.reasons).sort(compareReasons),
	};
}

function makeReason(
	moduleInfo: CapabilityModule,
	node: unknown,
	message: string,
): TypeResolutionReason {
	const location = locationForOffset(moduleInfo.lineStarts, getNode(node)?.start);
	return {
		column: location.column,
		filePath: moduleInfo.filePath,
		line: location.line,
		message,
		...(message === capabilityIdNotStringConstantMessage
			? {
					notes: [
						{
							kind: "help" as const,
							message:
								'use a string literal or const reference, for example `Capability<"appClock", Clock>` or `Capability<typeof CLOCK_ID, Clock>`',
						},
					],
				}
			: {}),
	};
}

function sameReason(left: TypeResolutionReason, right: TypeResolutionReason): boolean {
	return (
		left.filePath === right.filePath &&
		left.line === right.line &&
		left.column === right.column &&
		left.message === right.message
	);
}

function compareReasons(left: TypeResolutionReason, right: TypeResolutionReason): number {
	/* c8 ignore next -- sorting is deterministic fallback behavior. */
	return (
		(left.filePath ?? "").localeCompare(right.filePath ?? "") ||
		(left.line ?? 0) - (right.line ?? 0) ||
		(left.column ?? 0) - (right.column ?? 0) ||
		left.message.localeCompare(right.message)
	);
}

function getCapabilityId(
	loader: ModuleLoader,
	moduleInfo: CapabilityModule,
	typeNode: unknown,
): string | null {
	const node = getNode(typeNode);
	if (node?.type === "TSLiteralType") {
		return getLiteralString(node["literal"]);
	}
	if (node?.type === "TSTypeQuery") {
		const name = getIdentifierName(node["exprName"]);
		/* c8 ignore next -- qualified type queries are intentionally unsupported. */
		if (name == null) {
			return null;
		}
		return resolveStringConstantName({ loader, moduleInfo }, name);
	}
	return null;
}

const capabilityIdNotStringConstantMessage =
	"Capability first type argument is not a string literal or typeof string constant";
