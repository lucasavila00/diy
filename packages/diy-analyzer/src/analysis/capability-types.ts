import {
	SyntaxKind,
	isExpression,
	isParenthesizedTypeNode,
	isTypeReferenceNode,
	skipOuterExpressions,
} from "typescript/unstable/ast";
import type {
	CallExpression,
	Expression,
	Identifier,
	Node,
	TypeNode,
} from "typescript/unstable/ast";
import { SignatureKind, TypeFlags } from "typescript/unstable/sync";
import type {
	Checker,
	Signature,
	StringLiteralType,
	Symbol as TsgoSymbol,
	Type,
} from "typescript/unstable/sync";

import { literalText, staticName, typeReferenceArguments } from "./ast-utils.ts";
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
	return isDiyCapabilitiesResolvedType(type);
}

export function isDiyCapabilitiesAnnotation(
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): boolean {
	return capabilitiesAnnotationTypeNode(sourceFile, typeNode) != null;
}

function capabilitiesAnnotationTypeNode(
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): TypeNode | undefined {
	const resolved = resolveCapabilitiesAnnotationTypeNode(sourceFile, typeNode, new Set());
	return resolved != null && typeReferenceArguments(resolved).length > 0 ? resolved : undefined;
}

export function declaredParameterType(
	checker: Checker,
	parameterName: Node,
	parameterSymbol: TsgoSymbol,
): Type | undefined {
	// For declared parameter types, ask the checker for the binding's type. In
	// external-project states, type-node locations can report contextual value
	// types such as Promise instead of the annotation's declared type.
	return (
		checker.getTypeOfSymbolAtLocation(parameterSymbol, parameterName) ??
		checker.getTypeAtLocation(parameterName)
	);
}

function isPublicId(name: string): boolean {
	return !name.includes("@") && name !== "__type";
}

export function isNeverCapabilitiesType(
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): boolean {
	return firstCapabilityTypeArgument(sourceFile, typeNode)?.kind === SyntaxKind.NeverKeyword;
}

export function isOpaqueCapabilitiesType(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): boolean {
	const firstTypeArgument = firstCapabilityTypeArgument(sourceFile, typeNode);
	if (firstTypeArgument == null) {
		return false;
	}
	const type = checker.getTypeFromTypeNode(firstTypeArgument);
	return type != null && (type.flags & TypeFlags.TypeParameter) !== 0;
}

export function isOpenCapabilityBagType(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): boolean {
	const firstTypeArgument = firstCapabilityTypeArgument(sourceFile, typeNode);
	/* c8 ignore next -- parsed Capabilities declarations have a type argument here. */
	if (firstTypeArgument == null) {
		return false;
	}
	const type = checker.getTypeFromTypeNode(firstTypeArgument);
	/* c8 ignore next -- tsgo resolves type arguments for parsed Capabilities declarations. */
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

function firstCapabilityTypeArgument(
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): TypeNode | undefined {
	const directCapabilitiesNode = capabilitiesAnnotationTypeNode(sourceFile, typeNode);
	return directCapabilitiesNode == null
		? undefined
		: typeReferenceArguments(directCapabilitiesNode)[0];
}

function resolveCapabilitiesAnnotationTypeNode(
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
	seenAliases: Set<string>,
): TypeNode | undefined {
	const unwrapped = unwrapTypeNode(typeNode);
	if (isImportedDiyCapabilitiesTypeReference(sourceFile, unwrapped)) {
		return unwrapped;
	}
	const aliasName = typeReferenceName(unwrapped);
	if (aliasName == null || seenAliases.has(aliasName)) {
		return undefined;
	}
	const aliasType = sourceFile.typeAliases.get(aliasName);
	if (aliasType == null) {
		return undefined;
	}
	seenAliases.add(aliasName);
	return resolveCapabilitiesAnnotationTypeNode(sourceFile, aliasType, seenAliases);
}

function unwrapTypeNode(typeNode: TypeNode): TypeNode {
	return isParenthesizedTypeNode(typeNode) ? unwrapTypeNode(typeNode.type) : typeNode;
}

function typeReferenceName(typeNode: TypeNode): string | null {
	return isTypeReferenceNode(typeNode) ? staticName(typeNode.typeName) : null;
}

function isImportedDiyCapabilitiesTypeReference(
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): boolean {
	const name = typeReferenceName(typeNode);
	const imported = name == null ? null : sourceFile.imports.get(name);
	return imported?.importedName === "Capabilities" && diyImportSources.has(imported.source);
}

function isDiyCapabilitiesResolvedType(type: Type): boolean {
	return hasDiyCapabilitiesDeclaration(type);
}

function hasDiyCapabilitiesDeclaration(type: Type | undefined): boolean {
	return (
		type?.getSymbol()?.declarations.some((declaration) => {
			const normalized = declaration.path.replaceAll("\\", "/");
			const isCapabilitiesFile =
				normalized.endsWith("/capabilities.ts") || normalized.endsWith("/capabilities.d.ts");
			/* c8 ignore next -- fixtures resolve DIY through the local packages path. */
			return (
				isCapabilitiesFile &&
				(normalized.includes("/packages/diy/") || normalized.includes("/node_modules/@beff/diy/"))
			);
		}) ?? false
	);
}

export function isImportedCapabilitiesValue(
	sourceFile: AnalyzedSourceFile,
	node: Expression,
): boolean {
	const name = staticName(node);
	const imported = name == null ? null : sourceFile.imports.get(name);
	return imported?.importedName === "Capabilities" && diyImportSources.has(imported.source);
}

export function expressionSymbol(checker: Checker, expression: Expression): TsgoSymbol | undefined {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.kind === SyntaxKind.Identifier) {
		return checker.getResolvedSymbol(unwrapped as Identifier);
	}
	return checker.getSymbolAtLocation(unwrapped);
}

export function sameSymbol(left: TsgoSymbol | undefined, right: TsgoSymbol): boolean {
	return left?.id === right.id;
}

export function symbolId(symbol: TsgoSymbol | undefined): number | undefined {
	return symbol?.id;
}

export function unwrapExpression(expression: Expression): Expression {
	const unwrapped = skipOuterExpressions(expression);
	/* c8 ignore next -- skipOuterExpressions preserves expressions for analyzer inputs. */
	return isExpression(unwrapped) ? unwrapped : expression;
}

export function staticStringExpression(checker: Checker, expression: Expression): string | null {
	const literal = literalText(expression);
	if (literal != null) {
		return literal;
	}
	const type = checker.getTypeAtLocation(expression);
	if (type != null && (type.flags & TypeFlags.StringLiteral) !== 0) {
		return (type as StringLiteralType).value;
	}
	return null;
}

export function resolveCallSignature(checker: Checker, node: CallExpression): Signature | undefined {
	const type = checker.getTypeAtLocation(unwrapExpression(node.expression));
	/* c8 ignore next -- the checker returns a type for parsed call expression callees. */
	if (type == null) {
		return undefined;
	}
	return checker.getSignaturesOfType(type, SignatureKind.Call)[0];
}

export function expressionType(checker: Checker, expression: Expression): Type | undefined {
	return checker.getTypeAtLocation(unwrapExpression(expression));
}

export function isUnresolvedForwardingParameter(parameterType: Type | undefined): boolean {
	return parameterType == null || (parameterType.flags & TypeFlags.Any) !== 0;
}
