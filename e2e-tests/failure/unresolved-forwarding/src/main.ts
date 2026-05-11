import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"read", unknown>;

declare const registry: { run(capabilities: Capabilities<ReadCapability>): void };

export function load(capabilities: Capabilities<ReadCapability>): void {
	registry.run(capabilities);
}
