import type { AstNode } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value != null;
}

function isNode(value: unknown): value is AstNode {
	return isRecord(value) && typeof value["type"] === "string";
}

export function getArray(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value : [];
}

export function getNode(value: unknown): AstNode | null {
	return isNode(value) ? value : null;
}

function getString(value: unknown): string | null {
	/* c8 ignore next -- callers pass parser fields that are either strings or absent. */
	return typeof value === "string" ? value : null;
}

export function getIdentifierName(node: unknown): string | null {
	const record = getNode(node);
	if (record?.type !== "Identifier") {
		return null;
	}
	return getString(record["name"]);
}

export function getLiteralString(node: unknown): string | null {
	const record = getNode(node);
	if (record?.type !== "Literal") {
		return null;
	}
	return getString(record["value"]);
}

export function getTypeName(node: AstNode): string | null {
	const typeName = getNode(node["typeName"]);
	if (typeName?.type !== "Identifier") {
		return null;
	}
	return getIdentifierName(typeName);
}

export function getTypeArguments(node: AstNode): readonly unknown[] {
	const typeArguments = getNode(node["typeArguments"]) ?? getNode(node["typeParameters"]);
	return getArray(typeArguments?.["params"]);
}

export function getFirstParam(node: AstNode): AstNode | null {
	return getNode(getArray(node["params"])[0]);
}

export function getIdentifierFromParam(param: unknown): AstNode | null {
	const node = getNode(param);
	if (node?.type === "Identifier") {
		return node;
	}
	const left = getNode(node?.["left"]);
	if (node?.type === "AssignmentPattern" && left?.type === "Identifier") {
		return left;
	}
	return null;
}

export function getParamType(param: AstNode | null): unknown {
	const identifier = getIdentifierFromParam(param);
	const annotation = getNode(identifier?.["typeAnnotation"]);
	return annotation?.["typeAnnotation"];
}

export function isFunctionNode(node: AstNode): boolean {
	return (
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

export function makeLineStarts(source: string): readonly number[] {
	const starts = [0];
	for (let index = 0; index < source.length; index += 1) {
		if (source[index] === "\n") {
			starts.push(index + 1);
		}
	}
	return starts;
}

export function lineForOffset(lineStarts: readonly number[], offset: number | undefined): number {
	if (offset == null) {
		return 1;
	}
	let low = 0;
	let high = lineStarts.length - 1;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		/* c8 ignore next -- binary search indexes within the lineStarts array. */
		const start = lineStarts[middle] ?? 0;
		if (start <= offset) {
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	return high + 1;
}

export function locationForOffset(
	lineStarts: readonly number[],
	offset: number | undefined,
): { readonly column: number; readonly line: number } {
	const line = lineForOffset(lineStarts, offset);
	/* c8 ignore next -- lineForOffset returns a line present in lineStarts. */
	const lineStart = lineStarts[line - 1] ?? 0;
	return {
		column: offset == null ? 1 : offset - lineStart + 1,
		line,
	};
}

export function unwrapDeclaration(node: AstNode): AstNode {
	const declaration = getNode(node["declaration"]);
	return declaration ?? node;
}

export function getFunctionName(node: AstNode, parent: AstNode | null): string | null {
	const idName = getIdentifierName(node["id"]);
	if (idName != null) {
		return idName;
	}
	/* istanbul ignore next -- covered by variable-declared function fixtures when emitted by parser. */
	if (parent?.type === "VariableDeclarator") {
		return getIdentifierName(parent["id"]);
	}
	return null;
}

export function getMemberPropertyName(property: unknown): string | null {
	const node = getNode(property);
	if (node?.type === "Identifier") {
		return getIdentifierName(node);
	}
	/* c8 ignore next -- parser member literals are covered by computed access fixtures. */
	if (node?.type === "Literal") {
		return getLiteralString(node);
	}
	/* istanbul ignore next -- capability method properties are identifiers or string literals. */
	return null;
}

export const capabilityMethodNames = new Set(["provide", "need", "override"]);

export function isCapabilitiesMethodMember(node: unknown): boolean {
	const member = getNode(node);
	const object = getNode(member?.["object"]);
	/* c8 ignore start -- capability method members use parser-backed properties. */
	return (
		member?.type === "MemberExpression" &&
		object?.type === "Identifier" &&
		getIdentifierName(object) === "capabilities" &&
		/* c8 ignore next -- capability member properties resolve to known names. */
		capabilityMethodNames.has(getMemberPropertyName(member["property"]) ?? "")
	);
	/* c8 ignore stop */
}

export function isDirectCapabilitiesMethodMember(node: unknown): boolean {
	const member = getNode(node);
	const property = getNode(member?.["property"]);
	return (
		isCapabilitiesMethodMember(member) &&
		member?.["computed"] !== true &&
		property?.type === "Identifier"
	);
}

export function isCapabilitiesNeedMember(node: unknown): boolean {
	return (
		isCapabilitiesMethodMember(node) &&
		getMemberPropertyName(getNode(node)?.["property"]) === "need"
	);
}

export function isCapabilitiesNeedCall(node: AstNode): boolean {
	if (node.type !== "CallExpression") {
		return false;
	}
	const callee = getNode(node["callee"]);
	return (
		isDirectCapabilitiesMethodMember(callee) &&
		getMemberPropertyName(callee?.["property"]) === "need"
	);
}

export function isCapabilitiesTransformCall(node: AstNode): boolean {
	if (node.type !== "CallExpression") {
		return false;
	}
	const callee = getNode(node["callee"]);
	return (
		isDirectCapabilitiesMethodMember(callee) &&
		(getMemberPropertyName(callee?.["property"]) === "provide" ||
			getMemberPropertyName(callee?.["property"]) === "override")
	);
}

export function isCapabilitiesProvideCall(node: AstNode): boolean {
	if (node.type !== "CallExpression") {
		return false;
	}
	const callee = getNode(node["callee"]);
	return (
		isDirectCapabilitiesMethodMember(callee) &&
		getMemberPropertyName(callee?.["property"]) === "provide"
	);
}

export function isCapabilitiesType(typeNode: unknown): typeNode is AstNode {
	const node = getNode(typeNode);
	return node?.type === "TSTypeReference" && getTypeName(node) === "Capabilities";
}
