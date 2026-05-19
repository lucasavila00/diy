import {
	getArray,
	getFunctionName,
	getIdentifierFromParam,
	getIdentifierName,
	getLiteralString,
	getNode,
	getParamType,
	isFunctionNode,
	locationForOffset,
} from "../core/ast.ts";
import { isDiyCapabilitiesType, publicDiyImportSources } from "../core/diy-imports.ts";
import type { AstNode, ModuleInfo } from "../core/types.ts";
import type { DiyAnalyzerNote, DiyAnalyzerViolation } from "../model/types.ts";

type FunctionFrame = {
	readonly name: string | null;
};

export function analyzeDiySyntax(moduleInfo: ModuleInfo): readonly DiyAnalyzerViolation[] {
	/* c8 ignore next -- callers only invoke syntax analysis for reportable modules. */
	if (!moduleInfo.reportable) {
		return [];
	}

	const violations: DiyAnalyzerViolation[] = [];
	const functionStack: FunctionFrame[] = [];

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

	const enterFunction = (node: AstNode, parent: AstNode | null): void => {
		functionStack.push({
			name: getFunctionName(node, parent),
		});
		for (const [index, paramValue] of getArray(node["params"]).entries()) {
			const param = getNode(paramValue);
			const identifier = getIdentifierFromParam(param);
			const name = getIdentifierName(identifier);
			const isCapabilitiesName = name === "capabilities" || name === "_capabilities";
			const typeNode = getParamType(param);
			const hasDiyCapabilitiesType = isDiyCapabilitiesType(moduleInfo, typeNode);
			const hasNonDiyCapabilitiesAnnotation =
				isCapabilitiesName && typeNode != null && !hasDiyCapabilitiesType;
			/* c8 ignore next -- reports are only reached for parsed parameter nodes. */
			const reportNode = param ?? identifier;
			/* c8 ignore start -- reports are only reached for parsed parameter nodes. */
			if (reportNode == null) {
				continue;
			}
			/* c8 ignore stop */

			if (!isCapabilitiesName && !hasDiyCapabilitiesType) {
				continue;
			}
			if (!isCapabilitiesName) {
				report(
					reportNode,
					"invalid capabilities parameter",
					"Capabilities parameters must be named `capabilities` or `_capabilities`.",
					[capabilitiesParameterHelp()],
				);
			}
			if (hasNonDiyCapabilitiesAnnotation) {
				report(
					reportNode,
					"invalid capabilities parameter",
					"`capabilities` parameters with a type annotation must use DIY `Capabilities<...>`.",
					[capabilitiesParameterHelp()],
				);
			}
			if (index !== 0) {
				report(
					reportNode,
					"invalid capabilities parameter",
					"Capabilities parameters must be the first parameter.",
					[capabilitiesParameterHelp()],
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
		checkNoRenamedDiyImport(node);

		for (const [key, child] of Object.entries(node)) {
			if (key === "type" || key === "start" || key === "end") {
				continue;
			}
			visit(child, node);
		}
		if (isFunction) {
			functionStack.pop();
		}
	};

	visit(moduleInfo.body, null);
	return violations;
}

function capabilitiesParameterHelp(): DiyAnalyzerNote {
	return {
		kind: "help",
		message:
			"write the signature as `function run(capabilities: Capabilities<AppCapability>, ...)`",
	};
}
