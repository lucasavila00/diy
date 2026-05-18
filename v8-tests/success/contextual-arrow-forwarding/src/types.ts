import type { Capabilities, Capability } from "@beff/diy";

type ImportedCapability = Capability<"imported", unknown>;

export type ImportedReader = (capabilities: Capabilities<ImportedCapability>) => string;
