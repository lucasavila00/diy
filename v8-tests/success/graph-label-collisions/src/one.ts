import type { Capabilities, Capability } from "@beff/diy";

export type ReadCapability = Capability<"read", unknown>;

export function run(capabilities: Capabilities<ReadCapability>): void {
	capabilities.need("read");
}
