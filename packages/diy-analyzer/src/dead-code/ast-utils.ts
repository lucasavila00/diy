import { SyntaxKind } from "@typescript/native-preview/unstable/ast";
import type { FunctionLikeDeclaration, Node } from "@typescript/native-preview/unstable/ast";

export function literalText(node: Node): string | null {
	if (
		node.kind === SyntaxKind.StringLiteral ||
		node.kind === SyntaxKind.NoSubstitutionTemplateLiteral
	) {
		/* c8 ignore next -- tsgo literal nodes expose text for these literal kinds. */
		return (node as unknown as Record<string, string | undefined>).text ?? null;
	}
	return null;
}

export function staticName(node: unknown): string | null {
	if (node == null || typeof node !== "object") {
		return null;
	}
	const value = node as Record<string, unknown>;
	if (typeof value.text === "string") {
		return value.text;
	}
	if (typeof value.name === "object") {
		return staticName(value.name);
	}
	return null;
}

export function isFunctionLike(node: Node): node is FunctionLikeDeclaration {
	return (
		node.kind === SyntaxKind.FunctionDeclaration ||
		node.kind === SyntaxKind.FunctionExpression ||
		node.kind === SyntaxKind.ArrowFunction ||
		node.kind === SyntaxKind.MethodDeclaration
	);
}

export function nodeKey(node: Node): string {
	return `${node.getSourceFile().fileName}:${node.pos}:${node.end}:${node.kind}`;
}

export function lineStarts(source: string): readonly number[] {
	const starts = [0];
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (char === "\n") {
			starts.push(index + 1);
		}
	}
	return starts;
}

export function locationForOffset(
	starts: readonly number[],
	offset: number,
): { readonly column: number; readonly line: number } {
	let low = 0;
	let high = starts.length - 1;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		/* c8 ignore next -- middle is always within the starts array bounds. */
		const start = starts[middle] ?? 0;
		if (start <= offset) {
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	const lineIndex = Math.max(0, high);
	return {
		/* c8 ignore next -- lineIndex is derived from a non-empty starts array. */
		column: offset - (starts[lineIndex] ?? 0) + 1,
		line: lineIndex + 1,
	};
}

export function sorted(values: Iterable<string>): readonly string[] {
	return Array.from(values).sort();
}

export function sortedDifference(
	values: ReadonlySet<string>,
	excluded: ReadonlySet<string>,
): readonly string[] {
	return Array.from(values)
		.filter((value) => !excluded.has(value))
		.sort();
}
