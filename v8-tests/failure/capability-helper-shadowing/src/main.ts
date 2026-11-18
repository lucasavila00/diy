import { Capabilities, type Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

function needBoth(capabilities: Capabilities<ReaderCapability | WriterCapability>): void {
	capabilities.writer.write(capabilities.reader.read());
}

declare const extraReader: Capabilities<ReaderCapability>;
declare const extraWriter: Capabilities<WriterCapability>;
declare const writerOnly: { writer: { write(value: string): void } };

// A non-literal replacement with a required `writer` key still replaces `writer`.
export function overrideRequiredKey(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	needBoth(Capabilities.override(capabilities, writerOnly));
}

// `extraReader` comes after the bag and shadows its `reader`; the bag shadows `extraWriter`.
export function mergeShadowedAfterBag(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	needBoth(Capabilities.merge(extraWriter, capabilities, extraReader));
}

// The outer `extend` shadows the bag's `writer` passed through the nested `merge`.
export function nestedHelperShadows(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	needBoth(Capabilities.extend(Capabilities.merge(capabilities), extraWriter));
}
