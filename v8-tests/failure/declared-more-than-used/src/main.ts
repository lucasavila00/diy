import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"reader", unknown>;
type WriteCapability = Capability<"writer", unknown>;
type ExtraCapability = Capability<"extra", unknown>;
type HyphenCapability = Capability<"reader-id", unknown>;

export function load(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.reader;
}

export function save(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.writer;
}

export function hyphenated(capabilities: Capabilities<ReadCapability | HyphenCapability>): void {
	capabilities.reader;
}

export function grouped(
	capabilities: Capabilities<ExtraCapability | ReadCapability | WriteCapability>,
): void {
	capabilities.reader;
}

const migration = {
	up: async (capabilities: Capabilities<ReadCapability | WriteCapability>): Promise<void> => {
		capabilities.reader;
	},
};

void migration;
