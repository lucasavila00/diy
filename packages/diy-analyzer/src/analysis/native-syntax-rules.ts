import { SyntaxKind } from "@typescript/native-preview/unstable/ast";
import type {
	FunctionLikeDeclaration,
	ImportDeclaration,
	ImportSpecifier,
	Node,
	TypeNode,
} from "@typescript/native-preview/unstable/ast";
import type { Checker, Diagnostic, Project } from "@typescript/native-preview/unstable/sync";

import type {
	DiyAnalyzerNote,
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
} from "../model/types.ts";
import {
	intersectionTypes,
	isFunctionLike,
	literalText,
	locationForOffset,
	nodeName,
	staticName,
} from "./ast-utils.ts";
import { resolvedDiyCapabilitiesType } from "./capability-types.ts";
import type { AnalyzedSourceFile } from "./native-types.ts";
import { diyImportSources } from "./native-types.ts";

type FunctionFrame = {
	readonly name: string | null;
};

export function analyzeNativeDiySyntax(
	project: Project,
	sourceFiles: readonly AnalyzedSourceFile[],
): readonly DiyAnalyzerViolation[] {
	const violations: DiyAnalyzerViolation[] = [];
	for (const sourceFile of sourceFiles) {
		if (!sourceFile.reportable) {
			continue;
		}
		violations.push(...analyzeSourceFileSyntax(project.checker, sourceFile));
	}
	return violations;
}

export function collectNativeParseErrors(
	project: Project,
	sourceFiles: readonly AnalyzedSourceFile[],
): readonly DiyAnalyzerUnsupported[] {
	const unsupported: DiyAnalyzerUnsupported[] = [];
	for (const sourceFile of sourceFiles) {
		if (!sourceFile.reportable) {
			continue;
		}
		for (const diagnostic of project.program.getSyntacticDiagnostics(sourceFile.filePath)) {
			unsupported.push(parseError(sourceFile, diagnostic));
		}
	}
	return unsupported;
}

function analyzeSourceFileSyntax(
	checker: Checker,
	sourceFile: AnalyzedSourceFile,
): readonly DiyAnalyzerViolation[] {
	const violations: DiyAnalyzerViolation[] = [];
	const functionStack: FunctionFrame[] = [];

	const currentFunctionName = (): string | undefined => {
		const name = functionStack.at(-1)?.name;
		return name == null ? undefined : name;
	};
	const report = (
		node: Node,
		name: string,
		reason: string,
		notes?: DiyAnalyzerViolation["notes"],
	): void => {
		const location = locationForNode(sourceFile, node);
		const functionName = currentFunctionName();
		violations.push({
			column: location.column,
			filePath: sourceFile.filePath,
			line: location.line,
			name,
			/* c8 ignore next -- rule reports either include notes or omit them intentionally. */
			...(notes == null ? {} : { notes }),
			/* c8 ignore next -- module-level import/export reports do not have a function name. */
			...(functionName == null ? {} : { functionName }),
			reason,
		});
	};

	const visit = (node: Node, parent: Node | null): void => {
		const isFunction = isFunctionLike(node);
		if (isFunction) {
			functionStack.push({
				name: nativeFunctionName(node, parent),
			});
			checkCapabilitiesParameters(checker, node, report);
		}
		if (node.kind === SyntaxKind.ImportDeclaration) {
			checkNoRenamedDiyImport(node as ImportDeclaration, report);
		}

		node.forEachChild((child) => visit(child, node));
		if (isFunction) {
			functionStack.pop();
		}
	};
	visit(sourceFile.sourceFile, null);
	return violations;
}

