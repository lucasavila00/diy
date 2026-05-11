import {
	getNode,
	getTypeArguments,
	getTypeName,
	isCapabilitiesType,
} from "./ast.ts";
import type { ModuleLoader } from "./module-loader.ts";
import type { ImportedBinding, ModuleInfo } from "./types.ts";

export const publicDiyImportSources = new Set(["@beff/diy", "@beff/diy/capabilities"]);

export function isDiyCapabilitiesType(
	loader: ModuleLoader,
	moduleInfo: ModuleInfo,
	typeNode: unknown,
): boolean {
	const node = getNode(typeNode);
	if (node == null || !isCapabilitiesType(node) || getTypeName(node) !== "Capabilities") {
		return false;
	}
	return isDiyCapabilitiesBinding(loader, moduleInfo, "Capabilities", new Set());
}

export function getDiyCapabilitiesAllowedType(
	loader: ModuleLoader,
	moduleInfo: ModuleInfo,
	typeNode: unknown,
): unknown {
	const node = getNode(typeNode);
	if (node == null || !isDiyCapabilitiesType(loader, moduleInfo, node)) {
		return null;
	}
	return getTypeArguments(node)[0] ?? null;
}

function isDiyCapabilitiesBinding(
	loader: ModuleLoader,
	moduleInfo: ModuleInfo,
	localName: string,
	seen: Set<string>,
): boolean {
	const imported = moduleInfo.imports.get(localName);
	if (imported == null) {
		return false;
	}
	return resolvesDiyCapabilitiesImport(loader, moduleInfo, imported, seen);
}

function resolvesDiyCapabilitiesImport(
	loader: ModuleLoader,
	moduleInfo: ModuleInfo,
	imported: ImportedBinding,
	seen: Set<string>,
): boolean {
	if (imported.importedName !== "Capabilities") {
		return false;
	}
	if (publicDiyImportSources.has(imported.source)) {
		return true;
	}

	const resolvedPath = loader.resolveImport(moduleInfo.filePath, imported.source);
	const importedModule = loader.allModules().find((candidate) => candidate.filePath === resolvedPath);
	if (importedModule == null) {
		return false;
	}

	const key = `${importedModule.filePath}:Capabilities`;
	if (seen.has(key)) {
		return false;
	}
	seen.add(key);

	const reexport = importedModule.reexports.get("Capabilities");
	if (reexport == null) {
		return false;
	}
	return resolvesDiyCapabilitiesImport(loader, importedModule, reexport, seen);
}
