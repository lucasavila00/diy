import type { Capabilities } from "@beff/diy";

import type { AccessCapability, CatalogCapability } from "./capabilities.ts";

export const readAllowedNames = async (
	capabilities: Capabilities<AccessCapability | CatalogCapability>,
	ids: readonly string[],
): Promise<readonly string[]> => {
	const allowed = await capabilities.access.allowed();
	const names = await capabilities.catalog.names(ids);
	return names.filter((name) => allowed.includes(name));
};
