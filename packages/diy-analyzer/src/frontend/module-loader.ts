import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { parseSync } from "oxc-parser";
import type { CompilerOptions } from "typescript";

import {
	findConfigFile,
	parseJsonConfigFileContent,
	readConfigFile,
	resolveModuleName,
	sys as tsSys,
} from "../../tsc-slim/out.js";
import { resolveCapabilityIds } from "../middle-end/capabilities.ts";
import {
	getArray,
	getFirstParam,
	getFunctionName,
	getIdentifierName,
	getLiteralString,
	getNode,
	getParamType,
	isFunctionNode,
	lineForOffset,
	locationForOffset,
	makeLineStarts,
	unwrapDeclaration,
} from "./ast.ts";
import { getDiyCapabilitiesAllowedType } from "./diy-imports.ts";
import { scanFunctionBody } from "./function-scan.ts";
import { collectStringConstantBindings } from "./string-constants.ts";
import type {
	AstNode,
	FunctionInfo,
	ImportedBinding,
	ModuleInfo,
	UnsupportedReason,
} from "./types.ts";

export class ModuleLoader {
	private readonly modules = new Map<string, ModuleInfo>();

	private compilerOptions: CompilerOptions | null = null;

	private readonly resolutionCache = new Map<string, string | null>();

	private readonly sourceFiles: ReadonlySet<string>;

	constructor(sourceFiles: ReadonlySet<string>) {
		this.sourceFiles = sourceFiles;
	}

	async load(filePath: string): Promise<ModuleInfo | null> {
		const resolvedPath = resolve(filePath);
		const existing = this.modules.get(resolvedPath);
		/* istanbul ignore next -- fixture loading reaches each configured file once. */
		if (existing != null) {
			return existing;
		}
		/* istanbul ignore next -- file paths come from globbed source files. */
		if (!this.isSourceFile(resolvedPath) || !existsSync(resolvedPath)) {
			return null;
		}

		const source = await readFile(resolvedPath, "utf8");
		const parsed = parseSync(resolvedPath, source, { astType: "ts" });
		const program = getNode(parsed.program);
		const body = getArray(program?.["body"]);
		const lineStarts = makeLineStarts(source);
		const parseErrors = parsed.errors.map((error) => {
			const label = getFirstErrorLabel(error);
			const location = locationForOffset(lineStarts, label?.start);
			return {
				column: location.column,
				line: location.line,
				message: error.message,
			};
		});
		const moduleInfo: ModuleInfo = {
			aliases: new Map(),
			body,
			constantExports: new Map(),
			constants: new Map(),
			filePath: resolvedPath,
			functionNodes: new Map(),
			functions: new Map(),
			imports: new Map(),
			lineStarts,
			parseErrors,
			reportable: this.sourceFiles.has(resolvedPath),
			source,
		};
		this.modules.set(resolvedPath, moduleInfo);
		collectImports(body, moduleInfo.imports);
		collectAliases(body, moduleInfo.aliases);
		collectStringConstantBindings(body, moduleInfo.constants, moduleInfo.constantExports);
		collectFunctionNodes(body, null, moduleInfo.functionNodes);
		return moduleInfo;
	}

	resolveImport(fromFilePath: string, source: string): string | null {
		const resolvedFromFilePath = resolve(fromFilePath);
		const cacheKey = `${resolvedFromFilePath}\0${source}`;
		if (this.resolutionCache.has(cacheKey)) {
			return this.resolutionCache.get(cacheKey) ?? null;
		}

		const resolved = resolveModuleName(
			source,
			resolvedFromFilePath,
			this.resolveCompilerOptions(),
			tsSys,
		);
		const resolvedFileName = resolved.resolvedModule?.resolvedFileName;
		const resolvedPath =
			resolvedFileName != null && isAnalyzableTypeScriptFile(resolvedFileName)
				? resolve(resolvedFileName)
				: null;
		const result = resolvedPath != null && this.isSourceFile(resolvedPath) ? resolvedPath : null;
		this.resolutionCache.set(cacheKey, result);
		return result;
	}

