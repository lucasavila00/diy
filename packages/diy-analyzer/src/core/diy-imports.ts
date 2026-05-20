import { getNode, getTypeName, isCapabilitiesType } from "./ast.ts";
import type { ModuleInfo } from "./types.ts";

export const publicDiyImportSources = new Set(["@beff/diy", "@beff/diy/capabilities"]);

export function isDiyCapabilitiesType(moduleInfo: ModuleInfo, typeNode: unknown): boolean {
	const node = getNode(typeNode);
	if (node == null || !isCapabilitiesType(node) || getTypeName(node) !== "Capabilities") {
		return false;
	}
	const imported = moduleInfo.imports.get("Capabilities");
	return imported?.importedName === "Capabilities" && publicDiyImportSources.has(imported.source);
}
