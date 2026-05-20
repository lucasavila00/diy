/* oxlint-disable local/no-type-assertion */
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import {
	SyntaxKind,
	isExpression,
	skipOuterExpressions,
} from "@typescript/native-preview/unstable/ast";
import type {
	CallExpression,
	ElementAccessExpression,
	Expression,
	FunctionLikeDeclaration,
	Identifier,
	ImportDeclaration,
	Node,
	PropertyAccessExpression,
	SourceFile,
	TypeNode,
} from "@typescript/native-preview/unstable/ast";
import { API, SignatureKind, TypeFlags } from "@typescript/native-preview/unstable/sync";
import type {
	Checker,
	Project,
	Signature,
	Symbol as TsgoSymbol,
	Type,
} from "@typescript/native-preview/unstable/sync";

import type { DiagnosticSuppression } from "../core/diagnostic-suppressions.ts";
import { expandSourceFiles } from "../core/source-files.ts";
import type { DiySourceConfig } from "../core/source-files.ts";
import type {
	DiyAnalyzerNote,
	DiyAnalyzerUnsupported,
	DiyAnalyzerViolation,
	DiyModuleGraph,
	DiyModuleGraphCall,
	DiyModuleGraphFunction,
	DiyModuleGraphModule,
	DiyUnusedCapabilityFinding,
} from "../model/types.ts";

type NativeSourceModule = {
	readonly filePath: string;
	readonly imports: ReadonlyMap<string, ImportBinding>;
	readonly lineStarts: readonly number[];
	readonly reportable: boolean;
	readonly sourceFile: SourceFile;
};

type ImportBinding = {
	readonly importedName: string;
	readonly kind: "named" | "namespace";
	readonly source: string;
};

type NativeFact = {
	readonly calls: NativeCall[];
	readonly column: number;
	readonly declared: ReadonlySet<string>;
	readonly declaredOpaque: boolean;
	readonly direct: Set<string>;
	readonly filePath: string;
	readonly id: string;
	readonly line: number;
	readonly moduleInfo: NativeSourceModule;
	readonly name: string;
	readonly paramName: string;
	readonly paramSymbol: TsgoSymbol;
	readonly provideChecks: NativeProvideCheck[];
	readonly reportable: boolean;
	readonly unsupportedReasons: NativeUnsupportedReason[];
};

type NativeCall = {
	readonly calleeName: string;
	readonly provided: ReadonlySet<string>;
	readonly required: ReadonlySet<string>;
	readonly targetId: string | null;
};

type NativeProvideCheck = {
	readonly column: number;
	readonly extra: ReadonlySet<string>;
	readonly line: number;
};

type NativeUnsupportedReason =
	| {
			readonly column?: number;
			readonly kind: "dynamic-capability-access";
			readonly line?: number;
	  }
	| {
			readonly kind: "generic-direct-read";
	  }
	| {
			readonly kind: "unresolved-declaration";
	  }
	| {
			readonly kind: "unresolved-forwarding";
	  };

type NativeDiyAnalysisProgram = {
	readonly api: API;
	readonly coveredFiles: readonly string[];
	readonly facts: readonly NativeFact[];
	readonly project: Project;
	readonly suppressions: {
		readonly suppressions: readonly DiagnosticSuppression[];
		readonly violations: readonly DiyAnalyzerViolation[];
	};
};

const diyImportSources = new Set(["@beff/diy", "@beff/diy/capabilities"]);

/* c8 ignore start -- tsgo/native-preview behavior is covered through CLI fixtures; line coverage on checker fallback branches is not stable enough to be useful. */
export async function analyzeNativeDeadCode(
	config: DiySourceConfig,
	cwd: string,
): Promise<{
	readonly coveredFiles: readonly string[];
	readonly findings: readonly DiyUnusedCapabilityFinding[];
	readonly suppressions: NativeDiyAnalysisProgram["suppressions"];
	readonly unsupported: readonly DiyAnalyzerUnsupported[];
	readonly violations: readonly DiyAnalyzerViolation[];
}> {
	const program = await buildNativeDiyAnalysisProgram(config, cwd);
	try {
		const required = computeRequired(program.facts);
		return {
			coveredFiles: program.coveredFiles,
			findings: collectUnusedFindings(program.facts, required),
			suppressions: program.suppressions,
			unsupported: collectUnsupported(program.facts),
			violations: collectProvideViolations(program.facts),
		};
	} finally {
		closeNativeProgram(program);
	}
}

export async function analyzeNativeModuleGraph(
	config: DiySourceConfig,
	cwd: string,
): Promise<DiyModuleGraph> {
	const program = await buildNativeDiyAnalysisProgram(config, cwd);
	try {
		const required = computeRequired(program.facts);
		const factsByModule = new Map<string, NativeFact[]>();
		for (const fact of program.facts) {
			const existing = factsByModule.get(fact.filePath) ?? [];
			existing.push(fact);
			factsByModule.set(fact.filePath, existing);
		}
		const modules: DiyModuleGraphModule[] = [];
		for (const [filePath, facts] of factsByModule) {
			const moduleInfo = facts[0]?.moduleInfo;
			if (moduleInfo == null) {
				continue;
			}
			modules.push({
				filePath,
				functions: facts
					.slice()
					.sort(compareFacts)
					.map((fact) => graphFunction(fact, program.facts, required)),
				imports: [],
				reportable: moduleInfo.reportable,
			});
		}
		return {
			modules: modules.sort((left, right) => left.filePath.localeCompare(right.filePath)),
		};
	} finally {
		closeNativeProgram(program);
	}
}

