import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"core.read", unknown>;
type WriteCapability = Capability<"core.write", unknown>;

export function load(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities["core.read"];
}
