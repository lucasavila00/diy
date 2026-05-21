import { SyntaxKind, isExpression } from "@typescript/native-preview/unstable/ast";
import type {
	CallExpression,
	ElementAccessExpression,
	Expression,
	FunctionLikeDeclaration,
	Node,
	PropertyAccessExpression,
} from "@typescript/native-preview/unstable/ast";
import type { Checker, Project, Type } from "@typescript/native-preview/unstable/sync";

import {
	isFunctionLike,
	locationForOffset,
	nodeExpression,
	nodeInitializer,
	nodeName,
	nodeNameNode,
	objectLiteralProperties,
	staticName,
} from "./ast-utils.ts";
import {
	capabilityIds,
	expressionSymbol,
	expressionType,
	isCapabilitiesType,
	isImportedCapabilitiesValue,
	isUnresolvedForwardingParameter,
	resolvedDiyCapabilitiesType,
	resolveCallSignature,
	sameSymbol,
	staticStringExpression,
	symbolId,
	unwrapExpression,
} from "./capability-types.ts";
import type {
	AnalyzedCapabilityFunction,
	AnalyzedSourceFile,
	ForwardedExpression,
} from "./native-types.ts";
import { recordDeadCodeMetric } from "./timing.ts";

type ForwardedArgument = {
	readonly expression: Expression;
	readonly forwarded: ForwardedExpression;
	readonly index: number;
};

export function scanFunctionBody(
	project: Project,
	analyzedFunction: AnalyzedCapabilityFunction,
): void {
	let scannedNodes = 0;
	const visit = (node: Node): void => {
		scannedNodes += 1;
		if (
			node !== analyzedFunction.node &&
			isFunctionLike(node) &&
			hasOwnCapabilitiesBinding(project.checker, node)
		) {
			return;
		}
		if (node.kind === SyntaxKind.ReturnStatement) {
			scanForwardedReturn(project.checker, analyzedFunction, node);
		} else if (node.kind === SyntaxKind.VariableDeclaration) {
			scanPropagatedVariable(project.checker, analyzedFunction, node);
		} else if (node.kind === SyntaxKind.BinaryExpression) {
			scanPropagatedAssignment(project.checker, analyzedFunction, node);
		} else if (node.kind === SyntaxKind.PropertyAccessExpression) {
			scanPropertyAccess(project, analyzedFunction, node as PropertyAccessExpression);
		} else if (node.kind === SyntaxKind.ElementAccessExpression) {
			scanElementAccess(project, analyzedFunction, node as ElementAccessExpression);
		} else if (node.kind === SyntaxKind.CallExpression) {
			scanCall(project, analyzedFunction, node as CallExpression);
		}
		node.forEachChild(visit);
	};
	visit(analyzedFunction.node);
	if (analyzedFunction.isGenericDeclaration && analyzedFunction.directCapabilityIds.size > 0) {
		analyzedFunction.unsupportedReasons.push({ kind: "generic-direct-read" });
	}
	recordDeadCodeMetric("scanned AST nodes", scannedNodes);
}

function scanPropertyAccess(
	project: Project,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: PropertyAccessExpression,
): void {
	const access = capabilityAccess(project.checker, analyzedFunction, node);
	if (access == null) {
		return;
	}
	if (access.id == null) {
		const location = locationForNode(analyzedFunction.sourceFile, node);
		analyzedFunction.unsupportedReasons.push({
			column: location.column,
			kind: "dynamic-capability-access",
			line: location.line,
		});
		return;
	}
	analyzedFunction.directCapabilityIds.add(access.id);
}

function scanElementAccess(
	project: Project,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: ElementAccessExpression,
): void {
	const access = capabilityAccess(project.checker, analyzedFunction, node);
	if (access == null) {
		return;
	}
	if (access.id == null) {
		const location = locationForNode(analyzedFunction.sourceFile, node);
		analyzedFunction.unsupportedReasons.push({
			column: location.column,
			kind: "dynamic-capability-access",
			line: location.line,
		});
		return;
	}
	analyzedFunction.directCapabilityIds.add(access.id);
}