async function buildNativeDiyAnalysisProgram(
	config: DiySourceConfig,
	cwd: string,
): Promise<NativeDiyAnalysisProgram> {
	const coveredFiles = await expandSourceFiles(config, cwd);
	const coveredSet = new Set(coveredFiles);
	const configInfo = resolveProjectConfig(cwd, coveredFiles);
	const api = new API({
		cwd,
		...(configInfo.configContent == null
			? {}
			: {
					fs: {
						fileExists: (fileName) => (fileName === configInfo.configPath ? true : undefined),
						readFile: (fileName) =>
							fileName === configInfo.configPath ? configInfo.configContent : undefined,
					},
				}),
	});
	try {
		const snapshot = api.updateSnapshot({ openProject: configInfo.configPath });
		const project = snapshot.getProject(configInfo.configPath);
		if (project == null) {
			throw new Error(`Failed to open TypeScript project ${configInfo.configPath}.`);
		}
		const modules = collectNativeModules(project, coveredSet, cwd);
		const facts = collectNativeFacts(project, modules);
		return {
			api,
			coveredFiles,
			facts,
			project,
			suppressions: collectNativeSuppressions(
				modules.filter((moduleInfo) => moduleInfo.reportable),
			),
		};
	} catch (error) {
		api.close();
		throw error;
	}
}

function closeNativeProgram(program: NativeDiyAnalysisProgram): void {
	program.api.close();
}

function resolveProjectConfig(
	cwd: string,
	coveredFiles: readonly string[],
): { readonly configContent: string | null; readonly configPath: string } {
	const tsconfigPath = findConfigFile(cwd);
	if (tsconfigPath != null) {
		return { configContent: null, configPath: tsconfigPath };
	}
	const configPath = join(cwd, ".diy-tsgo.tsconfig.json");
	return {
		configContent: `${JSON.stringify(
			{
				compilerOptions: {
					allowImportingTsExtensions: true,
					baseUrl: cwd,
					module: "NodeNext",
					moduleResolution: "NodeNext",
					noEmit: true,
					paths: localDiyPaths(cwd),
					strict: true,
					target: "ES2022",
					types: [],
				},
				files: coveredFiles,
			},
			null,
			"\t",
		)}\n`,
		configPath,
	};
}

