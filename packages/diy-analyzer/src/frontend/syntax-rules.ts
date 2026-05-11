import type { DiyAnalyzerNote, DiyAnalyzerViolation } from "../middle-end/types.ts";
import {
	getArray,
	getFunctionName,
	getIdentifierFromParam,
	getIdentifierName,
	getLiteralString,
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
import { isDiyCapabilitiesType, publicDiyImportSources } from "./diy-imports.ts";
import type { AstNode, ModuleInfo } from "./types.ts";

type FunctionFrame = {
	readonly hasCapabilitiesParam: boolean;
	readonly hasDiyCapabilitiesParam: boolean;
	readonly name: string | null;
};

export function analyzeDiySyntax(moduleInfo: ModuleInfo): readonly DiyAnalyzerViolation[] {
	/* istanbul ignore next -- callers only invoke syntax analysis for reportable modules. */
	if (!moduleInfo.reportable) {
		return [];
	}

	const violations: DiyAnalyzerViolation[] = [];
	const functionStack: FunctionFrame[] = [];
	const reportedCapabilityRanges = new Set<string>();

	/* c8 ignore next -- only used by the defensive missing-range fallback. */
	const lineForNode = (node: AstNode): number => lineForOffset(moduleInfo.lineStarts, node.start);
	const locationForNode = (node: AstNode): { readonly column: number; readonly line: number } =>
		locationForOffset(moduleInfo.lineStarts, node.start);
	const currentFunctionName = (): string | undefined => {
		const name = functionStack.at(-1)?.name;
		return name == null ? undefined : name;
	};
	const report = (
		node: AstNode,
		name: string,
		reason: string,
		notes?: DiyAnalyzerViolation["notes"],
	): void => {
		const functionName = currentFunctionName();
		const location = locationForNode(node);
		violations.push({
			column: location.column,
			filePath: moduleInfo.filePath,
			line: location.line,
			name,
			/* c8 ignore next -- rule reports either include notes or omit them intentionally. */
			...(notes == null ? {} : { notes }),
			reason,
			/* c8 ignore next -- module-level import/export reports do not have a function name. */
			...(functionName == null ? {} : { functionName }),
		});
	};
	const reportCapabilityEscape = (node: AstNode): void => {
		/* c8 ignore start -- parser nodes in source files have concrete ranges. */
		const rangeKey =
			node.start == null || node.end == null
				? `${lineForNode(node)}:${getIdentifierName(node) ?? ""}`
				: `${node.start}:${node.end}`;
		/* c8 ignore stop */
		/* istanbul ignore next -- each AST identifier is visited once. */
		if (reportedCapabilityRanges.has(rangeKey)) {
			return;
		}
		reportedCapabilityRanges.add(rangeKey);
		report(
			node,
			"escaped capabilities",
			"Use `capabilities` only for direct capability method calls or as the first argument to another effectful function.",
			[
				{
					kind: "help",
					message:
						"keep capability flow statically analyzable: call methods directly, or forward `capabilities` as the first argument to a named effectful function",
				},
			],
		);
	};
	const visibleCapabilitiesFrame = (): FunctionFrame | undefined => {
		for (let index = functionStack.length - 1; index >= 0; index -= 1) {
			const frame = functionStack[index];
			if (frame?.hasCapabilitiesParam === true) {
				return frame;
			}
		}
		return undefined;
	};
	const hasVisibleDiyCapabilitiesParam = (): boolean =>
		visibleCapabilitiesFrame()?.hasDiyCapabilitiesParam === true;

	const enterFunction = (node: AstNode, parent: AstNode | null): void => {
		const params = getArray(node["params"]);
		functionStack.push({
			hasCapabilitiesParam: params.some(
				(param) => getIdentifierName(getIdentifierFromParam(param)) === "capabilities",
			),
			hasDiyCapabilitiesParam: params.some((param) => {
				const identifier = getIdentifierFromParam(param);
				return (
					getIdentifierName(identifier) === "capabilities" &&
					isDiyCapabilitiesType(moduleInfo, getParamType(getNode(param)))
				);
			}),
			name: getFunctionName(node, parent),
		});
		for (const [index, paramValue] of params.entries()) {
			const param = getNode(paramValue);
			const identifier = getIdentifierFromParam(param);
			if (identifier == null) {
				continue;
			}

			const typeNode = getParamType(param);
			const hasDiyCapabilitiesType = isDiyCapabilitiesType(moduleInfo, typeNode);
			const hasUnrelatedCapabilitiesType = isCapabilitiesType(typeNode) && !hasDiyCapabilitiesType;
			const name = getIdentifierName(identifier);
			if (!hasDiyCapabilitiesType && name !== "capabilities") {
				continue;
			}
			if (name === "capabilities" && hasUnrelatedCapabilitiesType) {
				continue;
			}
			if (name !== "capabilities") {
				report(
					/* c8 ignore next -- invalid parameter reports use the parsed parameter node. */
					param ?? identifier,
					"invalid capabilities parameter",
					"Capabilities parameters must be named `capabilities`.",
					[capabilitiesParameterHelp()],
				);
			}
			if (name === "capabilities" && !hasDiyCapabilitiesType) {
				report(
					/* c8 ignore next -- invalid parameter reports use the parsed parameter node. */
					param ?? identifier,
					"invalid capabilities parameter",
					"`capabilities` parameters must be typed as `Capabilities<...>`.",
					[capabilitiesParameterHelp()],
				);
			}
			if (index !== 0) {
				report(
					/* c8 ignore next -- invalid parameter reports use the parsed parameter node. */
					param ?? identifier,
					"invalid capabilities parameter",
					"Capabilities parameters must be the first parameter.",
					[capabilitiesParameterHelp()],
				);
			}
			if (isDefaultParam(param)) {
				report(
					/* c8 ignore next -- invalid parameter reports use the parsed parameter node. */
					param ?? identifier,
					"invalid capabilities parameter",
					"Do not default `capabilities` parameters.",
					[capabilitiesParameterHelp()],
				);
			}
		}
	};

	const checkCallExpression = (node: AstNode): void => {
		if (!hasVisibleDiyCapabilitiesParam()) {
			return;
		}
		if (!isCapabilitiesMethodMember(node["callee"])) {
			return;
		}
		const callee = getNode(node["callee"]);
		if (!isDirectCapabilitiesMethodMember(callee) || node["optional"] === true) {
			report(
				/* c8 ignore next -- capability calls have a parsed callee node. */
				callee ?? node,
				"dynamic capability access",
				"Use direct capability method calls like `capabilities.need(...)`, `capabilities.provide(...)`, or `capabilities.override(...)`.",
				[
					{
						kind: "help",
						message:
							'replace computed or optional access with direct property access, for example `capabilities.need("core.fs")`',
					},
				],
			);
			return;
		}
		if (isCapabilitiesNeedMember(callee) && !isStringLiteral(getArray(node["arguments"])[0])) {
			report(
				/* c8 ignore next -- dynamic need reports use the parsed argument when present. */
				getNode(getArray(node["arguments"])[0]) ?? node,
				"dynamic capability access",
				"Capability IDs must be string literals.",
				[
					{
						kind: "help",
						message: 'use a literal capability ID, for example `capabilities.need("core.fs")`',
					},
				],
			);
		}
	};

	const checkNoNeedAlias = (node: AstNode): void => {
		if (!hasVisibleDiyCapabilitiesParam()) {
			return;
		}
		if (node.type === "AssignmentExpression" && isCapabilitiesMethodMember(node["right"])) {
			report(
				/* c8 ignore next -- assignment reports use the parsed right-hand side. */
				getNode(node["right"]) ?? node,
				"aliased capability method",
				"Do not alias, rebind, return, or pass capability methods; call them directly.",
				[capabilityMethodAliasHelp()],
			);
		}
		if (node.type === "CallExpression") {
			for (const argument of getArray(node["arguments"])) {
				if (isCapabilitiesMethodMember(argument)) {
					report(
						/* c8 ignore next -- argument reports use the parsed argument node. */
						getNode(argument) ?? node,
						"aliased capability method",
						"Do not alias, rebind, return, or pass capability methods; call them directly.",
						[capabilityMethodAliasHelp()],
					);
				}
			}
		}
		if (node.type === "ReturnStatement" && isCapabilitiesMethodMember(node["argument"])) {
			report(
				/* c8 ignore next -- return reports use the parsed argument node. */
				getNode(node["argument"]) ?? node,
				"aliased capability method",
				"Do not alias, rebind, return, or pass capability methods; call them directly.",
				[capabilityMethodAliasHelp()],
			);
		}
		if (node.type !== "VariableDeclarator") {
			return;
		}
		if (isCapabilitiesMethodMember(node["init"])) {
			report(
				/* c8 ignore next -- initializer reports use the parsed init node. */
				getNode(node["init"]) ?? node,
				"aliased capability method",
				"Do not alias, rebind, return, or pass capability methods; call them directly.",
				[capabilityMethodAliasHelp()],
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
			/* c8 ignore next -- destructured capability keys are identifiers or string literals. */
			if (capabilityMethodNames.has(getMemberPropertyName(property["key"]) ?? "")) {
				report(
					property,
					"aliased capability method",
					"Do not alias, rebind, return, or pass capability methods; call them directly.",
					[capabilityMethodAliasHelp()],
				);
			}
		}
	};

	const checkNoRenamedDiyImport = (node: AstNode): void => {
		if (node.type !== "ImportDeclaration") {
			return;
		}
		/* c8 ignore next -- import declaration sources are string literals. */
		if (!publicDiyImportSources.has(getLiteralString(node["source"]) ?? "")) {
			return;
		}
		for (const specifierValue of getArray(node["specifiers"])) {
			const specifier = getNode(specifierValue);
			if (specifier?.type !== "ImportSpecifier") {
				continue;
			}
			/* c8 ignore next -- import specifiers use identifier or literal names. */
			const importedName =
				getIdentifierName(specifier["imported"]) ?? getLiteralString(specifier["imported"]);
			const localName = getIdentifierName(specifier["local"]);
			if (importedName == null || localName == null || importedName === localName) {
				continue;
			}
			report(
				specifier,
				"renamed diy import",
				"Do not rename imports from @beff/diy; import exported names directly.",
				[
					{
						kind: "help",
						message: 'use `import type { Capabilities, Capability } from "@beff/diy"`',
					},
				],
			);
		}
	};

	const checkNoCapabilitiesReexport = (node: AstNode): void => {
		if (!publicDiyImportSources.has(getLiteralString(node["source"]) ?? "")) {
			return;
		}
		if (node.type === "ExportAllDeclaration") {
			report(
				node,
				"re-exported diy capabilities",
				"Do not re-export Capabilities from @beff/diy; import it directly where it is used.",
				[capabilitiesImportHelp()],
			);
			return;
		}
		if (node.type !== "ExportNamedDeclaration") {
			return;
		}
		for (const specifierValue of getArray(node["specifiers"])) {
			const specifier = getNode(specifierValue);
			/* istanbul ignore next -- parser export specifier arrays contain specifier nodes. */
			if (specifier?.type !== "ExportSpecifier") {
				continue;
			}
			/* c8 ignore next -- export specifiers use identifier or literal names. */
			const localName =
				getIdentifierName(specifier["local"]) ?? getLiteralString(specifier["local"]);
			if (localName !== "Capabilities") {
				continue;
			}
			report(
				specifier,
				"re-exported diy capabilities",
				"Do not re-export Capabilities from @beff/diy; import it directly where it is used.",
				[capabilitiesImportHelp()],
			);
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
		if (functionStack.length === 0 || !hasVisibleDiyCapabilitiesParam()) {
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
		checkNoRenamedDiyImport(node);
		checkNoCapabilitiesReexport(node);
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

function capabilitiesParameterHelp(): DiyAnalyzerNote {
	return {
		kind: "help",
		message:
			"write the signature as `function run(capabilities: Capabilities<AppCapability>, ...)`",
	};
}

function capabilitiesImportHelp(): DiyAnalyzerNote {
	return {
		kind: "help",
		message: 'use `import type { Capabilities } from "@beff/diy"` in each module that needs it',
	};
}

function capabilityMethodAliasHelp(): DiyAnalyzerNote {
	return {
		kind: "help",
		message: 'inline the method call instead, for example `capabilities.need("core.fs")`',
	};
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
	/* istanbul ignore next -- identifier visits always provide a parent. */
	if (parent == null) {
		return false;
	}
	if (isFunctionNode(parent)) {
		return getArray(parent["params"]).some((param) => getIdentifierFromParam(param) === node);
	}
	return parent.type === "AssignmentPattern" && parent["left"] === node;
}
