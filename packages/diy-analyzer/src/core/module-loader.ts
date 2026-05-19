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
import {
	getArray,
	getIdentifierName,
	getLiteralString,
	getNode,
	locationForOffset,
	makeLineStarts,
	unwrapDeclaration,
} from "./ast.ts";
import { collectStringConstantBindings } from "./string-constants.ts";
import type { AstNode, ImportedBinding, ModuleInfo, TypeAliasParameter } from "./types.ts";

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
		/* c8 ignore next -- fixture loading reaches each configured file once. */
		if (existing != null) {
			return existing;
		}
		/* c8 ignore next -- file paths come from globbed source files. */
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
			aliasTypeParameters: new Map(),
			body,
			constantExports: new Map(),
			constants: new Map(),
			filePath: resolvedPath,
			imports: new Map(),
			lineStarts,
			namespaceAliases: new Map(),
			namespaceAliasTypeParameters: new Map(),
			parseErrors,
			reportable: this.sourceFiles.has(resolvedPath),
			source,
		};
		this.modules.set(resolvedPath, moduleInfo);
		collectImports(body, moduleInfo.imports);
		collectAliases(
			body,
			moduleInfo.aliases,
			moduleInfo.aliasTypeParameters,
			moduleInfo.namespaceAliases,
			moduleInfo.namespaceAliasTypeParameters,
		);
		collectStringConstantBindings(body, moduleInfo.constants, moduleInfo.constantExports);
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
		/* c8 ignore next -- parser import declarations always carry literal sources. */
		if (source == null) {
			continue;
		}
		for (const specifierValue of getArray(node["specifiers"])) {
			const specifier = getNode(specifierValue);
			/* c8 ignore next -- parser import specifier arrays contain specifier nodes. */
			if (specifier == null) {
				continue;
			}
			const localName = getIdentifierName(specifier["local"]);
			/* c8 ignore next -- parser import specifiers always carry local identifiers. */
			if (localName == null) {
				continue;
			}
			if (specifier.type === "ImportDefaultSpecifier") {
				imports.set(localName, { importedName: "default", kind: "named", source });
				continue;
			}
			if (specifier.type === "ImportNamespaceSpecifier") {
				imports.set(localName, { importedName: "*", kind: "namespace", source });
				continue;
			}
			/* c8 ignore next -- parser import specifier variants are handled above. */
			if (specifier.type !== "ImportSpecifier") {
				continue;
			}
			imports.set(localName, {
				/* c8 ignore next -- normal named imports use identifier imported names. */
				importedName: getIdentifierName(specifier["imported"]) ?? localName,
				kind: "named",
				source,
			});
		}
	}
}

function collectAliases(
	body: readonly unknown[],
	aliases: Map<string, unknown>,
	aliasTypeParameters: Map<string, readonly TypeAliasParameter[]>,
	namespaceAliases: Map<string, Map<string, unknown>>,
	namespaceAliasTypeParameters: Map<string, Map<string, readonly TypeAliasParameter[]>>,
): void {
	collectAliasStatements(
		body,
		aliases,
		aliasTypeParameters,
		namespaceAliases,
		namespaceAliasTypeParameters,
		null,
	);
}

function collectAliasStatements(
	body: readonly unknown[],
	aliases: Map<string, unknown>,
	aliasTypeParameters: Map<string, readonly TypeAliasParameter[]>,
	namespaceAliases: Map<string, Map<string, unknown>>,
	namespaceAliasTypeParameters: Map<string, Map<string, readonly TypeAliasParameter[]>>,
	namespaceName: string | null,
): void {
	for (const statement of body) {
		const node = getNode(statement);
		/* c8 ignore next -- parser program bodies contain AST nodes. */
		if (node == null) {
			continue;
		}
		const declaration = unwrapDeclaration(node);
		if (declaration.type === "TSTypeAliasDeclaration") {
			collectAliasDeclaration(
				declaration,
				aliases,
				aliasTypeParameters,
				namespaceAliases,
				namespaceAliasTypeParameters,
				namespaceName,
			);
			continue;
		}
		if (declaration.type === "TSModuleDeclaration") {
			const localNamespaceName = getIdentifierName(declaration["id"]);
			const namespaceBody = getNode(declaration["body"]);
			if (localNamespaceName == null || namespaceBody?.type !== "TSModuleBlock") {
				continue;
			}
			const childNamespaceName =
				namespaceName == null ? localNamespaceName : `${namespaceName}.${localNamespaceName}`;
			collectAliasStatements(
				getArray(namespaceBody["body"]),
				aliases,
				aliasTypeParameters,
				namespaceAliases,
				namespaceAliasTypeParameters,
				childNamespaceName,
			);
		}
	}
}

function collectAliasDeclaration(
	declaration: AstNode,
	aliases: Map<string, unknown>,
	aliasTypeParameters: Map<string, readonly TypeAliasParameter[]>,
	namespaceAliases: Map<string, Map<string, unknown>>,
	namespaceAliasTypeParameters: Map<string, Map<string, readonly TypeAliasParameter[]>>,
	namespaceName: string | null,
): void {
	const name = getIdentifierName(declaration["id"]);
	/* c8 ignore next -- parser type aliases have identifier names. */
	if (name == null) {
		return;
	}
	if (namespaceName == null) {
		aliases.set(name, declaration["typeAnnotation"]);
		aliasTypeParameters.set(name, collectAliasTypeParameters(declaration));
		return;
	}
	const namespaceAliasMap = getOrInsertMap(namespaceAliases, namespaceName);
	const namespaceAliasTypeParametersMap = getOrInsertMap(
		namespaceAliasTypeParameters,
		namespaceName,
	);
	namespaceAliasMap.set(name, declaration["typeAnnotation"]);
	namespaceAliasTypeParametersMap.set(name, collectAliasTypeParameters(declaration));
}

function getOrInsertMap<T>(map: Map<string, Map<string, T>>, key: string): Map<string, T> {
	const existing = map.get(key);
	if (existing != null) {
		return existing;
	}
	const next = new Map<string, T>();
	map.set(key, next);
	return next;
}

function collectAliasTypeParameters(declaration: AstNode): readonly TypeAliasParameter[] {
	const typeParameters = getNode(declaration["typeParameters"]);
	return getArray(typeParameters?.["params"]).flatMap((paramValue) => {
		const param = getNode(paramValue);
		const name = getIdentifierName(param?.["name"]);
		/* c8 ignore next -- parser type parameters have identifier names. */
		if (name == null) {
			return [];
		}
		return [
			{
				constraint: param?.["constraint"] ?? null,
				name,
			},
		];
	});
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
				/* c8 ignore next -- dependency loading is limited to configured source files. */
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