function findConfigFile(startDir: string): string | null {
	let current = resolve(startDir);
	while (true) {
		const candidate = join(current, "tsconfig.json");
		if (existsSync(candidate)) {
			return candidate;
		}
		const parent = dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

function localDiyPaths(cwd: string): Record<string, readonly string[]> {
	const packageRoot = findDiyPackageRoot(cwd);
	if (packageRoot == null) {
		return {};
	}
	return {
		"@beff/diy": [relative(cwd, join(packageRoot, "src/index.ts"))],
		"@beff/diy/capabilities": [relative(cwd, join(packageRoot, "src/capabilities.ts"))],
	};
}

function findDiyPackageRoot(cwd: string): string | null {
	let current = resolve(cwd);
	while (true) {
		const candidate = join(current, "packages/diy/package.json");
		if (existsSync(candidate)) {
			return join(current, "packages/diy");
		}
		const parent = dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

function collectNativeModules(
	project: Project,
	coveredSet: ReadonlySet<string>,
	cwd: string,
): readonly NativeSourceModule[] {
	const modules: NativeSourceModule[] = [];
	const seen = new Set<string>();
	const queue = Array.from(new Set([...project.rootFiles, ...coveredSet])).sort();
	for (let index = 0; index < queue.length; index += 1) {
		const filePath = resolve(queue[index] ?? "");
		if (seen.has(filePath) || shouldSkipSourceFile(filePath, cwd)) {
			continue;
		}
		seen.add(filePath);
		const sourceFile = project.program.getSourceFile(filePath);
		if (sourceFile == null || sourceFile.isDeclarationFile) {
			continue;
		}
		for (const importedPath of importedProjectFiles(project, sourceFile, cwd)) {
			if (!seen.has(importedPath)) {
				queue.push(importedPath);
			}
		}
		modules.push({
			filePath,
			imports: collectImports(sourceFile),
			lineStarts: lineStarts(sourceFile.text),
			reportable: coveredSet.has(filePath),
			sourceFile,
		});
	}
	return modules.sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function shouldSkipSourceFile(filePath: string, cwd: string): boolean {
	return (
		filePath.includes("/node_modules/") ||
		filePath.endsWith(".d.ts") ||
		(!filePath.startsWith(resolve(cwd)) && !filePath.includes("/packages/diy/src/"))
	);
}

function importedProjectFiles(
	project: Project,
	sourceFile: SourceFile,
	cwd: string,
): readonly string[] {
	const result: string[] = [];
	for (const statement of sourceFile.statements) {
		if (statement.kind !== SyntaxKind.ImportDeclaration) {
			continue;
		}
		const source = literalText((statement as ImportDeclaration).moduleSpecifier);
		if (source == null || !source.startsWith(".")) {
			continue;
		}
		for (const candidate of importCandidates(sourceFile.fileName, source)) {
			const filePath = resolve(candidate);
			if (!filePath.startsWith(resolve(cwd))) {
				continue;
			}
			if (project.program.getSourceFile(filePath) != null) {
				result.push(filePath);
				break;
			}
		}
	}
	return result.sort();
}

function importCandidates(containingFile: string, source: string): readonly string[] {
	const base = resolve(dirname(containingFile), source);
	if (source.endsWith(".ts")) {
		return [base];
	}
	return [`${base}.ts`, join(base, "index.ts")];
}

function collectImports(sourceFile: SourceFile): ReadonlyMap<string, ImportBinding> {
	const imports = new Map<string, ImportBinding>();
	for (const statement of sourceFile.statements) {
		if (statement.kind !== SyntaxKind.ImportDeclaration) {
			continue;
		}
		const node = statement as ImportDeclaration;
		const source = literalText(node.moduleSpecifier);
		const clause = node.importClause;
		if (source == null || clause == null) {
			continue;
		}
		const namedBindings = clause.namedBindings;
		if (namedBindings?.kind === SyntaxKind.NamespaceImport) {
			imports.set(namedBindings.name.text, {
				importedName: "*",
				kind: "namespace",
				source,
			});
			continue;
		}
		if (namedBindings?.kind !== SyntaxKind.NamedImports) {
			continue;
		}
		for (const specifier of namedBindings.elements) {
			const importedName = specifier.propertyName?.text ?? specifier.name.text;
			imports.set(specifier.name.text, {
				importedName,
				kind: "named",
				source,
			});
		}
	}
	return imports;
}

function collectNativeFacts(
	project: Project,
	modules: readonly NativeSourceModule[],
): readonly NativeFact[] {
	const facts: NativeFact[] = [];
	const factsByDeclaration = new Map<string, NativeFact>();
	for (const moduleInfo of modules) {
		collectFunctionFacts(project, moduleInfo, facts, factsByDeclaration);
	}
	for (const fact of facts) {
		scanFunctionBody(project, fact, factsByDeclaration);
	}
	return facts.sort(compareFacts);
}

function collectFunctionFacts(
	project: Project,
	moduleInfo: NativeSourceModule,
	facts: NativeFact[],
	factsByDeclaration: Map<string, NativeFact>,
): void {
	const namespaceStack: string[] = [];
	const visit = (node: Node, ownerName: string | null): void => {
		if (node.kind === SyntaxKind.ModuleDeclaration) {
			const name = staticName((node as unknown as Record<string, unknown>)["name"]);
			if (name != null) {
				namespaceStack.push(name);
				node.forEachChild((child) => visit(child, ownerName));
				namespaceStack.pop();
				return;
			}
		}
		const nextOwnerName = childOwnerName(node, ownerName);
		if (isFunctionLike(node)) {
			const fact = readNativeFact(project, moduleInfo, node, nextOwnerName, namespaceStack);
			if (fact != null) {
				facts.push(fact);
				factsByDeclaration.set(nodeKey(node), fact);
			}
		}
		node.forEachChild((child) => visit(child, nextOwnerName));
	};
	visit(moduleInfo.sourceFile, null);
}

function readNativeFact(
	project: Project,
	moduleInfo: NativeSourceModule,
	node: FunctionLikeDeclaration,
	ownerName: string | null,
	namespaceStack: readonly string[],
): NativeFact | null {
	const firstParam = node.parameters[0];
	if (firstParam == null || firstParam.type == null) {
		return null;
	}
	if (!isDiyCapabilitiesType(moduleInfo, firstParam.type)) {
		return null;
	}
	const paramSymbol = project.checker.getSymbolAtLocation(firstParam.name);
	if (paramSymbol == null) {
		return null;
	}
	const declaredType = project.checker.getTypeFromTypeNode(firstParam.type);
	const declared =
		declaredType == null ? new Set<string>() : capabilityIds(project.checker, declaredType);
	const declaredOpaque = isOpaqueCapabilitiesType(project.checker, firstParam.type);
	const location = functionLocation(moduleInfo, node);
	const localName = functionName(moduleInfo, node, ownerName);
	const name = namespaceStack.length === 0 ? localName : `${namespaceStack.join(".")}.${localName}`;
	const unsupportedReasons: NativeUnsupportedReason[] = [];
	if (declared.size === 0 && !declaredOpaque && !isNeverCapabilitiesType(firstParam.type)) {
		unsupportedReasons.push({ kind: "unresolved-declaration" });
	}
	return {
		calls: [],
		column: location.column,
		declared,
		declaredOpaque,
		direct: new Set(),
		filePath: moduleInfo.filePath,
		id: nodeKey(node),
		line: location.line,
		moduleInfo,
		name,
		paramName: staticName(firstParam.name) ?? "",
		paramSymbol,
		provideChecks: [],
		reportable: moduleInfo.reportable,
		unsupportedReasons,
	};
}

function scanFunctionBody(
	project: Project,
	fact: NativeFact,
	factsByDeclaration: ReadonlyMap<string, NativeFact>,
): void {
	const visit = (node: Node): void => {
		if (
			node !== factNode(project, fact) &&
			isFunctionLike(node) &&
			hasOwnCapabilitiesBinding(project, fact.moduleInfo, node)
		) {
			return;
		}
		if (node.kind === SyntaxKind.PropertyAccessExpression) {
			scanPropertyAccess(project, fact, node as PropertyAccessExpression);
		} else if (node.kind === SyntaxKind.ElementAccessExpression) {
			scanElementAccess(project, fact, node as ElementAccessExpression);
		} else if (node.kind === SyntaxKind.CallExpression) {
			scanCall(project, fact, factsByDeclaration, node as CallExpression);
		}
		node.forEachChild(visit);
	};
	const node = factNode(project, fact);
	if (node != null) {
		visit(node);
	}
	if (fact.declaredOpaque && fact.direct.size > 0) {
		fact.unsupportedReasons.push({ kind: "generic-direct-read" });
	}
}

function factNode(project: Project, fact: NativeFact): Node | undefined {
	return project.program.getSourceFile(fact.filePath)?.forEachChild(function find(node):
		| Node
		| undefined {
		if (nodeKey(node) === fact.id) {
			return node;
		}
		return node.forEachChild(find);
	});
}

function scanPropertyAccess(
	project: Project,
	fact: NativeFact,
	node: PropertyAccessExpression,
): void {
	if (!sameSymbol(project.checker.getSymbolAtLocation(node.expression), fact.paramSymbol)) {
		return;
	}
	const id = staticName(node.name);
	if (
		id == null ||
		node.name.kind === SyntaxKind.PrivateIdentifier ||
		node.questionDotToken != null
	) {
		const location = locationForNode(fact.moduleInfo, node);
		fact.unsupportedReasons.push({
			column: location.column,
			kind: "dynamic-capability-access",
			line: location.line,
		});
		return;
	}
	fact.direct.add(id);
}

function scanElementAccess(
	project: Project,
	fact: NativeFact,
	node: ElementAccessExpression,
): void {
	if (!sameSymbol(project.checker.getSymbolAtLocation(node.expression), fact.paramSymbol)) {
		return;
	}
	const id = staticStringExpression(project.checker, node.argumentExpression);
	if (id == null || node.questionDotToken != null) {
		const location = locationForNode(fact.moduleInfo, node);
		fact.unsupportedReasons.push({
			column: location.column,
			kind: "dynamic-capability-access",
			line: location.line,
		});
		return;
	}
	fact.direct.add(id);
}

function scanCall(
	project: Project,
	fact: NativeFact,
	factsByDeclaration: ReadonlyMap<string, NativeFact>,
	node: CallExpression,
): void {
	const extendInfo = readCapabilitiesExtend(project.checker, fact, node);
	if (extendInfo != null) {
		fact.provideChecks.push({
			column: locationForNode(fact.moduleInfo, node).column,
			extra: extendInfo.extra,
			line: locationForNode(fact.moduleInfo, node).line,
		});
	}
	if (isCapabilitiesHelperCall(fact.moduleInfo, node)) {
		return;
	}
	for (const [index, argument] of node.arguments.entries()) {
		const forwarded = forwardedArgument(project.checker, fact, argument);
		if (forwarded == null) {
			continue;
		}
		const signature = resolveCallSignature(project.checker, node);
		if (signature == null) {
			continue;
		}
		const parameterType = project.checker.getParameterType(signature, index);
		const argumentType = project.checker.getTypeAtLocation(unwrapExpression(argument));
		const capabilitiesType =
			parameterType != null && isCapabilitiesType(project.checker, parameterType)
				? parameterType
				: argumentType != null && isCapabilitiesType(project.checker, argumentType)
					? argumentType
					: null;
		if (capabilitiesType == null) {
			continue;
		}
		const targetFact = resolveCallTarget(project, factsByDeclaration, signature, node.expression);
		const required = capabilityIds(project.checker, capabilitiesType);
		fact.calls.push({
			calleeName: targetFact?.name ?? expressionLabel(fact.moduleInfo.sourceFile, node.expression),
			provided: forwarded.provided,
			required,
			targetId: targetFact?.id ?? null,
		});
	}
}

function resolveCallTarget(
	project: Project,
	factsByDeclaration: ReadonlyMap<string, NativeFact>,
	signature: Signature,
	expression: Expression,
): NativeFact | null {
	const signatureTarget = signature.declaration?.resolve(project);
	const signatureFact =
		signatureTarget == null ? null : factsByDeclaration.get(nodeKey(signatureTarget));
	if (signatureFact != null) {
		return signatureFact;
	}
	const symbols: (TsgoSymbol | undefined)[] = [project.checker.getSymbolAtLocation(expression)];
	if (expression.kind === SyntaxKind.Identifier) {
		symbols.push(project.checker.getResolvedSymbol(expression as Identifier));
	}
	if (expression.kind === SyntaxKind.PropertyAccessExpression) {
		const access = expression as PropertyAccessExpression;
		symbols.push(project.checker.getSymbolAtLocation(access.name));
	}
	for (const symbol of symbols) {
		for (const declaration of symbol?.declarations ?? []) {
			const target = declaration.resolve(project);
			const fact = target == null ? null : factsByDeclaration.get(nodeKey(target));
			if (fact != null) {
				return fact;
			}
		}
	}
	return null;
}

function isCapabilitiesHelperCall(moduleInfo: NativeSourceModule, node: CallExpression): boolean {
	const expression = node.expression;
	return (
		expression.kind === SyntaxKind.PropertyAccessExpression &&
		isImportedCapabilitiesValue(moduleInfo, (expression as PropertyAccessExpression).expression)
	);
}

function resolveCallSignature(checker: Checker, node: CallExpression): Signature | undefined {
	try {
		const resolved = checker.getResolvedSignature(node);
		if (resolved != null) {
			return resolved;
		}
	} catch {
		// Native-preview can currently throw for some valid call expressions. Fall back to the
		// callee type's call signatures, which is enough for capability forwarding.
	}
	const calleeType = checker.getTypeAtLocation(node.expression);
	if (calleeType == null) {
		return undefined;
	}
	return checker.getSignaturesOfType(calleeType, SignatureKind.Call)[0];
}

function readCapabilitiesExtend(
	checker: Checker,
	fact: NativeFact,
	node: CallExpression,
): { readonly extra: ReadonlySet<string> } | null {
	const expression = node.expression;
	if (expression.kind !== SyntaxKind.PropertyAccessExpression) {
		return null;
	}
	const callee = expression as PropertyAccessExpression;
	if (
		staticName(callee.name) !== "extend" ||
		!isImportedCapabilitiesValue(fact.moduleInfo, callee.expression)
	) {
		return null;
	}
	const firstArgument = node.arguments[0];
	if (
		firstArgument == null ||
		!sameSymbol(expressionSymbol(checker, firstArgument), fact.paramSymbol)
	) {
		return null;
	}
	const secondArgument = node.arguments[1];
	if (secondArgument == null || secondArgument.kind !== SyntaxKind.CallExpression) {
		return { extra: new Set() };
	}
	const type = checker.getTypeAtLocation(secondArgument);
	return { extra: type == null ? new Set() : capabilityIds(checker, type) };
}

function forwardedArgument(
	checker: Checker,
	fact: NativeFact,
	argument: Expression,
): { readonly provided: ReadonlySet<string> } | null {
	const expression = unwrapExpression(argument);
	if (sameSymbol(expressionSymbol(checker, expression), fact.paramSymbol)) {
		return { provided: new Set() };
	}
	if (expression.kind !== SyntaxKind.CallExpression) {
		return null;
	}
	const call = expression as CallExpression;
	const callee = call.expression;
	if (callee.kind !== SyntaxKind.PropertyAccessExpression) {
		return null;
	}
	const propertyAccess = callee as PropertyAccessExpression;
	if (staticName(propertyAccess.name) !== "extend") {
		return null;
	}
	const firstArgument = call.arguments[0];
	if (
		firstArgument == null ||
		!sameSymbol(expressionSymbol(checker, firstArgument), fact.paramSymbol)
	) {
		return null;
	}
	const type = checker.getTypeAtLocation(call.arguments[1] ?? call);
	return { provided: type == null ? new Set() : capabilityIds(checker, type) };
}

function computeRequired(facts: readonly NativeFact[]): ReadonlyMap<string, ReadonlySet<string>> {
	const factsById = new Map(facts.map((fact) => [fact.id, fact]));
	const required = new Map<string, Set<string>>();
	for (const fact of facts) {
		required.set(fact.id, new Set(fact.direct));
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const fact of facts) {
			const factRequired = required.get(fact.id);
			if (factRequired == null) {
				continue;
			}
			for (const call of fact.calls) {
				const target = call.targetId == null ? null : factsById.get(call.targetId);
				const calledRequired =
					target == null || target.declaredOpaque
						? call.required
						: (required.get(target.id) ?? call.required);
				for (const id of calledRequired) {
					if (call.provided.has(id) || factRequired.has(id)) {
						continue;
					}
					factRequired.add(id);
					changed = true;
				}
			}
		}
	}
	return required;
}

function collectUnusedFindings(
	facts: readonly NativeFact[],
	required: ReadonlyMap<string, ReadonlySet<string>>,
): readonly DiyUnusedCapabilityFinding[] {
	const findings: DiyUnusedCapabilityFinding[] = [];
	for (const fact of facts) {
		if (!fact.reportable || fact.paramName === "_capabilities" || hasBlockingUnsupported(fact)) {
			continue;
		}
		const factRequired = required.get(fact.id) ?? new Set<string>();
		const unused = Array.from(fact.declared)
			.filter((id) => !factRequired.has(id))
			.sort();
		if (unused.length === 0) {
			continue;
		}
		findings.push({
			column: fact.column,
			declared: sorted(fact.declared),
			direct: sorted(fact.direct),
			filePath: fact.filePath,
			functionName: fact.name,
			line: fact.line,
			transitive: sorted(factRequired),
			unused,
		});
	}
	return findings;
}

function collectUnsupported(facts: readonly NativeFact[]): readonly DiyAnalyzerUnsupported[] {
	const unsupported: DiyAnalyzerUnsupported[] = [];
	for (const fact of facts) {
		if (!fact.reportable) {
			continue;
		}
		for (const reason of fact.unsupportedReasons) {
			unsupported.push(makeUnsupported(fact, reason));
		}
	}
	return unsupported;
}

function collectProvideViolations(facts: readonly NativeFact[]): readonly DiyAnalyzerViolation[] {
	const violations: DiyAnalyzerViolation[] = [];
	for (const fact of facts) {
		if (!fact.reportable) {
			continue;
		}
		for (const check of fact.provideChecks) {
			const overlapping = Array.from(check.extra)
				.filter((id) => fact.declared.has(id))
				.sort();
			if (overlapping.length === 0) {
				continue;
			}
			const verb = overlapping.length === 1 ? "is" : "are";
			violations.push({
				capabilityIds: overlapping,
				column: check.column,
				filePath: fact.filePath,
				functionName: fact.name,
				line: check.line,
				name: "redundant capability provider",
				notes: [
					{
						kind: "note",
						message:
							`${overlapping.map((id) => `\`${id}\``).join(", ")} ${verb} already allowed by this function's ` +
							"`capabilities` parameter",
					},
					{
						kind: "help",
						message:
							"use `Capabilities.override(...)` when replacing an existing capability is intentional",
					},
				],
				reason: "Capabilities.extend adds capabilities already present on capabilities",
			});
		}
	}
	return violations;
}

function graphFunction(
	fact: NativeFact,
	facts: readonly NativeFact[],
	required: ReadonlyMap<string, ReadonlySet<string>>,
): DiyModuleGraphFunction {
	const factsById = new Map(facts.map((item) => [item.id, item]));
	const factRequired = required.get(fact.id) ?? new Set<string>();
	return {
		calls: fact.calls
			.map((call) => {
				const target = call.targetId == null ? null : factsById.get(call.targetId);
				if (target == null) {
					return {
						calleeName: call.calleeName,
						calls: [],
						transitive: sorted(call.required),
					};
				}
				return graphCall(target, required.get(target.id) ?? call.required);
			})
			.sort((left, right) => left.calleeName.localeCompare(right.calleeName)),
		column: fact.column,
		declared: sorted(fact.declared),
		direct: sorted(fact.direct),
		filePath: fact.filePath,
		line: fact.line,
		name: fact.name,
		transitive: sorted(factRequired),
		unused: sortedDifference(fact.declared, factRequired),
	};
}

function graphCall(fact: NativeFact, required: ReadonlySet<string>): DiyModuleGraphCall {
	return {
		calleeName: fact.name,
		calls: [],
		column: fact.column,
		filePath: fact.filePath,
		functionName: fact.name,
		line: fact.line,
		transitive: sorted(required),
	};
}

function makeUnsupported(
	fact: NativeFact,
	reason: NativeUnsupportedReason,
): DiyAnalyzerUnsupported {
	switch (reason.kind) {
		case "dynamic-capability-access":
			return {
				column: reason.column ?? fact.column,
				filePath: fact.filePath,
				functionName: fact.name,
				line: reason.line ?? fact.line,
				notes: [dynamicCapabilityAccessHelp()],
				reason: "dynamic capability access",
			};
		case "generic-direct-read":
			return {
				column: fact.column,
				filePath: fact.filePath,
				functionName: fact.name,
				line: fact.line,
				notes: [
					{
						kind: "help",
						message:
							"use a concrete `Capabilities<...>` type for functions that read services directly",
					},
				],
				reason: "generic capabilities parameter reads services directly",
			};
		case "unresolved-declaration":
			return {
				column: fact.column,
				filePath: fact.filePath,
				functionName: fact.name,
				line: fact.line,
				reason: "capabilities declaration could not be resolved",
			};
		case "unresolved-forwarding":
			return {
				column: fact.column,
				filePath: fact.filePath,
				functionName: fact.name,
				line: fact.line,
				notes: [
					{
						kind: "help",
						message:
							"replace the dynamic callee with a named effectful function call, for example `run(capabilities)`",
					},
				],
				reason: "unresolved capabilities forwarding callee",
			};
	}
}

function dynamicCapabilityAccessHelp(): DiyAnalyzerNote {
	return {
		kind: "help",
		message:
			"use direct property access like `capabilities.reader`, or bracket access with a const string key",
	};
}

function capabilityIds(checker: Checker, type: Type): ReadonlySet<string> {
	return new Set(
		checker
			.getPropertiesOfType(type)
			.map((property) => property.name)
			.filter(isPublicId),
	);
}

function isCapabilitiesType(checker: Checker, type: Type): boolean {
	const text = checker.typeToString(type);
	return text === "Capabilities<never>" || text.startsWith("Capabilities<");
}

function isPublicId(name: string): boolean {
	return !name.includes("@") && name !== "__type";
}

function isNeverCapabilitiesType(typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return false;
	}
	const typeArguments = (typeNode as unknown as Record<string, readonly TypeNode[] | undefined>)
		.typeArguments;
	return typeArguments?.[0]?.kind === SyntaxKind.NeverKeyword;
}

function isOpaqueCapabilitiesType(checker: Checker, typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return false;
	}
	const typeArguments = (typeNode as unknown as Record<string, readonly TypeNode[] | undefined>)
		.typeArguments;
	const firstTypeArgument = typeArguments?.[0];
	if (firstTypeArgument == null) {
		return false;
	}
	const type = checker.getTypeFromTypeNode(firstTypeArgument);
	return type != null && (type.flags & TypeFlags.TypeParameter) !== 0;
}

