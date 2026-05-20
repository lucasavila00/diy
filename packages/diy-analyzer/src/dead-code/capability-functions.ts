import { SyntaxKind } from "@typescript/native-preview/unstable/ast";
import type { FunctionLikeDeclaration, Node } from "@typescript/native-preview/unstable/ast";
import type { Project } from "@typescript/native-preview/unstable/sync";

import { isFunctionLike, locationForOffset, nodeKey, staticName } from "./ast-utils.ts";
import {
	capabilityIds,
	isDiyCapabilitiesType,
	isNeverCapabilitiesType,
	isOpaqueCapabilitiesType,
	isOpenCapabilityBagType,
} from "./capability-types.ts";
import type {
	AnalyzedCapabilityFunction,
	AnalyzedSourceFile,
	UnsupportedAnalysisReason,
} from "./native-types.ts";
import { locationForNode, scanFunctionBody } from "./usage-scanner.ts";

export function collectAnalyzedCapabilityFunctions(
	project: Project,
	sourceFiles: readonly AnalyzedSourceFile[],
): readonly AnalyzedCapabilityFunction[] {
	const functions: AnalyzedCapabilityFunction[] = [];
	for (const sourceFile of sourceFiles) {
		collectFunctionsFromSourceFile(project, sourceFile, functions);
	}
	for (const analyzedFunction of functions) {
		scanFunctionBody(project, analyzedFunction);
	}
	return functions.sort(compareAnalyzedCapabilityFunctions);
}

function collectFunctionsFromSourceFile(
	project: Project,
	sourceFile: AnalyzedSourceFile,
	functions: AnalyzedCapabilityFunction[],
): void {
	const namespaceStack: string[] = [];
	const visit = (node: Node, ownerName: string | null): void => {
		if (node.kind === SyntaxKind.ModuleDeclaration) {
			const name = staticName((node as unknown as Record<string, unknown>)["name"]);
			/* c8 ignore next -- parsed namespace declarations have a static name. */
			if (name != null) {
				namespaceStack.push(name);
				node.forEachChild((child) => visit(child, ownerName));
				namespaceStack.pop();
				return;
			}
		}
		const nextOwnerName = childOwnerName(node, ownerName);
		if (isFunctionLike(node)) {
			const analyzedFunction = readAnalyzedCapabilityFunction(
				project,
				sourceFile,
				node,
				nextOwnerName,
				namespaceStack,
			);
			if (analyzedFunction != null) {
				functions.push(analyzedFunction);
			}
		}
		node.forEachChild((child) => visit(child, nextOwnerName));
	};
	visit(sourceFile.sourceFile, null);
}

function readAnalyzedCapabilityFunction(
	project: Project,
	sourceFile: AnalyzedSourceFile,
	node: FunctionLikeDeclaration,
	ownerName: string | null,
	namespaceStack: readonly string[],
): AnalyzedCapabilityFunction | null {
	const firstParam = node.parameters[0];
	if (firstParam == null || firstParam.type == null) {
		return null;
	}
	if (!isDiyCapabilitiesType(sourceFile, firstParam.type)) {
		return null;
	}
	const parameterSymbol = project.checker.getSymbolAtLocation(firstParam.name);
	/* c8 ignore next -- tsgo provides symbols for declared parameters. */
	if (parameterSymbol == null) {
		return null;
	}
	const declaredType = project.checker.getTypeFromTypeNode(firstParam.type);
	/* c8 ignore next -- tsgo resolves parsed Capabilities annotations to a type. */
	const declaredCapabilityIds =
		declaredType == null ? new Set<string>() : capabilityIds(project.checker, declaredType);
	const isGenericDeclaration = isOpaqueCapabilitiesType(project.checker, firstParam.type);
	const location = functionLocation(sourceFile, node);
	const localName = functionName(sourceFile, node, ownerName);
	const name = namespaceStack.length === 0 ? localName : `${namespaceStack.join(".")}.${localName}`;
	const unsupportedReasons: UnsupportedAnalysisReason[] = [];
	if (
		declaredCapabilityIds.size === 0 &&
		!isGenericDeclaration &&
		!isNeverCapabilitiesType(firstParam.type)
	) {
		unsupportedReasons.push({
			kind: isOpenCapabilityBagType(project.checker, firstParam.type)
				? "open-capability-bag"
				: "unresolved-declaration",
		});
	}
	return {
		column: location.column,
		declaredCapabilityIds,
		directCapabilityIds: new Set(),
		filePath: sourceFile.filePath,
		forwardedUses: [],
		id: nodeKey(node),
		isGenericDeclaration,
		isReportable: sourceFile.reportable,
		line: location.line,
		name,
		/* c8 ignore next -- parsed parameter names have a static name. */
		parameterName: staticName(firstParam.name) ?? "",
		parameterSymbol,
		propagatedCapabilitySources: new Map(),
		providerChecks: [],
		sourceFile,
		unsupportedReasons,
	};
}

function functionName(
	sourceFile: AnalyzedSourceFile,
	node: FunctionLikeDeclaration,
	ownerName: string | null,
): string {
	const named = staticName((node as unknown as Record<string, unknown>).name);
	/* c8 ignore next -- owner-name handling is shared across methods, arrows, and function expressions. */
	if (
		ownerName != null &&
		(node.kind === SyntaxKind.MethodDeclaration ||
			node.kind === SyntaxKind.ArrowFunction ||
			node.kind === SyntaxKind.FunctionExpression)
	) {
		return ownerName;
	}
	if (named != null) {
		return named;
	}
	/* c8 ignore next -- anonymous function expressions with owner names return above. */
	if (ownerName != null) {
		return ownerName;
	}
	const location = locationForNode(sourceFile, node);
	return `<anonymous>@${location.line}:${location.column}`;
}

function childOwnerName(node: Node, ownerName: string | null): string | null {
	if (node.kind === SyntaxKind.VariableDeclaration) {
		/* c8 ignore next -- variable declarations without static names keep the current owner. */
		return staticName((node as unknown as Record<string, unknown>).name) ?? ownerName;
	}
	if (node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression) {
		/* c8 ignore next -- anonymous classes keep the current owner name. */
		return staticName((node as unknown as Record<string, unknown>).name) ?? ownerName;
	}
	if (node.kind === SyntaxKind.PropertyAssignment || node.kind === SyntaxKind.MethodDeclaration) {
		const name = staticName((node as unknown as Record<string, unknown>).name);
		return name == null ? ownerName : ownerName == null ? name : `${ownerName}.${name}`;
	}
	return ownerName;
}

function functionLocation(
	sourceFile: AnalyzedSourceFile,
	node: FunctionLikeDeclaration,
): { readonly column: number; readonly line: number } {
	const text = sourceFile.sourceFile.text.slice(node.pos, node.end);
	const keywordIndex = text.search(/\b(function|async)\b|[A-Za-z_$][\w$]*\s*:/);
	/* c8 ignore next -- supported function-like syntax has a keyword or owner label. */
	const offset = keywordIndex < 0 ? node.pos : node.pos + keywordIndex;
	return locationForOffset(sourceFile.lineStarts, offset);
}

export function compareAnalyzedCapabilityFunctions(
	left: AnalyzedCapabilityFunction,
	right: AnalyzedCapabilityFunction,
): number {
	/* c8 ignore next -- later operands are deterministic tie-break plumbing. */
	return (
		left.filePath.localeCompare(right.filePath) ||
		left.line - right.line ||
		left.column - right.column ||
		left.name.localeCompare(right.name)
	);
}
