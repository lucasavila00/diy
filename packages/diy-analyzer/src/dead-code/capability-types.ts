/* c8 ignore start -- tsgo/native-preview behavior is covered through CLI fixtures; line coverage on checker fallback branches is not stable enough to be useful. */
import {
	SyntaxKind,
	isExpression,
	skipOuterExpressions,
} from "@typescript/native-preview/unstable/ast";
import type {
	CallExpression,
	Expression,
	Identifier,
	Node,
	PropertyAccessExpression,
	TypeNode,
} from "@typescript/native-preview/unstable/ast";
import { SignatureKind, TypeFlags } from "@typescript/native-preview/unstable/sync";
import type {
	Checker,
	Signature,
	Symbol as TsgoSymbol,
	Type,
} from "@typescript/native-preview/unstable/sync";

import { literalText, staticName } from "./ast-utils.ts";
import type { AnalyzedSourceFile } from "./native-types.ts";
import { diyImportSources } from "./native-types.ts";

export function capabilityIds(checker: Checker, type: Type): ReadonlySet<string> {
	return new Set(
		checker
			.getPropertiesOfType(type)
			.map((property) => property.name)
			.filter(isPublicId),
	);
}

export function isCapabilitiesType(checker: Checker, type: Type): boolean {
	const text = checker.typeToString(type);
	return text === "Capabilities<never>" || text.startsWith("Capabilities<");
}

function isPublicId(name: string): boolean {
	return !name.includes("@") && name !== "__type";
}

export function isNeverCapabilitiesType(typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return false;
	}
	const typeArguments = (typeNode as unknown as Record<string, readonly TypeNode[] | undefined>)
		.typeArguments;
	return typeArguments?.[0]?.kind === SyntaxKind.NeverKeyword;
}

export function isOpaqueCapabilitiesType(checker: Checker, typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return false;
	}
	const typeArguments = (typeNode as unknown as Record<string, readonly TypeNode[] | undefined>)
		.typeArguments;
	const firstTypeArgument = typeArguments?.[0];
	if (firstTypeArgument == null) {
		return false;
	}
	const type = checker.getTypeFromTypeNode(firstTypeArgument);
	return type != null && (type.flags & TypeFlags.TypeParameter) !== 0;
}

export function isOpenCapabilityBagType(checker: Checker, typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return false;
	}
	const typeArguments = (typeNode as unknown as Record<string, readonly TypeNode[] | undefined>)
		.typeArguments;
	const firstTypeArgument = typeArguments?.[0];
	if (firstTypeArgument == null) {
		return false;
	}
	const type = checker.getTypeFromTypeNode(firstTypeArgument);
	if (type == null) {
		return false;
	}
	return checker.getPropertiesOfType(type).some((property) => {
		const propertyType = checker.getTypeOfSymbolAtLocation(property, firstTypeArgument);
		return (
			property.name.includes("capabilityId") &&
			propertyType != null &&
			checker.typeToString(propertyType) === "string"
		);
	});
}

export function isDiyCapabilitiesType(sourceFile: AnalyzedSourceFile, typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return false;
	}
	const typeName = (typeNode as unknown as Record<string, Node | undefined>).typeName;
	if (typeName == null) {
		return false;
	}
	const parts = entityNameParts(typeName);
	if (parts.length === 1) {
		const local = parts[0];
		const imported = local == null ? null : sourceFile.imports.get(local);
		return imported?.importedName === "Capabilities" && diyImportSources.has(imported.source);
	}
	if (parts.length === 2 && parts[1] === "Capabilities") {
		const root = parts[0];
		const imported = root == null ? null : sourceFile.imports.get(root);
		return imported?.kind === "namespace" && diyImportSources.has(imported.source);
	}
	return false;
}

export function isImportedCapabilitiesValue(
	sourceFile: AnalyzedSourceFile,
	node: Expression,
): boolean {
	const name = staticName(node);
	const imported = name == null ? null : sourceFile.imports.get(name);
	return imported?.importedName === "Capabilities" && diyImportSources.has(imported.source);
}