function hasOwnCapabilitiesBinding(
	project: Project,
	moduleInfo: NativeSourceModule,
	node: FunctionLikeDeclaration,
): boolean {
	const firstParam = node.parameters[0];
	if (firstParam?.type != null && isDiyCapabilitiesType(moduleInfo, firstParam.type)) {
		return true;
	}
	return node.parameters.some((param) => {
		const name = staticName(param.name);
		return name === "capabilities" || name === "_capabilities";
	});
}

function isDiyCapabilitiesType(moduleInfo: NativeSourceModule, typeNode: TypeNode): boolean {
	if (typeNode.kind !== SyntaxKind.TypeReference) {
		return false;
	}
	const typeName = (typeNode as unknown as Record<string, Node | undefined>).typeName;
	if (typeName == null) {
		return false;
	}
	const parts = entityNameParts(typeName);
	if (parts.length === 1) {
		const local = parts[0];
		const imported = local == null ? null : moduleInfo.imports.get(local);
		return imported?.importedName === "Capabilities" && diyImportSources.has(imported.source);
	}
	if (parts.length === 2 && parts[1] === "Capabilities") {
		const root = parts[0];
		const imported = root == null ? null : moduleInfo.imports.get(root);
		return imported?.kind === "namespace" && diyImportSources.has(imported.source);
	}
	return false;
}

