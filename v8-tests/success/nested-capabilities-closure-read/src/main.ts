import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

export function outer(
	capabilities: Capabilities<ReaderCapability>,
): (_capabilities: Capabilities<never>) => string {
	return (_capabilities: Capabilities<never>) => capabilities.reader.read();
}

export function shadowed(
	capabilities: Capabilities<ReaderCapability>,
): (capabilities: Capabilities<WriterCapability>) => void {
	const value = capabilities.reader.read();
	return (capabilities: Capabilities<WriterCapability>) => capabilities.writer.write(value);
}
