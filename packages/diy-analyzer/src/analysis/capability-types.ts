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

import { literalText, nodeTokenStart, staticName, typeReferenceArguments } from "./ast-utils.ts";
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
	if (typeNode.kind === SyntaxKind.ParenthesizedType) {
		const inner = (typeNode as unknown as { readonly type?: TypeNode }).type;
		/* c8 ignore next -- parsed parenthesized type nodes expose their inner type. */
		return inner == null ? typeNode : unwrapTypeNode(inner);
	}
	return typeNode;
}

function typeReferenceName(typeNode: TypeNode): string | null {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return null;
	}
	return staticName((typeNode as unknown as { readonly typeName?: unknown }).typeName);
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
	return hasDiyCapabilitiesDeclaration(type) || hasDiyCapabilitiesDeclaration(targetType(type));
}

function targetType(type: Type): Type | undefined {
	try {
		return (type as Type & { readonly getTarget?: () => Type }).getTarget?.();
	} catch {
		return undefined;
	}
}

function hasDiyCapabilitiesDeclaration(type: Type | undefined): boolean {
	const symbol = (
		type as (Type & { readonly getSymbol?: () => TsgoSymbol | undefined }) | undefined
	)?.getSymbol?.();
	return (
		symbol?.declarations?.some((declaration) => {
			const filePath = declarationFilePath(declaration);
			/* c8 ignore next -- tsgo symbol declarations expose source paths. */
			if (filePath == null) {
				return false;
			}
			const normalized = filePath.replaceAll("\\", "/");
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

function declarationFilePath(declaration: unknown): string | null {
	/* c8 ignore next -- callers pass tsgo declaration objects. */
	if (declaration == null || typeof declaration !== "object") {
		return null;
	}
	const path = (declaration as { readonly path?: unknown }).path;
	/* c8 ignore next -- tsgo symbol declarations expose source paths. */
	if (typeof path === "string") {
		return path;
	}
	/* c8 ignore next -- tsgo symbol declarations expose source paths. */
	return null;
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

export function symbolId(symbol: TsgoSymbol | undefined): string | number | undefined {
	return typeof symbol?.id === "number" || typeof symbol?.id === "string" ? symbol.id : undefined;
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
	const value = (type as (Type & { readonly value?: unknown }) | undefined)?.value;
	if (type != null && (type.flags & TypeFlags.StringLiteral) !== 0 && typeof value === "string") {
		return value;
	}
	return null;
}

export function resolveCallSignature(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	node: CallExpression,
): Signature | undefined {
	const expression = unwrapExpression(node.expression);
	return callSignature(checker, sourceFile, expression);
}

function callSignature(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	expression: Expression,
): Signature | undefined {
	const type = callableExpressionType(checker, sourceFile, expression);
	if (type == null) {
		return undefined;
	}
	return checker.getSignaturesOfType(type, SignatureKind.Call)[0];
}

export function expressionType(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	expression: Expression,
): Type | undefined {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.kind === SyntaxKind.CallExpression) {
		const signature = resolveCallSignature(checker, sourceFile, unwrapped as CallExpression);
		/* c8 ignore next -- call expressions used for capability values have signatures. */
		if (signature != null) {
			return checker.getReturnTypeOfSignature(signature);
		}
	}
	return checker.getTypeAtLocation(unwrapped);
}

function callableExpressionType(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	expression: Expression,
): Type | undefined {
	if (expression.kind === SyntaxKind.Identifier) {
		const position = nodeTokenStart(sourceFile.sourceFile.text, expression);
		return position == null ? undefined : checker.getTypeAtPosition(sourceFile.filePath, position);
	}
	if (expression.kind !== SyntaxKind.PropertyAccessExpression) {
		return checker.getTypeAtLocation(expression);
	}
	const name = (expression as PropertyAccessExpression).name;
	if (name.kind === SyntaxKind.PrivateIdentifier) {
		return checker.getTypeAtLocation(expression);
	}
	// Named callees are queried at the selected name token. Full ranges include
	// trivia and, for property accesses, can resolve to the object-side type
	// instead of the callable symbol in native external-project analysis.
	const position = nodeTokenStart(sourceFile.sourceFile.text, name);
	return position == null ? undefined : checker.getTypeAtPosition(sourceFile.filePath, position);
}

export function isUnresolvedForwardingParameter(parameterType: Type | undefined): boolean {
	return parameterType == null || (parameterType.flags & TypeFlags.Any) !== 0;
}