function checkCapabilitiesParameters(
	checker: Checker,
	node: FunctionLikeDeclaration,
	report: (node: Node, name: string, reason: string, notes?: DiyAnalyzerViolation["notes"]) => void,
): void {
	for (const [index, param] of node.parameters.entries()) {
		const name = staticName(param.name);
		const isCapabilitiesName = name === "capabilities" || name === "_capabilities";
		const hasIntersectedDiyCapabilitiesType =
			param.type != null && hasDiyCapabilitiesIntersection(checker, param.type);
		const hasDiyCapabilitiesType =
			param.type != null && resolvedDiyCapabilitiesType(checker, param.type) != null;
		const hasNonDiyCapabilitiesAnnotation =
			isCapabilitiesName &&
			param.type != null &&
			!hasDiyCapabilitiesType &&
			!hasIntersectedDiyCapabilitiesType;

		if (!isCapabilitiesName && !hasDiyCapabilitiesType && !hasIntersectedDiyCapabilitiesType) {
			continue;
		}
		if (hasIntersectedDiyCapabilitiesType) {
			report(
				param,
				"invalid capabilities type",
				"Do not compose capability bags with intersections. Put the capability union inside one `Capabilities<...>` type.",
				[
					{
						kind: "help",
						message: "write `Capabilities<A | B>` instead of `Capabilities<A> & Capabilities<B>`",
					},
				],
			);
		}
		if (!isCapabilitiesName) {
			report(
				param,
				"invalid capabilities parameter",
				"Capabilities parameters must be named `capabilities` or `_capabilities`.",
				[capabilitiesParameterHelp()],
			);
		}
		if (hasNonDiyCapabilitiesAnnotation) {
			report(
				param,
				"invalid capabilities parameter",
				"`capabilities` parameters with a type annotation must resolve to DIY `Capabilities<...>`.",
				[capabilitiesParameterHelp()],
			);
		}
		if (index !== 0) {
			report(
				param,
				"invalid capabilities parameter",
				"Capabilities parameters must be the first parameter.",
				[capabilitiesParameterHelp()],
			);
		}
	}
}

function hasDiyCapabilitiesIntersection(checker: Checker, typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.IntersectionType) {
		return false;
	}
	return intersectionTypes(typeNode).some(
		(member) => resolvedDiyCapabilitiesType(checker, member) != null,
	);
}

function checkNoRenamedDiyImport(
	node: ImportDeclaration,
	report: (node: Node, name: string, reason: string, notes?: DiyAnalyzerViolation["notes"]) => void,
): void {
	const source = literalText(node.moduleSpecifier);
	if (source == null || !diyImportSources.has(source)) {
		return;
	}

	const reportRenamedDiyImport = (specifier: Node): void => {
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

	const clause = node.importClause;
	if (clause?.name != null) {
		reportRenamedDiyImport(clause.name);
	}
	const namedBindings = clause?.namedBindings;
	if (namedBindings == null) {
		return;
	}
	if (namedBindings.kind === SyntaxKind.NamespaceImport) {
		reportRenamedDiyImport(namedBindings);
		return;
	}
	/* c8 ignore next -- named bindings are either namespace imports or named imports. */
	if (namedBindings.kind !== SyntaxKind.NamedImports) {
		return;
	}
	for (const specifier of namedBindings.elements) {
		if (isRenamedImportSpecifier(specifier)) {
			reportRenamedDiyImport(specifier);
		}
	}
}

function isRenamedImportSpecifier(specifier: ImportSpecifier): boolean {
	const importedName =
		specifier.propertyName == null ? specifier.name.text : staticName(specifier.propertyName);
	return importedName != null && importedName !== specifier.name.text;
}

function nativeFunctionName(node: FunctionLikeDeclaration, parent: Node | null): string | null {
	const named = nodeName(node);
	if (named != null) {
		return named;
	}
	if (parent?.kind === SyntaxKind.VariableDeclaration) {
		return nodeName(parent);
	}
	if (parent?.kind === SyntaxKind.PropertyAssignment) {
		return nodeName(parent);
	}
	return null;
}

function locationForNode(
	sourceFile: AnalyzedSourceFile,
	node: Node,
): { readonly column: number; readonly line: number } {
	const text = sourceFile.sourceFile.text.slice(node.pos, node.end);
	const offset = node.pos + Math.max(0, text.search(/\S/));
	return locationForOffset(sourceFile.lineStarts(), offset);
}

function parseError(
	sourceFile: AnalyzedSourceFile,
	diagnostic: Diagnostic,
): DiyAnalyzerUnsupported {
	const location = locationForOffset(sourceFile.lineStarts(), diagnostic.pos);
	return {
		column: location.column,
		filePath: sourceFile.filePath,
		line: location.line,
		reason: diagnosticMessage(diagnostic),
	};
}

function diagnosticMessage(diagnostic: Diagnostic): string {
	const chain = diagnostic.messageChain ?? [];
	return [diagnostic.text, ...chain.map(diagnosticMessage)].join(" ");
}

function capabilitiesParameterHelp(): DiyAnalyzerNote {
	return {
		kind: "help",
		message:
			"write the signature as `function run(capabilities: Capabilities<AppCapability>, ...)`",
	};
}
