import {
	SyntaxKind,
	isBinaryExpression,
	isObjectBindingPattern,
	isVariableDeclaration,
} from "typescript/unstable/ast";
import type {
	BinaryExpression,
	CallExpression,
	ComputedPropertyName,
	ElementAccessExpression,
	Expression,
	FunctionLikeDeclaration,
	Node,
	PropertyAccessExpression,
	VariableDeclaration,
} from "typescript/unstable/ast";
import type { Checker, Project, Type } from "typescript/unstable/async";

import {
	childNodes,
	isFunctionLike,
	locationForOffset,
	nodeName,
	objectLiteralProperties,
	staticName,
} from "./ast-utils.ts";
import {
	capabilityIds,
	expressionSymbol,
	expressionType,
	isCapabilitiesType,
	isDiyCapabilitiesAnnotation,
	isImportedCapabilitiesValue,
	isUnresolvedForwardingParameter,
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
	readonly forwarded: ForwardedExpression;
	readonly index: number;
};

export async function scanFunctionBody(
	project: Project,
	analyzedFunction: AnalyzedCapabilityFunction,
): Promise<void> {
	let scannedNodes = 0;
	// Sequential depth-first walk: declarations register propagated capability
	// sources that later nodes in the same body look up.
	const visit = async (node: Node): Promise<void> => {
		scannedNodes += 1;
		if (
			node !== analyzedFunction.node &&
			isFunctionLike(node) &&
			hasOwnCapabilitiesBinding(analyzedFunction.sourceFile, node)
		) {
			return;
		}
		if (isVariableDeclaration(node)) {
			await scanPropagatedVariable(project.checker, analyzedFunction, node);
		} else if (isBinaryExpression(node)) {
			await scanPropagatedAssignment(project.checker, analyzedFunction, node);
		} else if (node.kind === SyntaxKind.PropertyAccessExpression) {
			await scanPropertyAccess(project, analyzedFunction, node as PropertyAccessExpression);
		} else if (node.kind === SyntaxKind.ElementAccessExpression) {
			await scanElementAccess(project, analyzedFunction, node as ElementAccessExpression);
		} else if (node.kind === SyntaxKind.CallExpression) {
			await scanCall(project, analyzedFunction, node as CallExpression);
		}
		for (const child of childNodes(node)) {
			await visit(child);
		}
	};
	await visit(analyzedFunction.node);
	if (analyzedFunction.isGenericDeclaration && analyzedFunction.directCapabilityIds.size > 0) {
		analyzedFunction.unsupportedReasons.push({ kind: "generic-direct-read" });
	}
	recordDeadCodeMetric("scanned AST nodes", scannedNodes);
}