	allModules(): readonly ModuleInfo[] {
		return Array.from(this.modules.values());
	}

	getModule(filePath: string): ModuleInfo | undefined {
		return this.modules.get(resolve(filePath));
	}

	isSourceFile(filePath: string): boolean {
		return this.sourceFiles.has(resolve(filePath));
	}

	materializeFunctions(): void {
		for (const moduleInfo of this.modules.values()) {
			/* istanbul ignore next -- materialization is called once per program build. */
			if (moduleInfo.functions.size > 0) {
				continue;
			}
			for (const [name, functionNode] of moduleInfo.functionNodes) {
				const functionInfo = this.readFunction(moduleInfo, name, functionNode);
				if (functionInfo != null) {
					moduleInfo.functions.set(name, functionInfo);
				}
			}
		}
	}

	private readFunction(
		moduleInfo: ModuleInfo,
		name: string,
		functionNode: AstNode,
	): FunctionInfo | null {
		const firstParam = getFirstParam(functionNode);
		const allowedType = getDiyCapabilitiesAllowedType(moduleInfo, getParamType(firstParam));
		if (allowedType == null) {
			return null;
		}
		const declared = resolveCapabilityIds(this, moduleInfo, allowedType, []);
		const scan = scanFunctionBody(this, moduleInfo, functionNode);
		const functionLocation = locationForOffset(moduleInfo.lineStarts, functionNode.start);
		return {
			calls: scan.calls,
			column: functionLocation.column,
			declared: declared.ids,
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
			unsupportedReasons: [
				...declared.reasons.map(makeCapabilityResolutionReason),
				...scan.unsupportedReasons,
			],
		};
	}

	private resolveCompilerOptions(): CompilerOptions {
		if (this.compilerOptions != null) {
			return this.compilerOptions;
		}

		const tsconfigPath = findConfigFile(process.cwd(), tsSys.fileExists, "tsconfig.json");
		if (tsconfigPath == null) {
			const compilerOptions = {};
			this.compilerOptions = compilerOptions;
			return compilerOptions;
		}

		const tsconfigFile = readConfigFile(tsconfigPath, tsSys.readFile);
		const parsedTsconfig = parseJsonConfigFileContent(
			/* c8 ignore next -- readConfigFile returns a config object for valid tsconfig files. */
			tsconfigFile.config ?? {},
			tsSys,
			dirname(tsconfigPath),
		);
		const compilerOptions = parsedTsconfig.options;
		this.compilerOptions = compilerOptions;
		return compilerOptions;
	}
}

function makeCapabilityResolutionReason(reason: {
	readonly column?: number;
	readonly filePath?: string;
	readonly line?: number;
	readonly message: string;
	readonly notes?: readonly { readonly kind: "help" | "note"; readonly message: string }[];
}): UnsupportedReason {
	const unsupported: {
		column?: number;
		filePath?: string;
		kind: "capability-resolution";
		line?: number;
		message: string;
		notes?: readonly { readonly kind: "help" | "note"; readonly message: string }[];
	} = {
		kind: "capability-resolution",
		message: reason.message,
	};
	/* c8 ignore next -- capability resolution reasons include a column. */
	if (reason.column != null) {
		unsupported.column = reason.column;
	}
	/* c8 ignore next -- capability resolution reasons include a source file. */
	if (reason.filePath != null) {
		unsupported.filePath = reason.filePath;
	}
	/* c8 ignore next -- capability resolution reasons include a line. */
	if (reason.line != null) {
		unsupported.line = reason.line;
	}
	if (reason.notes != null) {
		unsupported.notes = reason.notes;
	}
	return unsupported;
}

