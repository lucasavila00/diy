import {
	SyntaxKind,
	isExpression,
	isImportTypeNode,
	isParenthesizedTypeNode,
	isQualifiedName,
	isTypeAliasDeclaration,
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
import { SignatureKind, SymbolFlags, TypeFlags } from "typescript/unstable/async";
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
	return new Set(properties.map((property) => property.name).filter(isPublicId));
}

export async function isCapabilitiesType(checker: Checker, type: Type): Promise<boolean> {
	return hasDiyCapabilitiesDeclaration(type);
}

export async function isDiyCapabilitiesAnnotation(
	checker: Checker,
	typeNode: TypeNode,
): Promise<boolean> {
	return (await capabilitiesAnnotationTypeNode(checker, typeNode)) != null;
}

async function capabilitiesAnnotationTypeNode(
	checker: Checker,
	typeNode: TypeNode,
): Promise<TypeNode | undefined> {
	const resolved = await resolveCapabilitiesAnnotationTypeNode(checker, typeNode, new Set());
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

function isPublicId(name: string): boolean {
	return !name.includes("@") && name !== "__type";
}

export async function isNeverCapabilitiesType(
	checker: Checker,
	typeNode: TypeNode,
): Promise<boolean> {
	return (await firstCapabilityTypeArgument(checker, typeNode))?.kind === SyntaxKind.NeverKeyword;
}

export async function isOpaqueCapabilitiesType(
	checker: Checker,
	typeNode: TypeNode,
): Promise<boolean> {
	const firstTypeArgument = await firstCapabilityTypeArgument(checker, typeNode);
	if (firstTypeArgument == null) {
		return false;
	}
	const type = await checker.getTypeFromTypeNode(firstTypeArgument);
	return type != null && (type.flags & TypeFlags.TypeParameter) !== 0;
}

export async function isOpenCapabilityBagType(
	checker: Checker,
	typeNode: TypeNode,
): Promise<boolean> {
	const firstTypeArgument = await firstCapabilityTypeArgument(checker, typeNode);
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

async function firstCapabilityTypeArgument(
	checker: Checker,
	typeNode: TypeNode,
): Promise<TypeNode | undefined> {
	const directCapabilitiesNode = await capabilitiesAnnotationTypeNode(checker, typeNode);
	return directCapabilitiesNode == null
		? undefined
		: typeReferenceArguments(directCapabilitiesNode)[0];
}

// Follow the annotation through the checker: imports, re-exports, `import("...")` types,
// and type aliases resolve by symbol, so scoping and cross-module aliases match TypeScript.
async function resolveCapabilitiesAnnotationTypeNode(
	checker: Checker,
	typeNode: TypeNode,
	seenAliases: Set<number>,
): Promise<TypeNode | undefined> {
	const unwrapped = unwrapTypeNode(typeNode);
	const nameNode = typeReferenceNameNode(unwrapped);
	const symbol = nameNode == null ? undefined : await checker.getSymbolAtLocation(nameNode);
	if (symbol == null) {
		return undefined;
	}
	const target =
		(symbol.flags & SymbolFlags.Alias) === 0 ? symbol : await checker.getAliasedSymbol(symbol);
	if (target.name === "Capabilities" && isDiyCapabilitiesDeclaration(target)) {
		return unwrapped;
	}
	const declaration = target.declarations[0];
	if (
		declaration == null ||
		declaration.kind !== SyntaxKind.TypeAliasDeclaration ||
		seenAliases.has(target.id)
	) {
		return undefined;
	}
	seenAliases.add(target.id);
	const aliasDeclaration = await declaration.resolve();
	/* c8 ignore next -- type alias symbol declarations resolve to type alias nodes. */
	if (aliasDeclaration == null || !isTypeAliasDeclaration(aliasDeclaration)) {
		return undefined;
	}
	return resolveCapabilitiesAnnotationTypeNode(checker, aliasDeclaration.type, seenAliases);
}

function unwrapTypeNode(typeNode: TypeNode): TypeNode {
	return isParenthesizedTypeNode(typeNode) ? unwrapTypeNode(typeNode.type) : typeNode;
}

function typeReferenceNameNode(typeNode: TypeNode): Node | undefined {
	const name = isTypeReferenceNode(typeNode)
		? typeNode.typeName
		: isImportTypeNode(typeNode)
			? typeNode.qualifier
			: undefined;
	return name != null && isQualifiedName(name) ? name.right : name;
}

function isDiyCapabilitiesDeclaration(symbol: TsgoSymbol): boolean {
	return symbol.declarations.some((declaration) => {
		const normalized = declaration.path.replaceAll("\\", "/");
		const isCapabilitiesFile =
			normalized.endsWith("/capabilities.ts") || normalized.endsWith("/capabilities.d.ts");
		/* c8 ignore next -- fixtures resolve DIY through the local packages path. */
		return (
			isCapabilitiesFile &&
			(normalized.includes("/packages/diy/") || normalized.includes("/node_modules/@beff/diy/"))
		);
	});
}

async function hasDiyCapabilitiesDeclaration(type: Type): Promise<boolean> {
	const symbol = await type.getSymbol();
	return symbol != null && isDiyCapabilitiesDeclaration(symbol);
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
	const type = await checker.getTypeAtLocation(unwrapExpression(node.expression));
	/* c8 ignore next -- the checker returns a type for parsed call expression callees. */
	if (type == null) {
		return undefined;
	}
	return (await checker.getSignaturesOfType(type, SignatureKind.Call))[0];
}

export async function expressionType(
	checker: Checker,
	expression: Expression,
): Promise<Type | undefined> {
	return checker.getTypeAtLocation(unwrapExpression(expression));
}

export function isUnresolvedForwardingParameter(parameterType: Type | undefined): boolean {
	return parameterType == null || (parameterType.flags & TypeFlags.Any) !== 0;
}
