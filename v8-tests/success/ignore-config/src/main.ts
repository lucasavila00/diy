import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;

export function run(capabilities: Capabilities<ReadCapability>): void {
	capabilities.need("read");
}
