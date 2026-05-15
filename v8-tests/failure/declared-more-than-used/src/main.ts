import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"reader", unknown>;
type WriteCapability = Capability<"writer", unknown>;
type HyphenCapability = Capability<"reader-id", unknown>;
type NumericCapability = Capability<"1", unknown>;

export function load(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.reader;
}

export function save(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.writer;
}

export function hyphenated(capabilities: Capabilities<ReadCapability | HyphenCapability>): void {
	capabilities.reader;
}

export function numeric(capabilities: Capabilities<NumericCapability>): void {
	const { 1: one } = capabilities;
	void one;
}
