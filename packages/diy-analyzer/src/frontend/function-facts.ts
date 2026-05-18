import {
	getFirstParam,
	getParamType,
	getTypeParameterNames,
	lineForOffset,
	locationForOffset,
} from "./ast.ts";
import { getDiyCapabilitiesAllowedType } from "./diy-imports.ts";
import { scanFunctionBody } from "./function-scan.ts";
import { getFunctionTypeFirstParamType } from "./function-types.ts";
import type { ModuleLoader } from "./module-loader.ts";
import type { AstNode, FunctionInfo, ModuleInfo } from "./types.ts";

export function materializeFunctionFacts(loader: ModuleLoader): void {
	for (const moduleInfo of loader.allModules()) {
		/* c8 ignore next -- materialization is called once per program build. */
		if (moduleInfo.functions.size > 0) {
			continue;
		}
		for (const [name, functionNode] of moduleInfo.functionNodes) {
			const functionInfo = readFunction(loader, moduleInfo, name, functionNode);
			if (functionInfo != null) {
				moduleInfo.functions.set(name, functionInfo);
			}
		}
	}
}

function readFunction(
	loader: ModuleLoader,
	moduleInfo: ModuleInfo,
	name: string,
	functionNode: AstNode,
): FunctionInfo | null {
	const firstParam = getFirstParam(functionNode);
	const contextualType = getFunctionTypeFirstParamType(
		moduleInfo,
		moduleInfo.functionContextualTypes.get(name),
	);
	const declaredType =
		getDiyCapabilitiesAllowedType(moduleInfo, getParamType(firstParam)) ??
		getDiyCapabilitiesAllowedType(moduleInfo, contextualType);
	if (declaredType == null) {
		return null;
	}
	const scan = scanFunctionBody(loader, moduleInfo, functionNode);
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
		namespaceName: moduleInfo.functionNamespaces.get(name) ?? null,
		typeParameters: getTypeParameterNames(functionNode),
		unsupportedReasons: scan.unsupportedReasons,
	};
}
