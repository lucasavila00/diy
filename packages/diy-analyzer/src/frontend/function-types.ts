import {
	getArray,
	getIdentifierName,
	getNode,
	getParamType,
	getTypeArguments,
	getTypeName,
} from "./ast.ts";
import { hasLocalTypeAlias, resolveLocalTypeAlias } from "./scoped-aliases.ts";
import type { AstNode, ModuleInfo } from "./types.ts";

export type FunctionTypeFirstParamInfo = {
	readonly opaqueTypeNames: ReadonlySet<string>;
	readonly type: unknown;
};

export function getContextualFunctionType(parent: AstNode | null): unknown | null {
	if (parent?.type !== "VariableDeclarator") {
		return null;
	}
	const id = getNode(parent["id"]);
	const annotation = getNode(id?.["typeAnnotation"]);
	return annotation?.["typeAnnotation"] ?? null;
}

export function getFunctionTypeFirstParamType(
	moduleInfo: ModuleInfo,
	typeNode: unknown,
	namespaceName: string | null = null,
): unknown | null {
	return getFunctionTypeFirstParamInfo(moduleInfo, typeNode, namespaceName)?.type ?? null;
}

export function getFunctionTypeFirstParamInfo(
	moduleInfo: ModuleInfo,
	typeNode: unknown,
	namespaceName: string | null = null,
): FunctionTypeFirstParamInfo | null {
	return getFunctionTypeFirstParamInfoInner(moduleInfo, typeNode, namespaceName, [], new Set());
}

function getFunctionTypeFirstParamInfoInner(
	moduleInfo: ModuleInfo,
	typeNode: unknown,
	namespaceName: string | null,
	seen: readonly string[],
	opaqueTypeNames: ReadonlySet<string>,
): FunctionTypeFirstParamInfo | null {
	const node = getNode(typeNode);
	if (node == null) {
		return null;
	}
	if (node.type === "TSParenthesizedType") {
		return getFunctionTypeFirstParamInfoInner(
			moduleInfo,
			node["typeAnnotation"],
			namespaceName,
			seen,
			opaqueTypeNames,
		);
	}
	if (node.type === "TSFunctionType") {
		return {
			opaqueTypeNames,
			type: getParamType(getNode(getArray(node["params"])[0])),
		};
	}
	if (node.type !== "TSTypeReference") {
		return null;
	}
	const typeName = getTypeName(node);
	if (typeName == null) {
		return null;
	}
	const localAlias = resolveLocalTypeAlias(moduleInfo, typeName, namespaceName);
	if (localAlias == null) {
		return null;
	}
	const key = `${moduleInfo.filePath}:${localAlias.namespaceName ?? ""}:${typeName}`;
	if (seen.includes(key)) {
		return null;
	}
	const typeArguments = getTypeArguments(node);
	const aliasParameters = localAlias.typeParameters;
	const substitutions = new Map<string, unknown>();
	const contextualOpaqueTypeNames = new Set(opaqueTypeNames);
	for (const [index, parameter] of aliasParameters.entries()) {
		const typeArgument = typeArguments[index];
		/* c8 ignore next -- contextual aliases in fixtures provide their type arguments. */
		if (typeArgument == null) {
			continue;
		}
		substitutions.set(parameter.name, typeArgument);
		if (isCapabilityConstraint(moduleInfo, parameter.constraint, localAlias.namespaceName, [])) {
			for (const opaqueName of unresolvedTypeReferenceNames(
				moduleInfo,
				typeArgument,
				namespaceName,
			)) {
				contextualOpaqueTypeNames.add(opaqueName);
			}
		}
	}
	return getFunctionTypeFirstParamInfoInner(
		moduleInfo,
		substituteTypeParameters(localAlias.type, substitutions),
		localAlias.namespaceName,
		[...seen, key],
		contextualOpaqueTypeNames,
	);
}

function substituteTypeParameters(
	value: unknown,
	substitutions: ReadonlyMap<string, unknown>,
): unknown {
	if (substitutions.size === 0) {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => substituteTypeParameters(item, substitutions));
	}
	const node = getNode(value);
	if (node == null) {
		return value;
	}
	const typeName = node.type === "TSTypeReference" ? getTypeName(node) : null;
	if (typeName != null && getTypeArguments(node).length === 0) {
		const replacement = substitutions.get(typeName);
		/* c8 ignore next -- substitutions only replace matching type-parameter references. */
		if (replacement != null) {
			return replacement;
		}
	}
	const next: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(node)) {
		next[key] = substituteTypeParameters(child, substitutions);
	}
	return next;
}

function isCapabilityConstraint(
	moduleInfo: ModuleInfo,
	typeNode: unknown,
	namespaceName: string | null,
	seen: readonly string[],
): boolean {
	const node = getNode(typeNode);
	if (node == null) {
		return false;
	}
	/* c8 ignore next -- formatter removes parenthesized generic constraints in fixtures. */
	if (node.type === "TSParenthesizedType") {
		return isCapabilityConstraint(moduleInfo, node["typeAnnotation"], namespaceName, seen);
	}
	/* c8 ignore next -- non-reference generic constraints are treated as non-capability bounds. */
	if (node.type !== "TSTypeReference") {
		return false;
	}
	const typeName = getTypeName(node);
	/* c8 ignore next -- qualified constraints are treated as non-capability bounds. */
	if (typeName == null) {
		return false;
	}
	if (typeName === "Capability") {
		return true;
	}
	const localAlias = resolveLocalTypeAlias(moduleInfo, typeName, namespaceName);
	/* c8 ignore next -- unresolved constraints are treated as non-capability bounds. */
	if (localAlias == null) {
		return false;
	}
	const key = `${moduleInfo.filePath}:${localAlias.namespaceName ?? ""}:${typeName}`;
	/* c8 ignore next -- recursive constraints are treated as non-capability bounds. */
	if (seen.includes(key)) {
		return false;
	}
	return isCapabilityConstraint(moduleInfo, localAlias.type, localAlias.namespaceName, [
		...seen,
		key,
	]);
}

function unresolvedTypeReferenceNames(
	moduleInfo: ModuleInfo,
	typeNode: unknown,
	namespaceName: string | null,
): ReadonlySet<string> {
	const names = new Set<string>();
	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) {
				visit(item);
			}
			return;
		}
		const node = getNode(value);
		if (node == null) {
			return;
		}
		if (node.type === "TSTypeReference") {
			const name = getIdentifierName(node["typeName"]);
			if (
				name != null &&
				name !== "Capability" &&
				name !== "Capabilities" &&
				name !== "Exclude" &&
				!hasLocalTypeAlias(moduleInfo, name, namespaceName) &&
				!moduleInfo.imports.has(name)
			) {
				names.add(name);
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === "type" || key === "start" || key === "end") {
				continue;
			}
			visit(child);
		}
	};
	visit(typeNode);
	return names;
}