function capabilityAccess(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: PropertyAccessExpression | ElementAccessExpression,
): { readonly id: string | null } | null {
	let firstAccess: PropertyAccessExpression | ElementAccessExpression = node;
	let current = unwrapExpression(accessExpression(node));
	while (
		current.kind === SyntaxKind.PropertyAccessExpression ||
		current.kind === SyntaxKind.ElementAccessExpression
	) {
		firstAccess = current as PropertyAccessExpression | ElementAccessExpression;
		current = unwrapExpression(accessExpression(firstAccess));
	}
	if (capabilitiesSourceExpression(checker, analyzedFunction, current) == null) {
		return null;
	}
	if (firstAccess.kind === SyntaxKind.PropertyAccessExpression) {
		const access = firstAccess as PropertyAccessExpression;
		if (access.name.kind === SyntaxKind.PrivateIdentifier || access.questionDotToken != null) {
			return { id: null };
		}
		return { id: staticName(access.name) };
	}
	const access = firstAccess as ElementAccessExpression;
	if (access.questionDotToken != null) {
		return { id: null };
	}
	return { id: staticStringExpression(checker, access.argumentExpression) };
}

function accessExpression(node: PropertyAccessExpression | ElementAccessExpression): Expression {
	return node.expression;
}

function scanCall(
	project: Project,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: CallExpression,
): void {
	const extendInfo = readCapabilitiesExtend(project.checker, analyzedFunction, node);
	if (extendInfo != null) {
		analyzedFunction.providerChecks.push({
			column: locationForNode(analyzedFunction.sourceFile, node).column,
			extra: extendInfo.extra,
			line: locationForNode(analyzedFunction.sourceFile, node).line,
		});
	}
	if (isCapabilitiesHelperCall(analyzedFunction.sourceFile, node)) {
		return;
	}
	const forwardedArguments: ForwardedArgument[] = [];
	for (const [index, argument] of node.arguments.entries()) {
		const forwarded = forwardedExpression(project.checker, analyzedFunction, argument);
		if (forwarded == null) {
			continue;
		}
		forwardedArguments.push({ expression: argument, forwarded, index });
	}
	if (forwardedArguments.length === 0) {
		return;
	}
	const signature = resolveCallSignature(project.checker, node);
	for (const { expression, forwarded, index } of forwardedArguments) {
		/* c8 ignore next -- forwarded calls without signatures are reported below as unresolved. */
		const parameterType =
			signature == null ? undefined : project.checker.getParameterType(signature, index);
		const argumentType = expressionType(project.checker, expression);
		const requiredFromCallType = forwardedRequiredCapabilities(
			project.checker,
			analyzedFunction,
			forwarded,
			parameterType,
			argumentType,
		);
		if (requiredFromCallType == null) {
			if (
				!analyzedFunction.isGenericDeclaration &&
				isUnresolvedForwardingParameter(parameterType)
			) {
				analyzedFunction.unsupportedReasons.push({ kind: "unresolved-forwarding" });
			}
			continue;
		}
		analyzedFunction.forwardedUses.push({
			provided: forwarded.provided,
			required: requiredFromCallType,
		});
	}
}

function scanForwardedReturn(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: Node,
): void {
	const expression = nodeExpression(node);
	if (expression == null || !isExpression(expression)) {
		return;
	}
	const forwarded = forwardedExpression(checker, analyzedFunction, expression);
	if (forwarded?.usesDeclared === true) {
		addDeclaredRequired(analyzedFunction);
	}
}

function scanPropagatedVariable(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: Node,
): void {
	const initializer = nodeInitializer(node);
	if (initializer == null || !isExpression(initializer)) {
		return;
	}
	const forwarded = forwardedExpression(checker, analyzedFunction, initializer);
	if (forwarded == null) {
		return;
	}
	const name = nodeNameNode(node);
	/* c8 ignore next -- variable declarations always expose a binding name. */
	if (name != null) {
		addPropagatedSource(checker, analyzedFunction, name, forwarded.provided);
	}
}

