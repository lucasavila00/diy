import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;

export function read(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}
