import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

// diy-ignore-next-line -- writer is reserved for an upcoming change
export function overDeclared(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): string {
	return capabilities.reader.read();
}
