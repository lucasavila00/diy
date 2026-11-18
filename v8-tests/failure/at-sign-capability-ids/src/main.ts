import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type ScopedCapability = Capability<"@scope/logger", { log(message: string): void }>;
type UnderscoreCapability = Capability<"__internal", { flush(): void }>;

export function scoped(capabilities: Capabilities<ReaderCapability | ScopedCapability>): string {
	return capabilities.reader.read();
}

export function scopedOnly(capabilities: Capabilities<ScopedCapability>): void {
	capabilities["@scope/logger"].log("x");
}

export function underscored(
	capabilities: Capabilities<ReaderCapability | UnderscoreCapability>,
): string {
	return capabilities.reader.read();
}

export function underscoredOnly(capabilities: Capabilities<UnderscoreCapability>): void {
	capabilities.__internal.flush();
}
