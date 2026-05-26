import { Capabilities, type Capability } from "@beff/diy";

type ReadCapability = Capability<"reader", unknown>;
type WriteCapability = Capability<"writer", unknown>;
type ExtraCapability = Capability<"extra", unknown>;
type HyphenCapability = Capability<"reader-id", unknown>;
type ReadWriteCapabilities = Capabilities<ReadCapability | WriteCapability>;

declare const readerReplacement: unknown;

export function load(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.reader;
}

export function save(capabilities: Capabilities<ReadCapability | WriteCapability>): void {
	capabilities.writer;
}

export function aliased(capabilities: ReadWriteCapabilities): void {
	capabilities.reader;
}

export function hyphenated(capabilities: Capabilities<ReadCapability | HyphenCapability>): void {
	capabilities.reader;
}

export function grouped(
	capabilities: Capabilities<ExtraCapability | ReadCapability | WriteCapability>,
): void {
	capabilities.reader;
}

function needEmpty(capabilities: Capabilities<never>): void {
	void capabilities;
}

function needReader(capabilities: Capabilities<ReadCapability>): void {
	capabilities.reader;
}

function makeEmptyFromObject(value: { readonly reader: unknown }): Capabilities<never> {
	void value;
	return Capabilities.create<never>({});
}

export function passDirectToEmpty(capabilities: Capabilities<ReadCapability>): void {
	needEmpty(capabilities);
}

export function passMergedToEmpty(capabilities: Capabilities<ReadCapability>): void {
	needEmpty(Capabilities.merge(capabilities));
}

export function returnMerged(
	capabilities: Capabilities<ReadCapability>,
): Capabilities<ReadCapability> {
	return Capabilities.merge(capabilities);
}

export function overrideThenForward(capabilities: Capabilities<ReadCapability>): void {
	needReader(Capabilities.override(capabilities, { reader: readerReplacement }));
}

export function arbitraryCallProvider(capabilities: Capabilities<ReadCapability>): void {
	Capabilities.extend(capabilities, makeEmptyFromObject({ reader: readerReplacement }));
}

const operation = {
	up: async (capabilities: Capabilities<ReadCapability | WriteCapability>): Promise<void> => {
		capabilities.reader;
	},
};

void operation;
