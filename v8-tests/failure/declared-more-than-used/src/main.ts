import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"reader", unknown>;
type WriteCapability = Capability<"writer", unknown>;

export function load(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.reader;
}

export function save(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.writer;
}
