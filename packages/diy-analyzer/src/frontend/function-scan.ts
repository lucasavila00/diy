import {
	getArray,
	getFirstParam,
	getCapabilitiesAllowedType,
	getIdentifierName,
	getLiteralString,
	getNode,
	getParamType,
	getTypeArguments,
	isFunctionNode,
	isCapabilitiesProvideCall,
	isCapabilitiesNeedCall,
	isCapabilitiesTransformCall,
} from "./ast.ts";
import type { AstNode, UnsupportedReason } from "./types.ts";

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

export function scanFunctionBody(functionNode: AstNode): FunctionScan {
	const direct = new Set<string>();
	const calls: ScannedCapabilitiesForwardingCall[] = [];
	const provideChecks: ScannedCapabilitiesProvideCheck[] = [];
	const inlineForwardedProvideCalls = new WeakSet<AstNode>();
	let forwardsTransformedCapabilities = false;
	const unsupportedReasons: UnsupportedReason[] = [];
	const body = functionNode["body"];

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
			const firstParam = getFirstParam(node);
			if (getCapabilitiesAllowedType(getParamType(firstParam)) != null) {
				return;
			}
		}
		if (isCapabilitiesNeedCall(node)) {
			const id = getLiteralString(getArray(node["arguments"])[0]);
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
	};

	visit(body);
	return {
		calls,
		direct,
		forwardsTransformedCapabilities,
		provideChecks,
		unsupportedReasons,
	};
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
