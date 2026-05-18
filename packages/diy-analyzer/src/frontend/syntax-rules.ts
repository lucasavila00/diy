import type { DiyAnalyzerNote, DiyAnalyzerViolation } from "../model/types.ts";
import {
	getArray,
	getFunctionName,
	getIdentifierFromParam,
	getIdentifierName,
	getLiteralString,
	getNode,
	getParamType,
	isFunctionNode,
	isCapabilitiesServiceMember,
	isCapabilitiesType,
	lineForOffset,
	locationForOffset,
} from "./ast.ts";
import {
	getDiyCapabilitiesAllowedType,
	isDiyCapabilitiesType,
	publicDiyImportSources,
} from "./diy-imports.ts";
import { getContextualFunctionType, getFunctionTypeFirstParamType } from "./function-types.ts";
import type { ModuleLoader } from "./module-loader.ts";
import {
	collectVariableDeclarationConstants,
	resolveStaticMemberName,
} from "./string-constants.ts";
import type { AstNode, ModuleInfo, StringConstantBinding } from "./types.ts";

type FunctionFrame = {
	readonly hasCapabilitiesParam: boolean;
	readonly hasDiyCapabilitiesParam: boolean;
	readonly name: string | null;
};

export function analyzeDiySyntax(
	loader: ModuleLoader,
	moduleInfo: ModuleInfo,
): readonly DiyAnalyzerViolation[] {
	/* c8 ignore next -- callers only invoke syntax analysis for reportable modules. */
	if (!moduleInfo.reportable) {
		return [];
	}

	const violations: DiyAnalyzerViolation[] = [];
	const functionStack: FunctionFrame[] = [];
	const constantScopes: Map<string, StringConstantBinding>[] = [];
	const namespaceStack: string[] = [];
	const nodeStack: AstNode[] = [];
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
		/* c8 ignore next -- each AST identifier is visited once. */
		if (reportedCapabilityRanges.has(rangeKey)) {
			return;
		}
		reportedCapabilityRanges.add(rangeKey);
		report(
			node,
			"escaped capabilities",
			"Use `capabilities` only for static service property access or as the first argument to another effectful function.",
			[
				{
					kind: "help",
					message:
						"keep capability flow statically analyzable: read services inline or forward `capabilities` as the first argument to a named effectful function",
				},
			],
		);
	};
	const reportCapabilityServiceAlias = (node: AstNode): void => {
		report(
			node,
			"aliased capability service",
			"Do not create local aliases for capability services.",
			[
				{
					kind: "help",
					message: "read services inline from `capabilities`, for example `capabilities.reader`",
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

	const enterConstantScope = (node: AstNode): void => {
		const scope = new Map<string, StringConstantBinding>();
		for (const statement of getArray(node["body"])) {
			const statementNode = getNode(statement);
			if (statementNode?.type === "VariableDeclaration") {
				collectVariableDeclarationConstants(statementNode, scope);
			}
		}
		constantScopes.push(scope);
	};

	const enterFunction = (node: AstNode, parent: AstNode | null): void => {
		const params = getArray(node["params"]);
		const contextualFirstParamType = getFunctionTypeFirstParamType(
			moduleInfo,
			getContextualFunctionType(parent),
			namespaceStack.at(-1) ?? null,
		);
		const trustsUntypedContextualCapabilities = isTrustedUntypedContextualCapabilitiesFunction(
			node,
			parent,
			nodeStack,
		);
		const functionConstants = new Map<string, StringConstantBinding>();
		for (const param of params) {
			const name = getIdentifierName(getIdentifierFromParam(param));
			if (name != null) {
				functionConstants.set(name, null);
			}
		}
		constantScopes.push(functionConstants);
		functionStack.push({
			hasCapabilitiesParam: params.some(
				(param) => getIdentifierName(getIdentifierFromParam(param)) === "capabilities",
			),
			hasDiyCapabilitiesParam: params.some((param) => {
				const identifier = getIdentifierFromParam(param);
				return (
					getIdentifierName(identifier) === "capabilities" &&
					(getDiyCapabilitiesAllowedType(
						moduleInfo,
						getEffectiveParamType(param, params, contextualFirstParamType),
					) != null ||
						trustsUntypedContextualCapabilities)
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

			const typeNode = getEffectiveParamType(param, params, contextualFirstParamType);
			const hasDiyCapabilitiesReference = isDiyCapabilitiesType(moduleInfo, typeNode);
			const hasDiyCapabilitiesType = getDiyCapabilitiesAllowedType(moduleInfo, typeNode) != null;
			const hasUnrelatedCapabilitiesType =
				isCapabilitiesType(typeNode) && !hasDiyCapabilitiesReference;
			const name = getIdentifierName(identifier);
			const isCapabilitiesName = name === "capabilities" || name === "_capabilities";
			if (
				trustsUntypedContextualCapabilities &&
				index === 0 &&
				isCapabilitiesName &&
				getParamType(param) == null
			) {
				continue;
			}
			if (!hasDiyCapabilitiesType && name !== "capabilities") {
				continue;
			}
			if (name === "capabilities" && hasUnrelatedCapabilitiesType) {
				continue;
			}
			if (!isCapabilitiesName) {
				report(
					/* c8 ignore next -- invalid parameter reports use the parsed parameter node. */
					param ?? identifier,
					"invalid capabilities parameter",
					"Capabilities parameters must be named `capabilities` or `_capabilities`.",
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

	const checkMemberExpression = (node: AstNode): void => {
		if (!hasVisibleDiyCapabilitiesParam()) {
			return;
		}
		if (!isCapabilitiesServiceMember(node)) {
			return;
		}
		if (
			node["optional"] === true ||
			resolveStaticMemberName(
				{
					loader,
					localConstants: constantScopes,
					moduleInfo,
				},
				node,
			) == null
		) {
			report(
				node,
				"dynamic capability access",
				"Capability service access must use a static property name.",
				[
					{
						kind: "help",
						message:
							"use direct property access like `capabilities.reader`, or bracket access with a const string key",
					},
				],
			);
		}
	};

	const checkCapabilityServiceAlias = (node: AstNode): void => {
		if (!hasVisibleDiyCapabilitiesParam()) {
			return;
		}
		if (node.type === "VariableDeclarator") {
			const id = getNode(node["id"]);
			if (
				getIdentifierName(node["init"]) === "capabilities" &&
				id != null &&
				id.type === "ObjectPattern"
			) {
				reportCapabilityServiceAlias(id);
				return;
			}
			const init = getNode(node["init"]);
			if (init == null || !isCapabilitiesServiceMember(init)) {
				return;
			}
			reportCapabilityServiceAlias(init);
			return;
		}
		if (node.type === "AssignmentExpression") {
			const left = getNode(node["left"]);
			if (
				getIdentifierName(node["right"]) === "capabilities" &&
				left != null &&
				left.type === "ObjectPattern"
			) {
				reportCapabilityServiceAlias(left);
				return;
			}
			const right = getNode(node["right"]);
			if (left?.type === "Identifier" && right != null && isCapabilitiesServiceMember(right)) {
				reportCapabilityServiceAlias(right);
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
		const reportRenamedDiyImport = (specifier: AstNode): void => {
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
		};
		for (const specifierValue of getArray(node["specifiers"])) {
			const specifier = getNode(specifierValue);
			/* c8 ignore next -- parser import specifier arrays contain specifier nodes. */
			if (specifier == null) {
				continue;
			}
			if (
				specifier.type === "ImportDefaultSpecifier" ||
				specifier.type === "ImportNamespaceSpecifier"
			) {
				reportRenamedDiyImport(specifier);
				continue;
			}
			/* c8 ignore next -- parser import declarations only use known import specifier nodes. */
			if (specifier.type !== "ImportSpecifier") {
				continue;
			}
			/* c8 ignore next -- import specifiers use identifier or literal names. */
			const importedName =
				getIdentifierName(specifier["imported"]) ?? getLiteralString(specifier["imported"]);
			const localName = getIdentifierName(specifier["local"]);
			if (importedName == null || localName == null || importedName === localName) {
				continue;
			}
			reportRenamedDiyImport(specifier);
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
			/* c8 ignore next -- parser export specifier arrays contain specifier nodes. */
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

	const checkCapabilityIdentifier = (node: AstNode, parent: AstNode | null): void => {
		if (getIdentifierName(node) !== "capabilities") {
			return;
		}
		if (functionStack.length === 0 || !hasVisibleDiyCapabilitiesParam()) {
			return;
		}
		if (isNonValueIdentifierParent(parent) || isCapabilitiesParamIdentifier(node, parent)) {
			return;
		}
		if (isObjectLiteralPropertyKey(node, parent)) {
			return;
		}
		if (parent?.type === "MemberExpression" && parent["object"] === node) {
			return;
		}
		if (parent?.type === "VariableDeclarator" && parent["init"] === node) {
			const id = getNode(parent["id"]);
			if (id?.type === "ObjectPattern") {
				return;
			}
		}
		if (parent?.type === "AssignmentExpression" && parent["right"] === node) {
			const left = getNode(parent["left"]);
			if (left?.type === "ObjectPattern") {
				return;
			}
		}
		if (parent?.type === "CallExpression" && getArray(parent["arguments"])[0] === node) {
			return;
		}
		reportCapabilityEscape(node);
	};

	const visit = (value: unknown, parent: AstNode | null): void => {
		if (Array.isArray(value)) {
			for (const item of value) {
				visit(item, parent);
			}
			return;
		}
		const node = getNode(value);
		if (node == null) {
			return;
		}

		nodeStack.push(node);
		const localNamespaceName =
			node.type === "TSModuleDeclaration" ? getIdentifierName(node["id"]) : null;
		if (localNamespaceName != null) {
			const parentNamespaceName = namespaceStack.at(-1);
			namespaceStack.push(
				parentNamespaceName == null
					? localNamespaceName
					: `${parentNamespaceName}.${localNamespaceName}`,
			);
		}
		const isFunction = isFunctionNode(node);
		if (isFunction) {
			enterFunction(node, parent);
		}
		const createsConstantScope = node.type === "BlockStatement";
		if (createsConstantScope) {
			enterConstantScope(node);
		}
		if (node.type === "MemberExpression") {
			checkMemberExpression(node);
		}
		checkNoRenamedDiyImport(node);
		checkNoCapabilitiesReexport(node);
		checkCapabilityServiceAlias(node);
		if (node.type === "Identifier") {
			checkCapabilityIdentifier(node, parent);
		}

		for (const [key, child] of Object.entries(node)) {
			if (key === "type" || key === "start" || key === "end") {
				continue;
			}
			visit(child, node);
		}
		if (isFunction) {
			constantScopes.pop();
			functionStack.pop();
		}
		if (createsConstantScope) {
			constantScopes.pop();
		}
		if (localNamespaceName != null) {
			namespaceStack.pop();
		}
		nodeStack.pop();
	};

	visit(moduleInfo.body, null);
	return violations;
}

function isDefaultParam(param: unknown): boolean {
	return getNode(param)?.type === "AssignmentPattern";
}

function getEffectiveParamType(
	param: unknown,
	params: readonly unknown[],
	contextualFirstParamType: unknown | null,
): unknown {
	return getParamType(getNode(param)) ?? (params[0] === param ? contextualFirstParamType : null);
}

function isTrustedUntypedContextualCapabilitiesFunction(
	node: AstNode,
	parent: AstNode | null,
	nodeStack: readonly AstNode[],
): boolean {
	if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") {
		return false;
	}
	const firstParam = getNode(getArray(node["params"])[0]);
	const firstParamName = getIdentifierName(getIdentifierFromParam(firstParam));
	if (
		getParamType(firstParam) != null ||
		(firstParamName !== "capabilities" && firstParamName !== "_capabilities")
	) {
		return false;
	}
	return isDirectCallArgument(parent, node) || isInsideCallArgumentObject(nodeStack);
}

function isDirectCallArgument(parent: AstNode | null, node: AstNode): boolean {
	return parent?.type === "CallExpression" && getArray(parent["arguments"]).includes(node);
}

function isInsideCallArgumentObject(nodeStack: readonly AstNode[]): boolean {
	for (let index = nodeStack.length - 2; index >= 0; index -= 1) {
		const node = nodeStack[index];
		if (node?.type !== "ObjectExpression") {
			continue;
		}
		for (let parentIndex = index - 1; parentIndex >= 0; parentIndex -= 1) {
			const parent = nodeStack[parentIndex];
			if (parent?.type === "CallExpression" && getArray(parent["arguments"]).includes(node)) {
				return true;
			}
		}
	}
	return false;
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
	/* c8 ignore next -- identifier visits always provide a parent. */
	if (parent == null) {
		return false;
	}
	if (isFunctionNode(parent)) {
		return getArray(parent["params"]).some((param) => getIdentifierFromParam(param) === node);
	}
	return parent.type === "AssignmentPattern" && parent["left"] === node;
}

function isObjectLiteralPropertyKey(node: AstNode, parent: AstNode | null): boolean {
	return (
		parent?.type === "Property" &&
		parent["key"] === node &&
		parent["value"] !== node &&
		parent["shorthand"] !== true
	);
}
