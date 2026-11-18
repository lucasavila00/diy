import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

/**
 * Note: writer is kept for an upcoming change.
 */
// diy-ignore-next-line -- writer is reserved for an upcoming change.
export function suppressed(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): string {
	return capabilities.reader.read();
}

/**
 * Note: the finding is reported at the function, not inside this comment.
 */
export function reported(capabilities: Capabilities<ReaderCapability | WriterCapability>): string {
	return capabilities.reader.read();
}