function getFirstErrorLabel(error: {
	readonly labels?: readonly { readonly start?: number }[];
}): { readonly start?: number } | null {
	/* c8 ignore next -- Oxc parse errors include a first label for source syntax errors. */
	return error.labels?.[0] ?? null;
}

function collectImports(body: readonly unknown[], imports: Map<string, ImportedBinding>): void {
	for (const statement of body) {
		const node = getNode(statement);
		if (node?.type !== "ImportDeclaration") {
			continue;
		}
		const source = getLiteralString(node["source"]);
		/* istanbul ignore next -- parser import declarations always carry literal sources. */
		if (source == null) {
			continue;
		}
		for (const specifierValue of getArray(node["specifiers"])) {
			const specifier = getNode(specifierValue);
			/* istanbul ignore next -- parser import specifier arrays contain specifier nodes. */
			if (specifier == null) {
				continue;
			}
			const localName = getIdentifierName(specifier["local"]);
			/* istanbul ignore next -- parser import specifiers always carry local identifiers. */
			if (localName == null) {
				continue;
			}
			if (specifier.type === "ImportDefaultSpecifier") {
				imports.set(localName, { importedName: "default", source });
				continue;
			}
			if (specifier.type === "ImportSpecifier") {
				imports.set(localName, {
					/* c8 ignore next -- normal named imports use identifier imported names. */
					importedName: getIdentifierName(specifier["imported"]) ?? localName,
					source,
				});
			}
		}
	}
}

function collectAliases(body: readonly unknown[], aliases: Map<string, unknown>): void {
	for (const statement of body) {
		const node = getNode(statement);
		/* istanbul ignore next -- parser program bodies contain AST nodes. */
		if (node == null) {
			continue;
		}
		const declaration = unwrapDeclaration(node);
		if (declaration.type !== "TSTypeAliasDeclaration") {
			continue;
		}
		const name = getIdentifierName(declaration["id"]);
		/* c8 ignore next -- parser type aliases have identifier names. */
		if (name != null) {
			aliases.set(name, declaration["typeAnnotation"]);
		}
	}
}

function collectFunctionNodes(
	value: unknown,
	parent: AstNode | null,
	functions: Map<string, AstNode>,
): void {
	if (Array.isArray(value)) {
		for (const item of value) {
			collectFunctionNodes(item, parent, functions);
		}
		return;
	}
	const node = getNode(value);
	if (node == null) {
		return;
	}
	const declaration = unwrapDeclaration(node);
	if (isFunctionNode(declaration)) {
		const name = getFunctionName(declaration, parent);
		if (name != null) {
			functions.set(name, declaration);
		}
	}
	for (const [key, child] of Object.entries(declaration)) {
		if (key === "type" || key === "start" || key === "end") {
			continue;
		}
		collectFunctionNodes(child, declaration, functions);
	}
}

function isAnalyzableTypeScriptFile(filePath: string): boolean {
	return (filePath.endsWith(".ts") && !filePath.endsWith(".d.ts")) || filePath.endsWith(".tsx");
}

export async function loadResolutionDependencies(loader: ModuleLoader): Promise<void> {
	let changed = true;
	while (changed) {
		changed = false;
		const modules = loader.allModules();
		for (const moduleInfo of modules) {
			for (const imported of moduleInfo.imports.values()) {
				const resolvedPath = loader.resolveImport(moduleInfo.filePath, imported.source);
				/* c8 ignore start -- dependency loading is limited to already-configured source files. */
				if (
					resolvedPath == null ||
					loader.allModules().some((loaded) => loaded.filePath === resolvedPath)
				) {
					continue;
				}
				/* istanbul ignore next -- dependency loading is limited to configured source files. */
				const loaded = await loader.load(resolvedPath);
				/* c8 ignore next -- loader.load returns null for paths outside the configured source set. */
				if (loaded != null) {
					changed = true;
				}
				/* c8 ignore stop */
			}
		}
	}
}
