import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;

declare function inspect(value: unknown): void;

function needReader(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}

function structural(deps: { reader: { read(): string } }): string {
	return deps.reader.read();
}

function nullable(bag: Capabilities<ReaderCapability> | undefined): string {
	return bag == null ? "" : bag.reader.read();
}

export function viaCapabilities(capabilities: Capabilities<ReaderCapability>): string {
	return needReader(capabilities);
}

export function viaStructural(capabilities: Capabilities<ReaderCapability>): string {
	return structural(capabilities);
}

export function viaNullable(capabilities: Capabilities<ReaderCapability>): string {
	return nullable(capabilities);
}

export function viaKeys(capabilities: Capabilities<ReaderCapability>): string[] {
	return Object.keys(capabilities);
}

export function viaUnknown(capabilities: Capabilities<ReaderCapability>): string {
	inspect(capabilities);
	return capabilities.reader.read();
}
