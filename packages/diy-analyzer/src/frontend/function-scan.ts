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
	readonly calleeNames: ReadonlySet<string>;
	readonly direct: ReadonlySet<string>;
	readonly provideChecks: readonly ScannedCapabilitiesProvideCheck[];
	readonly forwardsTransformedCapabilities: boolean;
	readonly unsupportedReasons: readonly UnsupportedReason[];
};

type ScannedCapabilitiesProvideCheck = {
	readonly extraType: unknown;
	readonly start: number | undefined;
};

export function scanFunctionBody(functionNode: AstNode): FunctionScan {
	const direct = new Set<string>();
	const calleeNames = new Set<string>();
	const provideChecks: ScannedCapabilitiesProvideCheck[] = [];
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
		if (isCapabilitiesTransformCall(node)) {
			forwardsTransformedCapabilities = true;
		}
		if (isCapabilitiesProvideCall(node)) {
			provideChecks.push({
				extraType: getTypeArguments(node)[0] ?? null,
				start: node.start,
			});
		}
		if (node.type === "CallExpression" && isCapabilitiesFirstArgument(node)) {
			const calleeName = getIdentifierName(node["callee"]);
			if (calleeName == null) {
				unsupportedReasons.push({
					kind: "unresolved-forwarding-callee",
					message: "unresolved capabilities forwarding callee",
				});
			} else {
				calleeNames.add(calleeName);
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
		calleeNames,
		direct,
		forwardsTransformedCapabilities,
		provideChecks,
		unsupportedReasons,
	};
}

function isCapabilitiesFirstArgument(node: AstNode): boolean {
	const firstArgument = getArray(node["arguments"])[0];
	return getIdentifierName(firstArgument) === "capabilities";
}
