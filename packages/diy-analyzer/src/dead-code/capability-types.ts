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

import { literalText, staticName, typeReferenceArguments, typeReferenceName } from "./ast-utils.ts";
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
	sourceFile: AnalyzedSourceFile,
	typeNode: TypeNode,
): Type | undefined {
	const type = checker.getTypeFromTypeNode(typeNode);
	/* c8 ignore next -- tsgo resolves parsed type annotations in analyzer inputs. */
	if (type == null) {
		return undefined;
	}
	if (isDiyCapabilitiesResolvedType(type)) {
		return type;
	}
	return isDiyCapabilitiesType(sourceFile, typeNode) ? type : undefined;
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

function isDiyCapabilitiesType(sourceFile: AnalyzedSourceFile, typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return false;
	}
	const typeName = typeReferenceName(typeNode);
	/* c8 ignore next -- TypeReference nodes always have a typeName. */
	if (typeName == null) {
		return false;
	}
	const parts = entityNameParts(typeName);
	if (parts.length === 1) {
		const local = parts[0];
		/* c8 ignore next -- entityNameParts returns concrete string segments. */
		const imported = local == null ? null : sourceFile.imports.get(local);
		return imported?.importedName === "Capabilities" && diyImportSources.has(imported.source);
	}
	if (parts.length === 2 && parts[1] === "Capabilities") {
		const root = parts[0];
		/* c8 ignore next -- entityNameParts returns concrete string segments. */
		const imported = root == null ? null : sourceFile.imports.get(root);
		return imported?.kind === "namespace" && diyImportSources.has(imported.source);
	}
	return false;
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

function entityNameParts(node: Node): readonly string[] {
	if (node.kind === SyntaxKind.Identifier) {
		return [(node as Identifier).text];
	}
	/* c8 ignore next -- TypeReference.typeName is always an Identifier or QualifiedName. */
	if (node.kind !== SyntaxKind.QualifiedName) {
		return [];
	}
	const record = node as unknown as Record<string, Node | undefined>;
	/* c8 ignore next -- QualifiedName nodes always have left and right children. */
	if (record.left == null || record.right == null) {
		return [];
	}
	return [...entityNameParts(record.left), ...entityNameParts(record.right)];
}

export function expressionSymbol(checker: Checker, expression: Expression): TsgoSymbol | undefined {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.kind === SyntaxKind.Identifier) {
		/* c8 ignore next -- resolved symbols are available for identifiers in analyzed source. */
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
	const type = callableType(checker, node.expression);
	/* c8 ignore next -- parsed call expressions have callable types in tsgo projects. */
	return type == null ? undefined : checker.getSignaturesOfType(type, SignatureKind.Call)[0];
}

function callableType(checker: Checker, callee: Expression): Type | undefined {
	const expression = unwrapExpression(callee);
	if (expression.kind !== SyntaxKind.CallExpression) {
		return checker.getTypeAtLocation(callableTypeLocation(expression));
	}
	return expressionType(checker, expression as CallExpression);
}

function callableTypeLocation(expression: Expression): Expression {
	if (expression.kind === SyntaxKind.PropertyAccessExpression) {
		return (expression as PropertyAccessExpression).name;
	}
	return expression;
}

export function expressionType(checker: Checker, expression: Expression): Type | undefined {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.kind === SyntaxKind.CallExpression) {
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
