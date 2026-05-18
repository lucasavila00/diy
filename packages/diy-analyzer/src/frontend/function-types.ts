import { getArray, getNode, getParamType, getTypeName } from "./ast.ts";
import type { AstNode, ModuleInfo } from "./types.ts";

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
): unknown | null {
	return getFunctionTypeFirstParamTypeInner(moduleInfo, typeNode, []);
}

function getFunctionTypeFirstParamTypeInner(
	moduleInfo: ModuleInfo,
	typeNode: unknown,
	seen: readonly string[],
): unknown | null {
	const node = getNode(typeNode);
	if (node == null) {
		return null;
	}
	if (node.type === "TSParenthesizedType") {
		return getFunctionTypeFirstParamTypeInner(moduleInfo, node["typeAnnotation"], seen);
	}
	if (node.type === "TSFunctionType") {
		return getParamType(getNode(getArray(node["params"])[0]));
	}
	if (node.type !== "TSTypeReference") {
		return null;
	}
	const typeName = getTypeName(node);
	if (typeName == null) {
		return null;
	}
	const localAlias = moduleInfo.aliases.get(typeName);
	if (localAlias == null) {
		return null;
	}
	const key = `${moduleInfo.filePath}:${typeName}`;
	if (seen.includes(key)) {
		return null;
	}
	return getFunctionTypeFirstParamTypeInner(moduleInfo, localAlias, [...seen, key]);
}