function isImportedCapabilitiesValue(moduleInfo: NativeSourceModule, node: Expression): boolean {
	const name = staticName(node);
	const imported = name == null ? null : moduleInfo.imports.get(name);
	return imported?.importedName === "Capabilities" && diyImportSources.has(imported.source);
}

function entityNameParts(node: Node): readonly string[] {
	if (node.kind === SyntaxKind.Identifier) {
		return [(node as Identifier).text];
	}
	if (node.kind !== SyntaxKind.QualifiedName) {
		return [];
	}
	const record = node as unknown as Record<string, Node | undefined>;
	if (record.left == null || record.right == null) {
		return [];
	}
	return [...entityNameParts(record.left), ...entityNameParts(record.right)];
}

function expressionSymbol(checker: Checker, expression: Expression): TsgoSymbol | undefined {
	return checker.getSymbolAtLocation(unwrapExpression(expression));
}

function sameSymbol(left: TsgoSymbol | undefined, right: TsgoSymbol): boolean {
	return left?.id === right.id;
}

function unwrapExpression(expression: Expression): Expression {
	const unwrapped = skipOuterExpressions(expression);
	return isExpression(unwrapped) ? unwrapped : expression;
}

function staticStringExpression(checker: Checker, expression: Expression): string | null {
	const literal = literalText(expression);
	if (literal != null) {
		return literal;
	}
	const type = checker.getTypeAtLocation(expression);
	const value = (type as (Type & { readonly value?: unknown }) | undefined)?.value;
	if (type != null && (type.flags & TypeFlags.StringLiteral) !== 0 && typeof value === "string") {
		return value;
	}
	return null;
}