function scanPropagatedAssignment(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: Node,
): void {
	const record = node as unknown as Record<string, Node | undefined>;
	if (record.operatorToken?.kind !== SyntaxKind.EqualsToken) {
		return;
	}
	const left = record.left;
	const right = record.right;
	/* c8 ignore next -- tsgo binary expressions always expose expression operands. */
	if (left == null || right == null || !isExpression(right)) {
		return;
	}
	const forwarded = forwardedExpression(checker, analyzedFunction, right);
	if (forwarded == null) {
		return;
	}
	addPropagatedSource(checker, analyzedFunction, left, forwarded.provided);
}

function isCapabilitiesHelperCall(sourceFile: AnalyzedSourceFile, node: CallExpression): boolean {
	const expression = node.expression;
	return (
		expression.kind === SyntaxKind.PropertyAccessExpression &&
		isImportedCapabilitiesValue(sourceFile, (expression as PropertyAccessExpression).expression)
	);
}

function readCapabilitiesExtend(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: CallExpression,
): { readonly extra: ReadonlySet<string> } | null {
	const expression = node.expression;
	if (expression.kind !== SyntaxKind.PropertyAccessExpression) {
		return null;
	}
	const callee = expression as PropertyAccessExpression;
	if (
		staticName(callee.name) !== "extend" ||
		!isImportedCapabilitiesValue(analyzedFunction.sourceFile, callee.expression)
	) {
		return null;
	}
	const firstArgument = node.arguments[0];
	if (
		firstArgument == null ||
		capabilitiesSourceExpression(checker, analyzedFunction, firstArgument) == null
	) {
		return null;
	}
	return { extra: providedCapabilityIds(checker, argumentsAfterFirst(node)) };
}

function forwardedExpression(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	argument: Expression,
): ForwardedExpression | null {
	const expression = unwrapExpression(argument);
	const source = capabilitiesSourceExpression(checker, analyzedFunction, expression);
	if (source != null) {
		return source;
	}
	if (expression.kind !== SyntaxKind.CallExpression) {
		return null;
	}
	const call = expression as CallExpression;
	const callee = call.expression;
	if (callee.kind !== SyntaxKind.PropertyAccessExpression) {
		return null;
	}
	const propertyAccess = callee as PropertyAccessExpression;
	const helperName = staticName(propertyAccess.name);
	if (
		!isPropagationHelperName(helperName) ||
		!isImportedCapabilitiesValue(analyzedFunction.sourceFile, propertyAccess.expression)
	) {
		return null;
	}
	const firstArgument = call.arguments[0];
	/* c8 ignore next -- propagation helper calls used as forwarded values pass a source argument. */
	const firstSource =
		firstArgument == null
			? null
			: capabilitiesSourceExpression(checker, analyzedFunction, firstArgument);
	if (firstSource == null) {
		return null;
	}
	const provided = new Set(firstSource.provided);
	if (helperName === "extend" || helperName === "merge") {
		for (const id of providedCapabilityIds(checker, argumentsAfterFirst(call))) {
			provided.add(id);
		}
	}
	return { provided, usesDeclared: true };
}

function forwardedRequiredCapabilities(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	forwarded: ForwardedExpression,
	parameterType: Type | undefined,
	argumentType: Type | undefined,
): ReadonlySet<string> | null {
	const parameterIds =
		parameterType != null && isCapabilitiesType(checker, parameterType)
			? capabilityIds(checker, parameterType)
			: null;
	if (parameterIds != null && parameterIds.size > 0) {
		return parameterIds;
	}
	const argumentIds =
		argumentType != null && isCapabilitiesType(checker, argumentType)
			? capabilityIds(checker, argumentType)
			: null;
	if (parameterIds != null && argumentIds != null && argumentIds.size > 0) {
		return argumentIds;
	}
	if (parameterIds != null && forwarded.usesDeclared) {
		return analyzedFunction.declaredCapabilityIds;
	}
	return null;
}

