import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"core.read", { read(): string }>;

export function load(capabilities: Capabilities<ReadCapability>): string {
	return capabilities["core.read"].read();
}