function expressionLabel(sourceFile: SourceFile, expression: Expression): string {
	return sourceFile.text.slice(expression.pos, expression.end).trim().replace(/\s+/g, " ");
}

function functionName(
	moduleInfo: NativeSourceModule,
	node: FunctionLikeDeclaration,
	ownerName: string | null,
): string {
	const named = staticName((node as unknown as Record<string, unknown>).name);
	if (
		ownerName != null &&
		(node.kind === SyntaxKind.MethodDeclaration ||
			node.kind === SyntaxKind.ArrowFunction ||
			node.kind === SyntaxKind.FunctionExpression)
	) {
		return ownerName;
	}
	if (named != null) {
		return named;
	}
	if (ownerName != null) {
		return ownerName;
	}
	const location = locationForNode(moduleInfo, node);
	return `<anonymous>@${location.line}:${location.column}`;
}

function childOwnerName(node: Node, ownerName: string | null): string | null {
	if (node.kind === SyntaxKind.VariableDeclaration) {
		return staticName((node as unknown as Record<string, unknown>).name) ?? ownerName;
	}
	if (node.kind === SyntaxKind.ClassDeclaration || node.kind === SyntaxKind.ClassExpression) {
		return staticName((node as unknown as Record<string, unknown>).name) ?? ownerName;
	}
	if (node.kind === SyntaxKind.PropertyAssignment || node.kind === SyntaxKind.MethodDeclaration) {
		const name = staticName((node as unknown as Record<string, unknown>).name);
		return name == null ? ownerName : ownerName == null ? name : `${ownerName}.${name}`;
	}
	return ownerName;
}

