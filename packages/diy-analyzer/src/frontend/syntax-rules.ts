import type { DiyAnalyzerViolation } from "../middle-end/types.ts";
import {
	getArray,
	getFunctionName,
	getIdentifierFromParam,
	getIdentifierName,
	getMemberPropertyName,
	getNode,
	getParamType,
	isDirectCapabilitiesMethodMember,
	isFunctionNode,
	isCapabilitiesMethodMember,
	isCapabilitiesNeedMember,
	isCapabilitiesType,
	isStringLiteral,
	lineForOffset,
	locationForOffset,
	capabilityMethodNames,
} from "./ast.ts";
import { isPackageSrcFile } from "./source-files.ts";
import type { AstNode, ModuleInfo } from "./types.ts";

type FunctionFrame = {
	readonly hasCapabilitiesParam: boolean;
	readonly name: string | null;
};

export function analyzeDiySyntax(moduleInfo: ModuleInfo): readonly DiyAnalyzerViolation[] {
	if (!moduleInfo.reportable || !isPackageSrcFile(moduleInfo.filePath)) {
		return [];
	}

	const violations: DiyAnalyzerViolation[] = [];
	const functionStack: FunctionFrame[] = [];
	const reportedCapabilityRanges = new Set<string>();

	const lineForNode = (node: AstNode): number => lineForOffset(moduleInfo.lineStarts, node.start);
	const locationForNode = (node: AstNode): { readonly column: number; readonly line: number } =>
		locationForOffset(moduleInfo.lineStarts, node.start);
	const currentFunctionName = (): string | undefined => {
		const name = functionStack.at(-1)?.name;
		return name == null ? undefined : name;
	};
	const report = (node: AstNode, name: string, reason: string): void => {
		const functionName = currentFunctionName();
		const location = locationForNode(node);
		violations.push({
			column: location.column,
			filePath: moduleInfo.filePath,
			line: location.line,
			name,
			reason,
			...(functionName == null ? {} : { functionName }),
		});
	};
	const reportCapabilityEscape = (node: AstNode): void => {
		const rangeKey =
			node.start == null || node.end == null
				? `${lineForNode(node)}:${getIdentifierName(node) ?? ""}`
				: `${node.start}:${node.end}`;
		if (reportedCapabilityRanges.has(rangeKey)) {
			return;
		}
		reportedCapabilityRanges.add(rangeKey);
		report(
			node,
			"escaped capabilities",
			"Use `capabilities` only for direct capability method calls or as the first argument to another effectful function.",
		);
	};
	const hasVisibleCapabilitiesParam = (): boolean =>
		functionStack.some((frame) => frame.hasCapabilitiesParam);

	const enterFunction = (node: AstNode, parent: AstNode | null): void => {
		const params = getArray(node["params"]);
		functionStack.push({
			hasCapabilitiesParam: params.some(
				(param) => getIdentifierName(getIdentifierFromParam(param)) === "capabilities",
			),
			name: getFunctionName(node, parent),
		});
		for (const [index, paramValue] of params.entries()) {
			const param = getNode(paramValue);
			const identifier = getIdentifierFromParam(param);
			if (identifier == null) {
				continue;
			}

			const hasCapabilitiesType = isCapabilitiesType(getParamType(param));
			const name = getIdentifierName(identifier);
			if (!hasCapabilitiesType && name !== "capabilities") {
				continue;
			}
			if (name !== "capabilities") {
				report(
					param ?? identifier,
					"invalid capabilities parameter",
					"Capabilities parameters must be named `capabilities`.",
				);
			}
			if (name === "capabilities" && !hasCapabilitiesType) {
				report(
					param ?? identifier,
					"invalid capabilities parameter",
					"`capabilities` parameters must be typed as `Capabilities<...>`.",
				);
			}
			if (index !== 0) {
				report(
					param ?? identifier,
					"invalid capabilities parameter",
					"Capabilities parameters must be the first parameter.",
				);
			}
			if (isDefaultParam(param)) {
				report(
					param ?? identifier,
					"invalid capabilities parameter",
					"Do not default `capabilities` parameters.",
				);
			}
		}
	};

	const checkCallExpression = (node: AstNode): void => {
		if (!isCapabilitiesMethodMember(node["callee"])) {
			return;
		}
		const callee = getNode(node["callee"]);
		if (!isDirectCapabilitiesMethodMember(callee) || node["optional"] === true) {
			report(
				callee ?? node,
				"dynamic capability access",
				"Use direct capability method calls like `capabilities.need(...)`, `capabilities.provide(...)`, or `capabilities.override(...)`.",
			);
			return;
		}
		if (isCapabilitiesNeedMember(callee) && !isStringLiteral(getArray(node["arguments"])[0])) {
			report(
				getNode(getArray(node["arguments"])[0]) ?? node,
				"dynamic capability access",
				"Capability IDs must be string literals.",
			);
		}
	};

	const checkNoNeedAlias = (node: AstNode): void => {
		if (node.type === "AssignmentExpression" && isCapabilitiesMethodMember(node["right"])) {
			report(
				getNode(node["right"]) ?? node,
				"aliased capability method",
				"Do not alias, rebind, return, or pass capability methods; call them directly.",
			);
		}
		if (node.type === "CallExpression") {
			for (const argument of getArray(node["arguments"])) {
				if (isCapabilitiesMethodMember(argument)) {
					report(
						getNode(argument) ?? node,
						"aliased capability method",
						"Do not alias, rebind, return, or pass capability methods; call them directly.",
					);
				}
			}
		}
		if (node.type === "ReturnStatement" && isCapabilitiesMethodMember(node["argument"])) {
			report(
				getNode(node["argument"]) ?? node,
				"aliased capability method",
				"Do not alias, rebind, return, or pass capability methods; call them directly.",
			);
		}
		if (node.type !== "VariableDeclarator") {
			return;
		}
		if (isCapabilitiesMethodMember(node["init"])) {
			report(
				getNode(node["init"]) ?? node,
				"aliased capability method",
				"Do not alias, rebind, return, or pass capability methods; call them directly.",
			);
			return;
		}
		const id = getNode(node["id"]);
		const init = getNode(node["init"]);
		if (id?.type !== "ObjectPattern" || init?.type !== "Identifier") {
			return;
		}
		if (getIdentifierName(init) !== "capabilities") {
			return;
		}
		for (const propertyValue of getArray(id["properties"])) {
			const property = getNode(propertyValue);
			if (property?.type !== "Property") {
				continue;
			}
			if (capabilityMethodNames.has(getMemberPropertyName(property["key"]) ?? "")) {
				report(
					property,
					"aliased capability method",
					"Do not alias, rebind, return, or pass capability methods; call them directly.",
				);
			}
		}
	};

	const checkCapabilityIdentifier = (
		node: AstNode,
		parent: AstNode | null,
		grandparent: AstNode | null,
	): void => {
		if (getIdentifierName(node) !== "capabilities") {
			return;
		}
		if (functionStack.length === 0 || !hasVisibleCapabilitiesParam()) {
			return;
		}
		if (isNonValueIdentifierParent(parent) || isCapabilitiesParamIdentifier(node, parent)) {
			return;
		}
		if (parent?.type === "MemberExpression" && parent["object"] === node) {
			if (isDirectCapabilitiesMethodMember(parent) && grandparent?.["callee"] === parent) {
				return;
			}
			reportCapabilityEscape(node);
			return;
		}
		if (parent?.type === "CallExpression" && getArray(parent["arguments"])[0] === node) {
			return;
		}
		reportCapabilityEscape(node);
	};

	const visit = (value: unknown, parent: AstNode | null, grandparent: AstNode | null): void => {
		if (Array.isArray(value)) {
			for (const item of value) {
				visit(item, parent, grandparent);
			}
			return;
		}
		const node = getNode(value);
		if (node == null) {
			return;
		}

		const isFunction = isFunctionNode(node);
		if (isFunction) {
			enterFunction(node, parent);
		}
		if (node.type === "CallExpression") {
			checkCallExpression(node);
		}
		checkNoNeedAlias(node);
		if (node.type === "Identifier") {
			checkCapabilityIdentifier(node, parent, grandparent);
		}

		for (const [key, child] of Object.entries(node)) {
			if (key === "type" || key === "start" || key === "end") {
				continue;
			}
			visit(child, node, parent);
		}
		if (isFunction) {
			functionStack.pop();
		}
	};

	visit(moduleInfo.body, null, null);
	return violations;
}

function isDefaultParam(param: unknown): boolean {
	return getNode(param)?.type === "AssignmentPattern";
}

function isNonValueIdentifierParent(parent: AstNode | null): boolean {
	return (
		parent == null ||
		parent.type.startsWith("TS") ||
		parent.type === "ImportSpecifier" ||
		parent.type === "ImportDefaultSpecifier" ||
		parent.type === "ImportNamespaceSpecifier"
	);
}

function isCapabilitiesParamIdentifier(node: AstNode, parent: AstNode | null): boolean {
	if (parent == null) {
		return false;
	}
	if (isFunctionNode(parent)) {
		return getArray(parent["params"]).some((param) => getIdentifierFromParam(param) === node);
	}
	return parent.type === "AssignmentPattern" && parent["left"] === node;
}