function entityNameParts(node: Node): readonly string[] {
	if (node.kind === SyntaxKind.Identifier) {
		return [(node as Identifier).text];
	}
	if (node.kind !== SyntaxKind.QualifiedName) {
		return [];
	}
	const record = node as unknown as Record<string, Node | undefined>;
	if (record.left == null || record.right == null) {
		return [];
	}
	return [...entityNameParts(record.left), ...entityNameParts(record.right)];
}

export function expressionSymbol(checker: Checker, expression: Expression): TsgoSymbol | undefined {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.kind === SyntaxKind.Identifier) {
		return (
			checker.getResolvedSymbol(unwrapped as Identifier) ?? checker.getSymbolAtLocation(unwrapped)
		);
	}
	return checker.getSymbolAtLocation(unwrapped);
}

export function sameSymbol(left: TsgoSymbol | undefined, right: TsgoSymbol): boolean {
	return left?.id === right.id;
}

export function symbolId(symbol: TsgoSymbol | undefined): string | number | undefined {
	return typeof symbol?.id === "number" || typeof symbol?.id === "string" ? symbol.id : undefined;
}

export function unwrapExpression(expression: Expression): Expression {
	const unwrapped = skipOuterExpressions(expression);
	return isExpression(unwrapped) ? unwrapped : expression;
}

export function staticStringExpression(checker: Checker, expression: Expression): string | null {
	const literal = literalText(expression);
	if (literal != null) {
		return literal;
	}
	const type = checker.getTypeAtLocation(expression);
	const value = (type as (Type & { readonly value?: unknown }) | undefined)?.value;
	if (type != null && (type.flags & TypeFlags.StringLiteral) !== 0 && typeof value === "string") {
		return value;
	}
	return null;
}

export function resolveCallSignature(
	checker: Checker,
	node: CallExpression,
): Signature | undefined {
	try {
		const resolved = checker.getResolvedSignature(node);
		if (resolved != null) {
			const firstParameter = checker.getParameterType(resolved, 0);
			if (
				node.arguments.length > 0 &&
				firstParameter != null &&
				(firstParameter.flags & TypeFlags.Any) !== 0
			) {
				throw new Error("Resolved signature has an `any` parameter.");
			}
			return resolved;
		}
	} catch {
		// Native-preview can currently throw for some valid call expressions. Fall back to the
		// callee type's call signatures, which is enough for capability forwarding.
	}
	const calleeType = checker.getTypeAtLocation(node.expression);
	if (calleeType == null) {
		return callSignatureFromCalleeSymbol(checker, node);
	}
	return (
		checker.getSignaturesOfType(calleeType, SignatureKind.Call)[0] ??
		callSignatureFromCalleeSymbol(checker, node)
	);
}

function callSignatureFromCalleeSymbol(
	checker: Checker,
	node: CallExpression,
): Signature | undefined {
	const expression = unwrapExpression(node.expression);
	const location =
		expression.kind === SyntaxKind.PropertyAccessExpression
			? (expression as PropertyAccessExpression).name
			: expression;
	const symbol =
		location.kind === SyntaxKind.Identifier
			? (checker.getResolvedSymbol(location as Identifier) ?? checker.getSymbolAtLocation(location))
			: checker.getSymbolAtLocation(location);
	const symbolType =
		symbol == null ? undefined : checker.getTypeOfSymbolAtLocation(symbol, location);
	if (symbolType == null) {
		return undefined;
	}
	return checker.getSignaturesOfType(symbolType, SignatureKind.Call)[0];
}

export function expressionType(checker: Checker, expression: Expression): Type | undefined {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.kind === SyntaxKind.CallExpression) {
		const signature = resolveCallSignature(checker, unwrapped as CallExpression);
		if (signature != null) {
			return checker.getReturnTypeOfSignature(signature);
		}
	}
	return checker.getTypeAtLocation(unwrapped);
}

export function isUnresolvedForwardingParameter(parameterType: Type | undefined): boolean {
	return parameterType == null || (parameterType.flags & TypeFlags.Any) !== 0;
}

/* c8 ignore stop */
