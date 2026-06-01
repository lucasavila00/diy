import type { Capability } from "@beff/diy";

export type AccessCapability = Capability<"access", { allowed(): Promise<readonly string[]> }>;
export type CatalogCapability = Capability<
	"catalog",
	{ names(ids: readonly string[]): Promise<readonly string[]> }
>;
