import {
	getArray,
	getFirstParam,
	getIdentifierFromParam,
	getIdentifierName,
	getLiteralString,
	getMemberPropertyName,
	getNode,
	getParamType,
	getTypeArguments,
	isCapabilitiesCreateCall,
	isCapabilitiesExtendCall,
	isCapabilitiesHelperCall,
	isFunctionNode,
	isCapabilitiesServiceMember,
	isCapabilitiesStaticTransformCall,
} from "./ast.ts";
import { getDiyCapabilitiesAllowedType } from "./diy-imports.ts";
import type { ModuleLoader } from "./module-loader.ts";
import {
	collectVariableDeclarationConstants,
	resolveStaticMemberName,
	resolveStringConstantName,
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

	const enterScope = (node: AstNode): void => {
		const scope = new Map<string, StringConstantBinding>();
		if (isFunctionNode(node)) {
			for (const param of getArray(node["params"])) {
				const name = getIdentifierName(getIdentifierFromParam(param));
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
		if (node.type === "VariableDeclarator" && getIdentifierName(node["init"]) === "capabilities") {
			for (const id of getObjectPatternCapabilityIds(
				{ loader, localConstants: constantScopes, moduleInfo },
				node["id"],
			)) {
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
	if (firstArgumentNode == null || !isCapabilitiesExtendCall(firstArgumentNode)) {
		return null;
	}
	return {
		provideCall: firstArgumentNode,
		providedType: getCapabilitiesCreateType(getArray(firstArgumentNode["arguments"])[1]),
	};
}

function getCapabilitiesCreateType(value: unknown): unknown | null {
	const node = getNode(value);
	if (node == null || !isCapabilitiesCreateCall(node)) {
		return null;
	}
	return getTypeArguments(node)[0] ?? null;
}

function getObjectPatternCapabilityIds(
	context: {
		readonly loader: ModuleLoader;
		readonly localConstants: readonly Map<string, StringConstantBinding>[];
		readonly moduleInfo: ModuleInfo;
	},
	pattern: unknown,
): readonly string[] {
	const node = getNode(pattern);
	if (node?.type !== "ObjectPattern") {
		return [];
	}
	const ids: string[] = [];
	for (const propertyValue of getArray(node["properties"])) {
		const property = getNode(propertyValue);
		if (property?.type !== "Property") {
			continue;
		}
		const id =
			property["computed"] === true
				? resolveObjectPatternComputedKey(context, property["key"])
				: getMemberPropertyName(property["key"]);
		if (id != null) {
			ids.push(id);
		}
	}
	return ids;
}

function resolveObjectPatternComputedKey(
	context: {
		readonly loader: ModuleLoader;
		readonly localConstants: readonly Map<string, StringConstantBinding>[];
		readonly moduleInfo: ModuleInfo;
	},
	key: unknown,
): string | null {
	const literal = getLiteralString(key);
	if (literal != null) {
		return literal;
	}
	const name = getIdentifierName(key);
	if (name == null) {
		return null;
	}
	return resolveStringConstantName(context, name);
}
