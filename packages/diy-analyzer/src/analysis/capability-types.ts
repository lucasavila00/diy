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
import { TypeFlags } from "typescript/unstable/async";
import type {
	Checker,
	Signature,
	StringLiteralType,
	Symbol as TsgoSymbol,
	Type,
} from "typescript/unstable/async";

import { literalText, staticName, typeReferenceArguments } from "./ast-utils.ts";
import type { AnalyzedSourceFile } from "./native-types.ts";
import { diyImportSources } from "./native-types.ts";

export async function capabilityIds(checker: Checker, type: Type): Promise<ReadonlySet<string>> {
	const properties = await checker.getPropertiesOfType(type);
	return new Set(properties.filter(isPublicId).map((property) => property.name));
}

export async function isCapabilitiesType(checker: Checker, type: Type): Promise<boolean> {
	return hasDiyCapabilitiesDeclaration(type);
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

export async function declaredParameterType(
	checker: Checker,
	parameterName: Node,
	parameterSymbol: TsgoSymbol,
): Promise<Type | undefined> {
	// For declared parameter types, ask the checker for the binding's type. In
	// external-project states, type-node locations can report contextual value
	// types such as Promise instead of the annotation's declared type.
	return (
		(await checker.getTypeOfSymbolAtLocation(parameterSymbol, parameterName)) ??
		(await checker.getTypeAtLocation(parameterName))
	);
}

// TypeScript escapes user names that start with "__" by adding another "_", so an
// escaped name that starts with exactly "__" is internal: symbol-keyed members
// ("__@capabilityId@10"), private members ("__#1@#name"), and names like "__type".
function isPublicId(property: TsgoSymbol): boolean {
	return !property.escapedName.startsWith("__") || property.escapedName.startsWith("___");
}

export function isNeverCapabilitiesType(
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): boolean {
	return firstCapabilityTypeArgument(sourceFile, typeNode)?.kind === SyntaxKind.NeverKeyword;
}

export async function isOpaqueCapabilitiesType(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): Promise<boolean> {
	const firstTypeArgument = firstCapabilityTypeArgument(sourceFile, typeNode);
	if (firstTypeArgument == null) {
		return false;
	}
	const type = await checker.getTypeFromTypeNode(firstTypeArgument);
	return type != null && (type.flags & TypeFlags.TypeParameter) !== 0;
}

export async function isOpenCapabilityBagType(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): Promise<boolean> {
	const firstTypeArgument = firstCapabilityTypeArgument(sourceFile, typeNode);
	/* c8 ignore next -- parsed Capabilities declarations have a type argument here. */
	if (firstTypeArgument == null) {
		return false;
	}
	const type = await checker.getTypeFromTypeNode(firstTypeArgument);
	/* c8 ignore next -- tsgo resolves type arguments for parsed Capabilities declarations. */
	if (type == null) {
		return false;
	}
	for (const property of await checker.getPropertiesOfType(type)) {
		if (!property.name.includes("capabilityId")) {
			continue;
		}
		const propertyType = await checker.getTypeOfSymbolAtLocation(property, firstTypeArgument);
		/* c8 ignore next -- capabilityId members of unresolved capability bags are typed as string. */
		if (propertyType != null && (await checker.typeToString(propertyType)) === "string") {
			return true;
		}
	}
	return false;
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

async function hasDiyCapabilitiesDeclaration(type: Type): Promise<boolean> {
	return (
		(await type.getSymbol())?.declarations.some((declaration) => {
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

export async function expressionSymbol(
	checker: Checker,
	expression: Expression,
): Promise<TsgoSymbol | undefined> {
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

export async function staticStringExpression(
	checker: Checker,
	expression: Expression,
): Promise<string | null> {
	const literal = literalText(expression);
	if (literal != null) {
		return literal;
	}
	const type = await checker.getTypeAtLocation(expression);
	if (type != null && (type.flags & TypeFlags.StringLiteral) !== 0) {
		return (type as StringLiteralType).value;
	}
	return null;
}

export async function resolveCallSignature(
	checker: Checker,
	node: CallExpression,
): Promise<Signature | undefined> {
	return checker.getResolvedSignature(node);
}

export async function expressionType(
	checker: Checker,
	expression: Expression,
): Promise<Type | undefined> {
	return checker.getTypeAtLocation(unwrapExpression(expression));
}
