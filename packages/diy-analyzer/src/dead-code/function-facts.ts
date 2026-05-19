import {
	getArray,
	getFirstParam,
	getFunctionName,
	getIdentifierFromParam,
	getIdentifierName,
	getLiteralString,
	getNode,
	getParamType,
	getTypeParameterNames,
	isFunctionNode,
	lineForOffset,
	locationForOffset,
	unwrapDeclaration,
} from "../core/ast.ts";
import { getDiyCapabilitiesAllowedType } from "../core/diy-imports.ts";
import type { ModuleLoader } from "../core/module-loader.ts";
import type { AstNode, ModuleInfo } from "../core/types.ts";
import { scanFunctionBody } from "./function-scan.ts";
import {
	getContextualFunctionType,
	getFunctionTypeFirstParamInfo,
	getFunctionTypeFirstParamType,
} from "./function-types.ts";
import type { DeadCodeFactsByPath, DeadCodeModuleFacts, FunctionInfo } from "./types.ts";

export function materializeFunctionFacts(
	loader: ModuleLoader,
	modules: readonly ModuleInfo[],
): DeadCodeFactsByPath {
	const factsByPath = new Map<string, DeadCodeModuleFacts>();
	for (const moduleInfo of modules) {
		const facts = createFacts();
		factsByPath.set(moduleInfo.filePath, facts);
		collectFunctionNodes(moduleInfo.body, null, moduleInfo, facts);
	}
	for (const moduleInfo of modules) {
		const facts = factsByPath.get(moduleInfo.filePath);
		/* c8 ignore next -- facts are created for every module in this pass. */
		if (facts == null) {
			continue;
		}
		for (const [name, functionNode] of facts.functionNodes) {
			const functionInfo = readFunction(loader, moduleInfo, facts, name, functionNode);
			if (functionInfo != null) {
				facts.functions.set(name, functionInfo);
			}
		}
	}
	return factsByPath;
}

function createFacts(): DeadCodeModuleFacts {
	return {
		functionContextualTypes: new Map(),
		functionClosureCallbacks: new WeakMap(),
		functionNamespaces: new Map(),
		functionNodes: new Map(),
		functions: new Map(),
	};
}

function readFunction(
	loader: ModuleLoader,
	moduleInfo: ModuleInfo,
	facts: DeadCodeModuleFacts,
	name: string,
	functionNode: AstNode,
): FunctionInfo | null {
	const firstParam = getFirstParam(functionNode);
	const namespaceName = facts.functionNamespaces.get(name) ?? null;
	const contextualTypeInfo = getFunctionTypeFirstParamInfo(
		moduleInfo,
		facts.functionContextualTypes.get(name),
		namespaceName,
	);
	const declaredType =
		getDiyCapabilitiesAllowedType(moduleInfo, getParamType(firstParam)) ??
		getDiyCapabilitiesAllowedType(moduleInfo, contextualTypeInfo?.type);
	if (declaredType == null) {
		return null;
	}
	const scan = scanFunctionBody(loader, moduleInfo, facts, functionNode, namespaceName);
	const functionLocation = locationForOffset(moduleInfo.lineStarts, functionNode.start);
	return {
		calls: scan.calls,
		column: functionLocation.column,
		declaredType,
		direct: scan.direct,
		provideChecks: scan.provideChecks.map((check) => ({
			column: locationForOffset(moduleInfo.lineStarts, check.start).column,
			extraType: check.extraType,
			line: lineForOffset(moduleInfo.lineStarts, check.start),
		})),
		filePath: moduleInfo.filePath,
		forwardsTransformedCapabilities: scan.forwardsTransformedCapabilities,
		line: functionLocation.line,
		name,
		namespaceName,
		typeParameters: new Set([
			...getTypeParameterNames(functionNode),
			...(contextualTypeInfo?.opaqueTypeNames ?? []),
		]),
		unsupportedReasons: scan.unsupportedReasons,
	};
}

