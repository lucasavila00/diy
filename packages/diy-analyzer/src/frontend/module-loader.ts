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
	getFunctionName,
	getIdentifierFromParam,
	getIdentifierName,
	getLiteralString,
	getNode,
	getParamType,
	isFunctionNode,
	locationForOffset,
	makeLineStarts,
	unwrapDeclaration,
} from "./ast.ts";
import { getDiyCapabilitiesAllowedType } from "./diy-imports.ts";
import { getContextualFunctionType, getFunctionTypeFirstParamType } from "./function-types.ts";
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
			functionContextualTypes: new Map(),
			functionClosureCallbacks: new WeakMap(),
			functionNamespaces: new Map(),
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
		collectAliases(body, moduleInfo.aliases, moduleInfo.aliasTypeParameters);
		collectStringConstantBindings(body, moduleInfo.constants, moduleInfo.constantExports);
		collectFunctionNodes(body, null, moduleInfo);
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
): void {
	for (const statement of body) {
		const node = getNode(statement);
		/* c8 ignore next -- parser program bodies contain AST nodes. */
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
			aliasTypeParameters.set(name, collectAliasTypeParameters(declaration));
		}
	}
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

function collectFunctionNodes(
	value: unknown,
	parent: AstNode | null,
	moduleInfo: ModuleInfo,
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
		moduleInfo.functionNodes.set(qualifiedName, declaration);
		moduleInfo.functionClosureCallbacks.set(declaration, closureTypedCallbacks);
		if (namespaceName == null) {
			moduleInfo.functionNamespaces.delete(qualifiedName);
		} else {
			moduleInfo.functionNamespaces.set(qualifiedName, namespaceName);
		}
		const contextualType = getContextualFunctionType(parent);
		if (contextualType == null) {
			moduleInfo.functionContextualTypes.delete(qualifiedName);
		} else {
			moduleInfo.functionContextualTypes.set(qualifiedName, contextualType);
		}
	}
	const childClosureTypedCallbacks = isFunctionNode(declaration)
		? mergeSets(closureTypedCallbacks, getTypedCallbackParamNames(moduleInfo, declaration))
		: closureTypedCallbacks;
	for (const [key, child] of Object.entries(declaration)) {
		if (key === "type" || key === "start" || key === "end") {
			continue;
		}
		collectFunctionNodes(
			child,
			declaration,
			moduleInfo,
			childNamespaceName,
			childOwnerName,
			childClosureTypedCallbacks,
		);
	}
}

function getTypedCallbackParamNames(moduleInfo: ModuleInfo, node: AstNode): ReadonlySet<string> {
	const names = new Set<string>();
	for (const param of getArray(node["params"])) {
		const name = getIdentifierName(getIdentifierFromParam(param));
		if (name == null) {
			continue;
		}
		const firstParamType = getFunctionTypeFirstParamType(moduleInfo, getParamType(getNode(param)));
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
