import {
	getArray,
	getFirstParam,
	getIdentifierFromParam,
	getIdentifierName,
	getNode,
	getParamType,
	getStaticMemberExpressionName,
	getTypeArguments,
	isCapabilitiesCreateCall,
	isCapabilitiesExtendCall,
	isCapabilitiesHelperCall,
	isFunctionNode,
	isCapabilitiesServiceMember,
	isCapabilitiesStaticTransformCall,
} from "./ast.ts";
import { getDiyCapabilitiesAllowedType } from "./diy-imports.ts";
import { getFunctionTypeFirstParamType } from "./function-types.ts";
import type { ModuleLoader } from "./module-loader.ts";
import {
	collectVariableDeclarationConstants,
	resolveStaticMemberName,
} from "./string-constants.ts";
import type { AstNode, ModuleInfo, StringConstantBinding, UnsupportedReason } from "./types.ts";

type FunctionScan = {
	readonly calls: readonly ScannedCapabilitiesForwardingCall[];
	readonly direct: ReadonlySet<string>;
	readonly provideChecks: readonly ScannedCapabilitiesProvideCheck[];
	readonly forwardsTransformedCapabilities: boolean;
	readonly unsupportedReasons: readonly UnsupportedReason[];
};

type ScannedCapabilitiesProvideCheck = {
	readonly extraType: unknown;
	readonly start: number | undefined;
};

type ScannedCapabilitiesForwardingCall = {
	readonly calleeName: string;
	readonly providedType: unknown | null;
};

export function scanFunctionBody(
	loader: ModuleLoader,
	moduleInfo: ModuleInfo,
	functionNode: AstNode,
): FunctionScan {
	const direct = new Set<string>();
	const calls: ScannedCapabilitiesForwardingCall[] = [];
	const provideChecks: ScannedCapabilitiesProvideCheck[] = [];
	const inlineForwardedProvideCalls = new WeakSet<AstNode>();
	let forwardsTransformedCapabilities = false;
	const unsupportedReasons: UnsupportedReason[] = [];
	const body = functionNode["body"];
	const constantScopes: Map<string, StringConstantBinding>[] = [];
	/* c8 ignore next -- module loading records closure callbacks for every collected function. */
	const typedCallbackScopes: Set<string>[] = [
		new Set(moduleInfo.functionClosureCallbacks.get(functionNode) ?? []),
	];

	const enterScope = (node: AstNode): void => {
		const scope = new Map<string, StringConstantBinding>();
		const typedCallbacks = new Set<string>();
		if (isFunctionNode(node)) {
			for (const param of getArray(node["params"])) {
				const name = getIdentifierName(getIdentifierFromParam(param));
				if (name != null) {
					scope.set(name, null);
					if (isTypedCapabilitiesCallback(moduleInfo, param)) {
						typedCallbacks.add(name);
					}
				}
			}
		}
		for (const statement of getArray(node["body"])) {
			const statementNode = getNode(statement);
			if (statementNode?.type === "VariableDeclaration") {
				collectVariableDeclarationConstants(statementNode, scope);
			}
		}
		constantScopes.push(scope);
		typedCallbackScopes.push(typedCallbacks);
	};

	enterScope(functionNode);

	const visit = (value: unknown): void => {
		if (Array.isArray(value)) {
			for (const item of value) {
				visit(item);
			}
			return;
		}
		const node = getNode(value);
		if (node == null) {
			return;
		}
		if (node !== functionNode && isFunctionNode(node)) {
			if (hasOwnCapabilitiesBinding(moduleInfo, node)) {
				return;
			}
		}
		const createsScope =
			node.type === "BlockStatement" || (node !== functionNode && isFunctionNode(node));
		if (createsScope) {
			enterScope(node);
		}
		if (isCapabilitiesServiceMember(node)) {
			const id = resolveStaticMemberName(
				{ loader, localConstants: constantScopes, moduleInfo },
				node,
			);
			if (id != null) {
				direct.add(id);
			}
		}
		if (isCapabilitiesStaticTransformCall(node) && !inlineForwardedProvideCalls.has(node)) {
			forwardsTransformedCapabilities = true;
		}
		if (isCapabilitiesExtendCall(node)) {
			const extraType = getCapabilitiesCreateType(getArray(node["arguments"])[1]);
			if (extraType != null) {
				provideChecks.push({
					extraType,
					start: node.start,
				});
			}
		}
		if (node.type === "CallExpression") {
			if (isCapabilitiesHelperCall(node)) {
				// Continue traversal below.
			} else {
				const forwarded = getForwardedCapabilitiesArgument(node);
				if (forwarded == null) {
					// Continue traversal below.
				} else {
					if (forwarded.provideCall != null) {
						inlineForwardedProvideCalls.add(forwarded.provideCall);
					}
					const calleeName = getForwardingCalleeName(moduleInfo, node["callee"]);
					if (calleeName == null) {
						unsupportedReasons.push({
							kind: "unresolved-forwarding-callee",
							message: "unresolved capabilities forwarding callee",
						});
					} else if (isTypedCallbackName(calleeName, typedCallbackScopes)) {
						forwardsTransformedCapabilities = true;
					} else {
						calls.push({
							calleeName,
							providedType: forwarded.providedType,
						});
					}
				}
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key === "type" || key === "start" || key === "end") {
				continue;
			}
			visit(child);
		}
		if (createsScope) {
			constantScopes.pop();
			typedCallbackScopes.pop();
		}
	};

	visit(body);
	constantScopes.pop();
	typedCallbackScopes.pop();
	typedCallbackScopes.pop();
	return {
		calls,
		direct,
		forwardsTransformedCapabilities,
		provideChecks,
		unsupportedReasons,
	};
}