async function scanPropertyAccess(
	project: Project,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: PropertyAccessExpression,
): Promise<void> {
	const access = await capabilityAccess(project.checker, analyzedFunction, node);
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

async function scanElementAccess(
	project: Project,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: ElementAccessExpression,
): Promise<void> {
	const access = await capabilityAccess(project.checker, analyzedFunction, node);
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

async function capabilityAccess(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: PropertyAccessExpression | ElementAccessExpression,
): Promise<{ readonly id: string | null } | null> {
	let firstAccess: PropertyAccessExpression | ElementAccessExpression = node;
	let current = unwrapExpression(accessExpression(node));
	while (
		current.kind === SyntaxKind.PropertyAccessExpression ||
		current.kind === SyntaxKind.ElementAccessExpression
	) {
		firstAccess = current as PropertyAccessExpression | ElementAccessExpression;
		current = unwrapExpression(accessExpression(firstAccess));
	}
	if ((await capabilitiesSourceExpression(checker, analyzedFunction, current)) == null) {
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
	return { id: await staticStringExpression(checker, access.argumentExpression) };
}

function accessExpression(node: PropertyAccessExpression | ElementAccessExpression): Expression {
	return node.expression;
}

async function scanCall(
	project: Project,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: CallExpression,
): Promise<void> {
	const extendInfo = await readCapabilitiesExtend(project.checker, analyzedFunction, node);
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
		const forwarded = await forwardedExpression(project.checker, analyzedFunction, argument);
		if (forwarded == null) {
			continue;
		}
		forwardedArguments.push({ forwarded, index });
	}
	if (forwardedArguments.length === 0) {
		return;
	}
	const signature = await resolveCallSignature(project.checker, node);
	for (const { forwarded, index } of forwardedArguments) {
		/* c8 ignore next -- forwarded calls without signatures are reported below as unresolved. */
		const parameterType =
			signature == null ? undefined : await project.checker.getParameterType(signature, index);
		const requiredFromCallType = await forwardedRequiredCapabilities(
			project.checker,
			analyzedFunction,
			forwarded,
			parameterType,
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

async function scanPropagatedVariable(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: VariableDeclaration,
): Promise<void> {
	if (node.initializer == null) {
		return;
	}
	const forwarded = await forwardedExpression(checker, analyzedFunction, node.initializer);
	if (forwarded == null) {
		return;
	}
	await addPropagatedTarget(checker, analyzedFunction, node.name, forwarded.provided);
}

async function scanPropagatedAssignment(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: BinaryExpression,
): Promise<void> {
	if (node.operatorToken.kind !== SyntaxKind.EqualsToken) {
		return;
	}
	const forwarded = await forwardedExpression(checker, analyzedFunction, node.right);
	if (forwarded == null) {
		return;
	}
	await addPropagatedTarget(checker, analyzedFunction, node.left, forwarded.provided);
}

async function addPropagatedTarget(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	target: Node,
	provided: ReadonlySet<string>,
): Promise<void> {
	if (
		target.kind !== SyntaxKind.ObjectBindingPattern &&
		target.kind !== SyntaxKind.ObjectLiteralExpression
	) {
		await addPropagatedSource(checker, analyzedFunction, target, provided);
		return;
	}
	// Destructuring reads each named capability; the syntax lint rejects the alias itself.
	const elements = isObjectBindingPattern(target)
		? target.elements
		: objectLiteralProperties(target);
	for (const element of elements) {
		const { dotDotDotToken, name, propertyName } = element as {
			readonly dotDotDotToken?: Node;
			readonly name?: Node;
			readonly propertyName?: Node;
		};
		const key = propertyName ?? name;
		// Rest elements and spread assignments do not read a named capability.
		if (dotDotDotToken != null || key == null) {
			continue;
		}
		const id =
			key.kind === SyntaxKind.ComputedPropertyName
				? await staticStringExpression(checker, (key as ComputedPropertyName).expression)
				: staticName(key);
		if (id == null) {
			const location = locationForNode(analyzedFunction.sourceFile, key);
			analyzedFunction.unsupportedReasons.push({
				column: location.column,
				kind: "dynamic-capability-access",
				line: location.line,
			});
			continue;
		}
		analyzedFunction.directCapabilityIds.add(id);
	}
}

function isCapabilitiesHelperCall(sourceFile: AnalyzedSourceFile, node: CallExpression): boolean {
	const expression = node.expression;
	return (
		expression.kind === SyntaxKind.PropertyAccessExpression &&
		isImportedCapabilitiesValue(sourceFile, (expression as PropertyAccessExpression).expression)
	);
}

async function readCapabilitiesExtend(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: CallExpression,
): Promise<{ readonly extra: ReadonlySet<string> } | null> {
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
		(await capabilitiesSourceExpression(checker, analyzedFunction, firstArgument)) == null
	) {
		return null;
	}
	return {
		extra: await providedCapabilityIds(
			checker,
			analyzedFunction.sourceFile,
			argumentsAfterFirst(node),
		),
	};
}

async function forwardedExpression(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	argument: Expression,
): Promise<ForwardedExpression | null> {
	const expression = unwrapExpression(argument);
	const source = await capabilitiesSourceExpression(checker, analyzedFunction, expression);
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
			: await capabilitiesSourceExpression(checker, analyzedFunction, firstArgument);
	if (firstSource == null) {
		return null;
	}
	const provided = new Set(firstSource.provided);
	for (const id of await providedCapabilityIds(
		checker,
		analyzedFunction.sourceFile,
		argumentsAfterFirst(call),
	)) {
		provided.add(id);
	}
	return { provided };
}

async function forwardedRequiredCapabilities(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	forwarded: ForwardedExpression,
	parameterType: Type | undefined,
): Promise<ReadonlySet<string> | null> {
	const parameterIds =
		parameterType != null && (await isCapabilitiesType(checker, parameterType))
			? await capabilityIds(checker, parameterType)
			: null;
	if (parameterIds != null && parameterIds.size > 0) {
		return parameterIds;
	}
	return null;
}

async function providedCapabilityIds(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
	expressions: readonly Expression[],
): Promise<ReadonlySet<string>> {
	const provided = new Set<string>();
	for (const expression of expressions) {
		for (const id of objectLiteralCapabilityIds(sourceFile, expression)) {
			provided.add(id);
		}
		const type = await expressionType(checker, expression);
		/* c8 ignore next -- expressions passed to capability helpers have checker types. */
		if (type == null) {
			continue;
		}
		for (const id of await capabilityIds(checker, type)) {
			provided.add(id);
		}
	}
	return provided;
}

function objectLiteralCapabilityIds(
	sourceFile: AnalyzedSourceFile,
	expression: Expression,
): ReadonlySet<string> {
	const ids = new Set<string>();
	const unwrapped = unwrapExpression(expression);
	let objectLiteral = unwrapped.kind === SyntaxKind.ObjectLiteralExpression ? unwrapped : null;
	if (unwrapped.kind === SyntaxKind.CallExpression) {
		const call = unwrapped as CallExpression;
		/* c8 ignore next -- capability factory calls in fixtures pass their provider object. */
		objectLiteral = isCapabilitiesCreateCall(sourceFile, call) ? (call.arguments[0] ?? null) : null;
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

function isCapabilitiesCreateCall(sourceFile: AnalyzedSourceFile, call: CallExpression): boolean {
	const callee = call.expression;
	if (callee.kind !== SyntaxKind.PropertyAccessExpression) {
		return false;
	}
	const propertyAccess = callee as PropertyAccessExpression;
	return (
		staticName(propertyAccess.name) === "create" &&
		isImportedCapabilitiesValue(sourceFile, propertyAccess.expression)
	);
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

async function addPropagatedSource(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	node: Node,
	provided: ReadonlySet<string>,
): Promise<void> {
	const id = symbolId(await checker.getSymbolAtLocation(node));
	if (id != null) {
		analyzedFunction.propagatedCapabilitySources.set(id, new Set(provided));
	}
}

async function capabilitiesSourceExpression(
	checker: Checker,
	analyzedFunction: AnalyzedCapabilityFunction,
	expression: Expression,
): Promise<ForwardedExpression | null> {
	const symbol = await expressionSymbol(checker, expression);
	if (sameSymbol(symbol, analyzedFunction.parameterSymbol)) {
		return { provided: new Set() };
	}
	const id = symbolId(symbol);
	const provided = id == null ? undefined : analyzedFunction.propagatedCapabilitySources.get(id);
	return provided == null ? null : { provided };
}

function hasOwnCapabilitiesBinding(
	sourceFile: AnalyzedSourceFile,
	node: FunctionLikeDeclaration,
): boolean {
	const firstParam = node.parameters[0];
	if (firstParam?.type != null && isDiyCapabilitiesAnnotation(sourceFile, firstParam.type)) {
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
	return locationForOffset(sourceFile.lineStarts(), node.getStart());
}