function collectFunctionNodes(
	value: unknown,
	parent: AstNode | null,
	moduleInfo: ModuleInfo,
	facts: DeadCodeModuleFacts,
	namespaceName: string | null = null,
	ownerName: string | null = null,
	closureTypedCallbacks: ReadonlySet<string> = new Set(),
): void {
	if (Array.isArray(value)) {
		for (const item of value) {
			collectFunctionNodes(
				item,
				parent,
				moduleInfo,
				facts,
				namespaceName,
				ownerName,
				closureTypedCallbacks,
			);
		}
		return;
	}
	const node = getNode(value);
	if (node == null) {
		return;
	}
	const declaration = unwrapDeclaration(node);
	const localNamespaceName =
		declaration.type === "TSModuleDeclaration" ? getIdentifierName(declaration["id"]) : null;
	let childNamespaceName = namespaceName;
	if (localNamespaceName != null) {
		childNamespaceName =
			namespaceName == null ? localNamespaceName : `${namespaceName}.${localNamespaceName}`;
	}
	const childOwnerName = getChildOwnerName(declaration, ownerName);
	if (isFunctionNode(declaration)) {
		const name = getCollectedFunctionName(moduleInfo, declaration, parent, ownerName);
		const qualifiedName = namespaceName == null ? name : `${namespaceName}.${name}`;
		facts.functionNodes.set(qualifiedName, declaration);
		facts.functionClosureCallbacks.set(declaration, closureTypedCallbacks);
		if (namespaceName == null) {
			facts.functionNamespaces.delete(qualifiedName);
		} else {
			facts.functionNamespaces.set(qualifiedName, namespaceName);
		}
		const contextualType = getContextualFunctionType(parent);
		if (contextualType == null) {
			facts.functionContextualTypes.delete(qualifiedName);
		} else {
			facts.functionContextualTypes.set(qualifiedName, contextualType);
		}
	}
	const childClosureTypedCallbacks = isFunctionNode(declaration)
		? mergeSets(
				closureTypedCallbacks,
				getTypedCallbackParamNames(moduleInfo, declaration, namespaceName),
			)
		: closureTypedCallbacks;
	for (const [key, child] of Object.entries(declaration)) {
		if (key === "type" || key === "start" || key === "end") {
			continue;
		}
		collectFunctionNodes(
			child,
			declaration,
			moduleInfo,
			facts,
			childNamespaceName,
			childOwnerName,
			childClosureTypedCallbacks,
		);
	}
}

function getTypedCallbackParamNames(
	moduleInfo: ModuleInfo,
	node: AstNode,
	namespaceName: string | null,
): ReadonlySet<string> {
	const names = new Set<string>();
	for (const param of getArray(node["params"])) {
		const name = getIdentifierName(getIdentifierFromParam(param));
		if (name == null) {
			continue;
		}
		const firstParamType = getFunctionTypeFirstParamType(
			moduleInfo,
			getParamType(getNode(param)),
			namespaceName,
		);
		if (getDiyCapabilitiesAllowedType(moduleInfo, firstParamType) != null) {
			names.add(name);
		}
	}
	return names;
}

function mergeSets(left: ReadonlySet<string>, right: ReadonlySet<string>): ReadonlySet<string> {
	if (left.size === 0) {
		return right;
	}
	if (right.size === 0) {
		return left;
	}
	return new Set([...left, ...right]);
}

function getCollectedFunctionName(
	moduleInfo: ModuleInfo,
	node: AstNode,
	parent: AstNode | null,
	ownerName: string | null,
): string {
	const normalName = getFunctionName(node, parent);
	if (normalName != null) {
		return normalName;
	}
	const propertyName = getParentPropertyName(parent);
	if (propertyName != null) {
		/* c8 ignore next -- property traversal supplies an owner name before visiting the value. */
		return ownerName ?? propertyName;
	}
	const location = locationForOffset(moduleInfo.lineStarts, node.start);
	return `<anonymous>@${location.line}:${location.column}`;
}

function getChildOwnerName(node: AstNode, ownerName: string | null): string | null {
	if (node.type === "VariableDeclarator") {
		return getIdentifierName(node["id"]) ?? ownerName;
	}
	if (
		node.type === "ClassDeclaration" ||
		node.type === "ClassExpression" ||
		node.type === "TSModuleDeclaration"
	) {
		return getIdentifierName(node["id"]) ?? ownerName;
	}
	const propertyName = getParentPropertyName(node);
	if (propertyName != null) {
		return ownerName == null ? propertyName : `${ownerName}.${propertyName}`;
	}
	return ownerName;
}

function getParentPropertyName(parent: AstNode | null): string | null {
	if (parent?.type !== "Property" && parent?.type !== "MethodDefinition") {
		return null;
	}
	return getStaticPropertyName(parent["key"]);
}

function getStaticPropertyName(value: unknown): string | null {
	return getIdentifierName(value) ?? getLiteralString(value);
}
