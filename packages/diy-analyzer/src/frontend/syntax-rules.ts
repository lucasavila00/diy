import type { DiyAnalyzerNote, DiyAnalyzerViolation } from "../middle-end/types.ts";
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
import { isDiyCapabilitiesType, publicDiyImportSources } from "./diy-imports.ts";
import type { ModuleLoader } from "./module-loader.ts";
import {
	collectVariableDeclarationConstants,
	resolveStaticMemberName,
	resolveStringConstantName,
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
	/* istanbul ignore next -- callers only invoke syntax analysis for reportable modules. */
	if (!moduleInfo.reportable) {
		return [];
	}

	const violations: DiyAnalyzerViolation[] = [];
	const functionStack: FunctionFrame[] = [];
	const constantScopes: Map<string, StringConstantBinding>[] = [];
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
			"Use `capabilities` only for static service property access, destructuring, or as the first argument to another effectful function.",
			[
				{
					kind: "help",
					message:
						"keep capability flow statically analyzable: read services directly, destructure static service names, or forward `capabilities` as the first argument to a named effectful function",
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

	const checkCapabilitiesDestructure = (node: AstNode): void => {
		if (!hasVisibleDiyCapabilitiesParam()) {
			return;
		}
		if (node.type !== "VariableDeclarator" || getIdentifierName(node["init"]) !== "capabilities") {
			return;
		}
		const id = getNode(node["id"]);
		if (id?.type !== "ObjectPattern") {
			return;
		}
		for (const propertyValue of getArray(id["properties"])) {
			const property = getNode(propertyValue);
			if (property?.type === "RestElement") {
				reportCapabilityEscape(property);
				continue;
			}
			if (property?.type !== "Property" || property["computed"] !== true) {
				continue;
			}
			if (
				resolveObjectPatternComputedKey(
					{ loader, localConstants: constantScopes, moduleInfo },
					property["key"],
				) != null
			) {
				continue;
			}
			report(
				property,
				"dynamic capability access",
				"Capability destructuring must use a static property name.",
				[
					{
						kind: "help",
						message: "use direct property names like `{ reader }`, or computed const string keys",
					},
				],
			);
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
		if (parent?.type === "MemberExpression" && parent["object"] === node) {
			return;
		}
		if (parent?.type === "VariableDeclarator" && parent["init"] === node) {
			const id = getNode(parent["id"]);
			if (id?.type === "ObjectPattern") {
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
		checkCapabilitiesDestructure(node);
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
	};

	visit(moduleInfo.body, null);
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
	/* c8 ignore next -- computed destructuring fixtures use identifiers or literals. */
	if (name == null) {
		return null;
	}
	return resolveStringConstantName(context, name);
}
