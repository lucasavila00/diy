import { Capabilities, type Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

declare const writer: { write(value: string): void };

// The original `writer` is never used; only the replacement is read.
export function replaceWriter(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	const replaced = Capabilities.override(capabilities, { writer });
	replaced.writer.write(capabilities.reader.read());
}

export function replaceWriterElementRead(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	const replaced = Capabilities.override(capabilities, { writer });
	replaced["writer"].write(replaced.reader.read());
}

// Allowed: the original `writer` is read before it is replaced.
export function auditAndReplaceWriter(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	capabilities.writer.write("audit");
	const replaced = Capabilities.override(capabilities, { writer });
	replaced.writer.write(replaced.reader.read());
}
