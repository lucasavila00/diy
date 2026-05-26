import type { Capabilities } from "@beff/diy";
import type { AccessCapability, CatalogCapability } from "@example/services";
import { readAllowedNames } from "@example/services/handlers";

type SourceConfig = {
	readonly ids: readonly string[];
};

const resolveFilteredNames = async (
	capabilities: Capabilities<AccessCapability | CatalogCapability>,
	sourceConfig: SourceConfig,
): Promise<readonly string[]> => readAllowedNames(capabilities, sourceConfig.ids);

const NameService = { resolveFilteredNames };

export const loadNames = async (
	capabilities: Capabilities<AccessCapability | CatalogCapability>,
	sourceConfig: SourceConfig,
): Promise<readonly string[]> => NameService.resolveFilteredNames(capabilities, sourceConfig);
