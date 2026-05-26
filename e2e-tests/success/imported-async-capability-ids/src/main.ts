import type { Capabilities } from "@beff/diy";
import type { AccessCapability, CatalogCapability } from "@example/services";

type SourceConfig = {
	readonly ids: readonly string[];
};

const resolveFilteredNames = async (
	capabilities: Capabilities<AccessCapability | CatalogCapability>,
	sourceConfig: SourceConfig,
) => {
	const allowed = await capabilities.access.allowed();
	const names = await capabilities.catalog.names(sourceConfig.ids);
	return names.filter((name) => allowed.includes(name));
};

const NameService = { resolveFilteredNames };

export const loadNames = async (
	capabilities: Capabilities<AccessCapability | CatalogCapability>,
	sourceConfig: SourceConfig,
): Promise<readonly string[]> => NameService.resolveFilteredNames(capabilities, sourceConfig);
