import {
	getArray,
	getFirstParam,
	getIdentifierFromParam,
	getIdentifierName,
	getNode,
	getParamType,
	getTypeArguments,
	isFunctionNode,
	isCapabilitiesProvideCall,
	isCapabilitiesNeedCall,
	isCapabilitiesTransformCall,
} from "./ast.ts";
import { getDiyCapabilitiesAllowedType } from "./diy-imports.ts";
import type { ModuleLoader } from "./module-loader.ts";
import { collectVariableDeclarationConstants, resolveNeedId } from "./need-id.ts";
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

	const enterScope = (node: AstNode): void => {
		const scope = new Map<string, StringConstantBinding>();
		if (isFunctionNode(node)) {
			for (const param of getArray(node["params"])) {
				const name = getIdentifierName(getIdentifierFromParam(param));
				/* c8 ignore next -- function parameters with names are covered by analyzer fixtures. */
				if (name != null) {
					scope.set(name, null);
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
		const createsScope = node.type === "BlockStatement" || (node !== functionNode && isFunctionNode(node));
		if (createsScope) {
			enterScope(node);
		}
		if (isCapabilitiesNeedCall(node)) {
			const id = resolveNeedId(
				{ loader, localConstants: constantScopes, moduleInfo },
				getArray(node["arguments"])[0],
			);
			if (id != null) {
				direct.add(id);
			}
			return;
		}
		if (isCapabilitiesTransformCall(node) && !inlineForwardedProvideCalls.has(node)) {
			forwardsTransformedCapabilities = true;
		}
		if (isCapabilitiesProvideCall(node)) {
			provideChecks.push({
				extraType: getTypeArguments(node)[0] ?? null,
				start: node.start,
			});
		}
		if (node.type === "CallExpression") {
			const forwarded = getForwardedCapabilitiesArgument(node);
			if (forwarded == null) {
				// Continue traversal below.
			} else {
				if (forwarded.provideCall != null) {
					inlineForwardedProvideCalls.add(forwarded.provideCall);
				}
				const calleeName = getIdentifierName(node["callee"]);
				if (calleeName == null) {
					unsupportedReasons.push({
						kind: "unresolved-forwarding-callee",
						message: "unresolved capabilities forwarding callee",
					});
				} else {
					calls.push({
						calleeName,
						providedType: forwarded.providedType,
					});
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
		}
	};

	visit(body);
	constantScopes.pop();
	return {
		calls,
		direct,
		forwardsTransformedCapabilities,
		provideChecks,
		unsupportedReasons,
	};
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
	const firstArgument = getArray(node["arguments"])[0];
	if (getIdentifierName(firstArgument) === "capabilities") {
		return { provideCall: null, providedType: null };
	}
	const firstArgumentNode = getNode(firstArgument);
	if (firstArgumentNode == null || !isCapabilitiesProvideCall(firstArgumentNode)) {
		return null;
	}
	return {
		provideCall: firstArgumentNode,
		providedType: getTypeArguments(firstArgumentNode)[0] ?? null,
	};
}
