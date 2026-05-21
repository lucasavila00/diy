import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"reader", unknown>;
type WriteCapability = Capability<"writer", unknown>;
type ReadWriteCapabilities = Capabilities<ReadCapability | WriteCapability>;

export function load(capabilities: ReadWriteCapabilities): void {
	capabilities.reader;
}
