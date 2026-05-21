import type { Capabilities, Capability } from "@beff/diy";

type ReadCapability = Capability<"reader", { read(): string }>;
type ReadCapabilities = Capabilities<ReadCapability>;

export function load(capabilities: ReadCapabilities): string {
	return capabilities.reader.read();
}