function isTypedCapabilitiesCallback(moduleInfo: ModuleInfo, param: unknown): boolean {
	const firstParamType = getFunctionTypeFirstParamType(moduleInfo, getParamType(getNode(param)));
	return getDiyCapabilitiesAllowedType(moduleInfo, firstParamType) != null;
}

function isTypedCallbackName(
	calleeName: string,
	typedCallbackScopes: readonly ReadonlySet<string>[],
): boolean {
	if (calleeName.includes(".")) {
		return false;
	}
	return typedCallbackScopes.some((scope) => scope.has(calleeName));
}

function getForwardingCalleeName(moduleInfo: ModuleInfo, callee: unknown): string | null {
	const identifierName = getIdentifierName(callee);
	if (identifierName != null) {
		return identifierName;
	}
	const staticName = getStaticMemberExpressionName(callee);
	if (staticName == null) {
		return null;
	}
	if (moduleInfo.functionNodes.has(staticName)) {
		return staticName;
	}
	const importRoot = staticName.split(".")[0];
	if (importRoot != null && moduleInfo.imports.has(importRoot)) {
		return staticName;
	}
	return null;
}

function hasOwnCapabilitiesBinding(moduleInfo: ModuleInfo, functionNode: AstNode): boolean {
	const firstParam = getFirstParam(functionNode);
	if (getDiyCapabilitiesAllowedType(moduleInfo, getParamType(firstParam)) != null) {
		return true;
	}
	return getArray(functionNode["params"]).some(
		(param) => getIdentifierName(getIdentifierFromParam(param)) === "capabilities",
	);
}

type ForwardedCapabilitiesArgument = {
	readonly provideCall: AstNode | null;
	readonly providedType: unknown | null;
};

function getForwardedCapabilitiesArgument(node: AstNode): ForwardedCapabilitiesArgument | null {
	const firstArgument = unwrapExpression(getArray(node["arguments"])[0]);
	if (getIdentifierName(firstArgument) === "capabilities") {
		return { provideCall: null, providedType: null };
	}
	const firstArgumentNode = getNode(firstArgument);
	if (firstArgumentNode == null || !isCapabilitiesExtendCall(firstArgumentNode)) {
		return null;
	}
	return {
		provideCall: firstArgumentNode,
		providedType: getCapabilitiesCreateType(getArray(firstArgumentNode["arguments"])[1]),
	};
}

function unwrapExpression(value: unknown): unknown {
	let current = getNode(value);
	while (
		current?.type === "TSAsExpression" ||
		current?.type === "TSTypeAssertion" ||
		current?.type === "TSNonNullExpression"
	) {
		current = getNode(current["expression"]);
	}
	return current ?? value;
}

function getCapabilitiesCreateType(value: unknown): unknown | null {
	const node = getNode(value);
	if (node == null || !isCapabilitiesCreateCall(node)) {
		return null;
	}
	return getTypeArguments(node)[0] ?? null;
}
