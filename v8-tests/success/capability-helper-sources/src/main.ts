import { Capabilities, type Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

function needBoth(capabilities: Capabilities<ReaderCapability | WriterCapability>): void {
	capabilities.writer.write(capabilities.reader.read());
}

declare const extra: Capabilities<WriterCapability>;

// `Partial<...>` keys may be absent, so the original services can still reach `needBoth`.
export function withOverrides(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
	overrides: Partial<Capabilities<ReaderCapability | WriterCapability>>,
): void {
	needBoth(Capabilities.override(capabilities, overrides));
}

// Later arguments shadow earlier ones, so `reader` comes from `capabilities`.
export function mergeSecond(capabilities: Capabilities<ReaderCapability>): void {
	needBoth(Capabilities.merge(extra, capabilities));
}

export function mergeSecondAlias(capabilities: Capabilities<ReaderCapability>): void {
	const merged = Capabilities.merge(extra, capabilities);
	needBoth(merged);
}

export function extendSecond(capabilities: Capabilities<ReaderCapability>): void {
	needBoth(Capabilities.extend(extra, capabilities));
}

export function nestedHelpers(capabilities: Capabilities<ReaderCapability>): void {
	needBoth(Capabilities.extend(Capabilities.merge(capabilities), extra));
}