function functionLocation(
	moduleInfo: NativeSourceModule,
	node: FunctionLikeDeclaration,
): { readonly column: number; readonly line: number } {
	const text = moduleInfo.sourceFile.text.slice(node.pos, node.end);
	const keywordIndex = text.search(/\b(function|async)\b|[A-Za-z_$][\w$]*\s*:/);
	const offset = keywordIndex < 0 ? node.pos : node.pos + keywordIndex;
	return locationForOffset(moduleInfo.lineStarts, offset);
}

function locationForNode(
	moduleInfo: NativeSourceModule,
	node: Node,
): { readonly column: number; readonly line: number } {
	const text = moduleInfo.sourceFile.text;
	let offset = node.pos;
	while (offset < node.end && /\s/.test(text[offset] ?? "")) {
		offset += 1;
	}
	return locationForOffset(moduleInfo.lineStarts, offset);
}

function locationForOffset(
	starts: readonly number[],
	offset: number,
): { readonly column: number; readonly line: number } {
	let low = 0;
	let high = starts.length - 1;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const start = starts[middle] ?? 0;
		if (start <= offset) {
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	const lineIndex = Math.max(0, high);
	return {
		column: offset - (starts[lineIndex] ?? 0) + 1,
		line: lineIndex + 1,
	};
}

function lineStarts(source: string): readonly number[] {
	const starts = [0];
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (char === "\n") {
			starts.push(index + 1);
		}
	}
	return starts;
}

