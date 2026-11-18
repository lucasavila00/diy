import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

export function run(capabilities: Capabilities<ReaderCapability | WriterCapability>): string {
	return capabilities.reader.read();
}
