import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;

function needReader(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}

function forwardGeneric<Allowed extends Capability<string, unknown>>(
	capabilities: Capabilities<Allowed>,
	next: (capabilities: Capabilities<Allowed>) => string,
): string {
	return next(capabilities);
}

export function viaGeneric(capabilities: Capabilities<ReaderCapability>): string {
	return forwardGeneric(capabilities, needReader);
}