function collectNativeSuppressions(
	modules: readonly NativeSourceModule[],
): NativeDiyAnalysisProgram["suppressions"] {
	const suppressions: DiagnosticSuppression[] = [];
	const violations: DiyAnalyzerViolation[] = [];
	const directivePattern = /^(\s*)\/\/\s*diy-ignore-next-line\b(.*)$/;
	for (const moduleInfo of modules) {
		const lines = moduleInfo.sourceFile.text.split(/\r?\n/);
		for (const [index, lineText] of lines.entries()) {
			const match = directivePattern.exec(lineText);
			if (match == null) {
				continue;
			}
			const line = index + 1;
			const column = (match[1]?.length ?? 0) + 1;
			const suffix = match[2]?.trimStart() ?? "";
			if (!suffix.startsWith("--") || suffix.slice(2).trim().length === 0) {
				violations.push({
					column,
					filePath: moduleInfo.filePath,
					line,
					name: "invalid diagnostic suppression",
					reason: "`diy-ignore-next-line` requires a non-empty reason after `--`.",
				});
				continue;
			}
			suppressions.push({
				column,
				filePath: moduleInfo.filePath,
				line,
				targetLine: line + 1,
			});
		}
	}
	return { suppressions, violations };
}

function literalText(node: Node): string | null {
	if (
		node.kind === SyntaxKind.StringLiteral ||
		node.kind === SyntaxKind.NoSubstitutionTemplateLiteral
	) {
		return (node as unknown as Record<string, string | undefined>).text ?? null;
	}
	return null;
}

function staticName(node: unknown): string | null {
	if (node == null || typeof node !== "object") {
		return null;
	}
	const value = node as Record<string, unknown>;
	if (typeof value.text === "string") {
		return value.text;
	}
	if (typeof value.escapedText === "string") {
		return value.escapedText;
	}
	if (typeof value.name === "object") {
		return staticName(value.name);
	}
	return null;
}

function isFunctionLike(node: Node): node is FunctionLikeDeclaration {
	return (
		node.kind === SyntaxKind.FunctionDeclaration ||
		node.kind === SyntaxKind.FunctionExpression ||
		node.kind === SyntaxKind.ArrowFunction ||
		node.kind === SyntaxKind.MethodDeclaration
	);
}

function nodeKey(node: Node): string {
	return `${node.getSourceFile().fileName}:${node.pos}:${node.end}:${node.kind}`;
}

function sorted(values: Iterable<string>): readonly string[] {
	return Array.from(values).sort();
}

function sortedDifference(
	values: ReadonlySet<string>,
	excluded: ReadonlySet<string>,
): readonly string[] {
	return Array.from(values)
		.filter((value) => !excluded.has(value))
		.sort();
}

function hasBlockingUnsupported(fact: NativeFact): boolean {
	return fact.unsupportedReasons.length > 0;
}

function compareFacts(left: NativeFact, right: NativeFact): number {
	return (
		left.filePath.localeCompare(right.filePath) ||
		left.line - right.line ||
		left.column - right.column ||
		left.name.localeCompare(right.name)
	);
}
/* c8 ignore stop */
