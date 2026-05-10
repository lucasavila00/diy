import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { parseSync } from "oxc-parser";

import { resolveCapabilityIds } from "../middle-end/capabilities.ts";
import {
	getArray,
	getFirstParam,
	getFunctionName,
	getIdentifierFromParam,
	getIdentifierName,
	getLiteralString,
	getNode,
	getParamType,
	getCapabilitiesAllowedType,
	isFunctionNode,
	lineForOffset,
	locationForOffset,
	makeLineStarts,
	unwrapDeclaration,
} from "./ast.ts";
import { scanFunctionBody } from "./function-scan.ts";
import { isSourceFile } from "./source-files.ts";
import type { AstNode, FunctionInfo, ImportedBinding, ModuleInfo } from "./types.ts";

export class ModuleLoader {
	private readonly modules = new Map<string, ModuleInfo>();

	private readonly cwd: string;

	private readonly reportableFiles: ReadonlySet<string>;

	constructor(cwd: string, reportableFiles: ReadonlySet<string>) {
		this.cwd = cwd;
		this.reportableFiles = reportableFiles;
	}

	async load(filePath: string): Promise<ModuleInfo | null> {
		const resolvedPath = resolve(filePath);
		const existing = this.modules.get(resolvedPath);
		if (existing != null) {
			return existing;
		}
		if (!isSourceFile(resolvedPath) || !existsSync(resolvedPath)) {
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
			filePath: resolvedPath,
			functionNodes: new Map(),
			functions: new Map(),
			imports: new Map(),
			lineStarts,
			parseErrors,
			reportable: this.reportableFiles.has(resolvedPath),
			source,
		};
		this.modules.set(resolvedPath, moduleInfo);
		collectImports(body, moduleInfo.imports);
		collectAliases(body, moduleInfo.aliases);
		collectFunctionNodes(body, null, moduleInfo.functionNodes);
		return moduleInfo;
	}

	resolveImport(fromFilePath: string, source: string): string | null {
		return resolveImportPath(this.cwd, fromFilePath, source);
	}

	allModules(): readonly ModuleInfo[] {
		return Array.from(this.modules.values());
	}

	materializeFunctions(): void {
		for (const moduleInfo of this.modules.values()) {
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
		if (getIdentifierName(getIdentifierFromParam(firstParam)) !== "capabilities") {
			return null;
		}
		const allowedType = getCapabilitiesAllowedType(getParamType(firstParam));
		if (allowedType == null) {
			return null;
		}
		const declared = resolveCapabilityIds(this, moduleInfo, allowedType, []);
		const scan = scanFunctionBody(functionNode);
		const functionLocation = locationForOffset(moduleInfo.lineStarts, functionNode.start);
		return {
			calleeNames: scan.calleeNames,
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
			unsupportedReasons: [...declared.reasons, ...scan.unsupportedReasons],
		};
	}
}

function getFirstErrorLabel(error: {
	readonly labels?: readonly { readonly start?: number }[];
}): { readonly start?: number } | null {
	return error.labels?.[0] ?? null;
}

function collectImports(body: readonly unknown[], imports: Map<string, ImportedBinding>): void {
	for (const statement of body) {
		const node = getNode(statement);
		if (node?.type !== "ImportDeclaration") {
			continue;
		}
		const source = getLiteralString(node["source"]);
		if (source == null) {
			continue;
		}
		for (const specifierValue of getArray(node["specifiers"])) {
			const specifier = getNode(specifierValue);
			if (specifier == null) {
				continue;
			}
			const localName = getIdentifierName(specifier["local"]);
			if (localName == null) {
				continue;
			}
			if (specifier.type === "ImportDefaultSpecifier") {
				imports.set(localName, { importedName: "default", source });
				continue;
			}
			if (specifier.type === "ImportSpecifier") {
				imports.set(localName, {
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
		if (node == null) {
			continue;
		}
		const declaration = unwrapDeclaration(node);
		if (declaration.type !== "TSTypeAliasDeclaration") {
			continue;
		}
		const name = getIdentifierName(declaration["id"]);
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

function resolveImportPath(cwd: string, fromFilePath: string, source: string): string | null {
	if (source.startsWith("@q/")) {
		const parts = source.split("/");
		const packageName = parts[1];
		if (packageName == null) {
			return null;
		}
		const rest = parts.slice(2);
		return resolveCandidate(resolve(cwd, "packages", packageName, ...rest));
	}
	if (!source.startsWith(".")) {
		return null;
	}
	return resolveCandidate(resolve(dirname(fromFilePath), source));
}

function resolveCandidate(candidate: string): string | null {
	if (existsSync(candidate) && isSourceFile(candidate)) {
		return candidate;
	}
	for (const extension of [".ts", ".tsx"]) {
		const withExtension = `${candidate}${extension}`;
		if (existsSync(withExtension) && isSourceFile(withExtension)) {
			return withExtension;
		}
	}
	for (const indexFile of ["index.ts", "index.tsx"]) {
		const nested = join(candidate, indexFile);
		if (existsSync(nested) && isSourceFile(nested)) {
			return nested;
		}
	}
	return null;
}

export async function loadResolutionDependencies(loader: ModuleLoader): Promise<void> {
	let changed = true;
	while (changed) {
		changed = false;
		const modules = loader.allModules();
		for (const moduleInfo of modules) {
			for (const imported of moduleInfo.imports.values()) {
				const resolvedPath = loader.resolveImport(moduleInfo.filePath, imported.source);
				if (
					resolvedPath == null ||
					loader.allModules().some((loaded) => loaded.filePath === resolvedPath)
				) {
					continue;
				}
				const loaded = await loader.load(resolvedPath);
				if (loaded != null) {
					changed = true;
				}
			}
		}
	}
}