function providedCapabilityIds(
	checker: Checker,
	expressions: readonly Expression[],
): ReadonlySet<string> {
	const provided = new Set<string>();
	for (const expression of expressions) {
		for (const id of objectLiteralCapabilityIds(expression)) {
			provided.add(id);
		}
		const type = expressionType(checker, expression);
		/* c8 ignore next -- expressions passed to capability helpers have checker types. */
		if (type == null) {
			continue;
		}
		for (const id of capabilityIds(checker, type)) {
			provided.add(id);
		}
	}
	return provided;
}

function objectLiteralCapabilityIds(expression: Expression): ReadonlySet<string> {
	const ids = new Set<string>();
	const unwrapped = unwrapExpression(expression);
	let objectLiteral = unwrapped.kind === SyntaxKind.ObjectLiteralExpression ? unwrapped : null;
	if (unwrapped.kind === SyntaxKind.CallExpression) {
		const call = unwrapped as CallExpression;
		/* c8 ignore next -- capability factory calls in fixtures pass their provider object. */
		objectLiteral = call.arguments[0] ?? null;
	}
	if (objectLiteral == null || objectLiteral.kind !== SyntaxKind.ObjectLiteralExpression) {
		return ids;
	}
	for (const property of objectLiteralProperties(objectLiteral)) {
		const name = nodeName(property);
		if (name != null) {
			ids.add(name);
		}
	}
	return ids;
}

function argumentsAfterFirst(call: CallExpression): readonly Expression[] {
	const args: Expression[] = [];
	for (const [index, argument] of call.arguments.entries()) {
		if (index > 0) {
			args.push(argument);
		}
	}
	return args;
}

function isPropagationHelperName(name: string | null): boolean {
	return name === "extend" || name === "merge" || name === "override";
}

function addDeclaredRequired(analyzedFunction: AnalyzedCapabilityFunction): void {
	for (const id of analyzedFunction.declaredCapabilityIds) {
		analyzedFunction.directCapabilityIds.add(id);
	}
}

function addPropagatedSource(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: Node,
	provided: ReadonlySet<string>,
): void {
	const id = symbolId(checker.getSymbolAtLocation(node));
	if (id != null) {
		analyzedFunction.propagatedCapabilitySources.set(id, new Set(provided));
	}
}

function capabilitiesSourceExpression(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	expression: Expression,
): ForwardedExpression | null {
	const symbol = expressionSymbol(checker, expression);
	if (sameSymbol(symbol, analyzedFunction.parameterSymbol)) {
		return { provided: new Set(), usesDeclared: false };
	}
	const id = symbolId(symbol);
	const provided = id == null ? undefined : analyzedFunction.propagatedCapabilitySources.get(id);
	return provided == null ? null : { provided, usesDeclared: false };
}

function hasOwnCapabilitiesBinding(
	checker: Checker,
	node: FunctionLikeDeclaration,
): boolean {
	const firstParam = node.parameters[0];
	if (
		firstParam?.type != null &&
		resolvedDiyCapabilitiesType(checker, firstParam.type) != null
	) {
		return true;
	}
	return node.parameters.some((param) => {
		const name = staticName(param.name);
		return name === "capabilities" || name === "_capabilities";
	});
}

export function locationForNode(
	sourceFile: AnalyzedSourceFile,
	node: Node,
): { readonly column: number; readonly line: number } {
	const text = sourceFile.sourceFile.text;
	let offset = node.pos;
	/* c8 ignore next -- offset remains within node bounds while trimming leading whitespace. */
	while (offset < node.end && /\s/.test(text[offset] ?? "")) {
		offset += 1;
	}
	return locationForOffset(sourceFile.lineStarts(), offset);
}
