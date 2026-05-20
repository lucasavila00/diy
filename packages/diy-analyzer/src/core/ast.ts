import type { AstNode } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value != null;
}

function isNode(value: unknown): value is AstNode {
	return isRecord(value) && typeof value["type"] === "string";
}

export function getArray(value: unknown): readonly unknown[] {
	/* c8 ignore next -- callers pass parser arrays or absent parser fields. */
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
	/* c8 ignore next -- callers pass literal nodes when requesting literal text. */
	if (record?.type !== "Literal") {
		return null;
	}
	return getString(record["value"]);
}

export function getTypeName(node: AstNode): string | null {
	const typeName = getNode(node["typeName"]);
	/* c8 ignore next -- callers pass parser-backed type references. */
	if (typeName?.type !== "Identifier") {
		return null;
	}
	return getIdentifierName(typeName);
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

function lineForOffset(lineStarts: readonly number[], offset: number | undefined): number {
	/* c8 ignore next -- callers pass offsets from parser nodes except defensive fallbacks. */
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
		/* c8 ignore next -- callers pass offsets from parser nodes except defensive fallbacks. */
		column: offset == null ? 1 : offset - lineStart + 1,
		line,
	};
}

export function getFunctionName(node: AstNode, parent: AstNode | null): string | null {
	const idName = getIdentifierName(node["id"]);
	if (idName != null) {
		return idName;
	}
	/* c8 ignore next -- covered by variable-declared function fixtures when emitted by parser. */
	if (parent?.type === "VariableDeclarator") {
		return getIdentifierName(parent["id"]);
	}
	return null;
}

export function isCapabilitiesType(typeNode: unknown): typeNode is AstNode {
	const node = getNode(typeNode);
	return node?.type === "TSTypeReference" && getTypeName(node) === "Capabilities";
}
