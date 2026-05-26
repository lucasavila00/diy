import {
	SyntaxKind,
	isExpression,
	skipOuterExpressions,
} from "@typescript/native-preview/unstable/ast";
import type {
	CallExpression,
	Expression,
	Identifier,
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

export function resolvedDiyCapabilitiesType(
	checker: Checker,
	typeNode: TypeNode,
): Type | undefined {
	for (const type of capabilityTypeCandidates(checker, typeNode)) {
		if (type != null && isDiyCapabilitiesResolvedType(type)) {
			return type;
		}
	}
	return undefined;
}

function isPublicId(name: string): boolean {
	return !name.includes("@") && name !== "__type";
}

export function isNeverCapabilitiesType(typeNode: TypeNode): boolean {
	return firstCapabilityTypeArgument(typeNode)?.kind === SyntaxKind.NeverKeyword;
}

export function isOpaqueCapabilitiesType(checker: Checker, typeNode: TypeNode): boolean {
	const firstTypeArgument = firstCapabilityTypeArgument(typeNode);
	if (firstTypeArgument == null) {
		return false;
	}
	const type = checker.getTypeFromTypeNode(firstTypeArgument);
	return type != null && (type.flags & TypeFlags.TypeParameter) !== 0;
}

export function isOpenCapabilityBagType(checker: Checker, typeNode: TypeNode): boolean {
	const firstTypeArgument = firstCapabilityTypeArgument(typeNode);
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

function firstCapabilityTypeArgument(typeNode: TypeNode): TypeNode | undefined {
	return typeReferenceArguments(typeNode)[0];
}

function capabilityTypeCandidates(
	checker: Checker,
	typeNode: TypeNode,
): readonly (Type | undefined)[] {
	// Type annotations can expose their imported alias from the TypeNode and
	// their instantiated mapped type from the node location. Both are semantic
	// checker results, and resolvedDiyCapabilitiesType validates the declaration
	// path before accepting either candidate. The location type is only relevant
	// for annotations that are syntactically `Capabilities<...>`; using it for
	// unrelated annotations can read contextual function parameter state.
	return isCapabilitiesTypeReference(typeNode)
		? [checker.getTypeFromTypeNode(typeNode), checker.getTypeAtLocation(typeNode)]
		: [checker.getTypeFromTypeNode(typeNode)];
}

function isCapabilitiesTypeReference(typeNode: TypeNode): boolean {
	return (
		staticName((typeNode as unknown as { readonly typeName?: unknown }).typeName) === "Capabilities"
	);
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
	node: CallExpression,
): Signature | undefined {
	const expression = unwrapExpression(node.expression);
	const signature = callSignature(checker, expression);
	if (signature != null || expression.kind !== SyntaxKind.PropertyAccessExpression) {
		return signature;
	}
	return callSignature(checker, (expression as PropertyAccessExpression).name);
}

function callSignature(checker: Checker, expression: Expression): Signature | undefined {
	return checker.getSignaturesOfType(checker.getTypeAtLocation(expression)!, SignatureKind.Call)[0];
}

export function expressionType(checker: Checker, expression: Expression): Type | undefined {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.kind === SyntaxKind.CallExpression) {
		// WORKAROUND: see WORKAROUNDS.md. tsgo currently reports private call expressions
		// as callable types, so use the signature return type for call expression values.
		const signature = resolveCallSignature(checker, unwrapped as CallExpression);
		/* c8 ignore next -- call expressions used for capability values have signatures. */
		if (signature != null) {
			return checker.getReturnTypeOfSignature(signature);
		}
	}
	return checker.getTypeAtLocation(unwrapped);
}

export function isUnresolvedForwardingParameter(parameterType: Type | undefined): boolean {
	return parameterType == null || (parameterType.flags & TypeFlags.Any) !== 0;
}
