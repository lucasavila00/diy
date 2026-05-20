import type { Capability } from "@beff/diy";

export type EdgeCapability = Capability<"edge", { run(): void }>;
export type ExtraCapability = Capability<"extra", { run(): void }>;
export type HiddenCapability = Capability<"hidden", unknown>;
