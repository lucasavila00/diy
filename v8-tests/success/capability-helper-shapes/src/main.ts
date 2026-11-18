import { Capabilities, type Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;
type ClockCapability = Capability<"clock", { now(): number }>;

function needBoth(capabilities: Capabilities<ReaderCapability | WriterCapability>): void {
	capabilities.writer.write(capabilities.reader.read());
}

function needAll(
	capabilities: Capabilities<ClockCapability | ReaderCapability | WriterCapability>,
): void {
	capabilities.writer.write(`${capabilities.reader.read()} ${capabilities.clock.now()}`);
}

declare const writerBag: Capabilities<WriterCapability>;
declare const clockBag: Capabilities<ClockCapability>;
declare const writer: { write(value: string): void };

// The bag is the first argument. Later arguments give the other services.
export function extendFirst(capabilities: Capabilities<ReaderCapability>): void {
	needBoth(Capabilities.extend(capabilities, writerBag));
}

export function mergeFirst(capabilities: Capabilities<ReaderCapability>): void {
	needAll(Capabilities.merge(capabilities, writerBag, clockBag));
}

// `override` replaces `writer`. The original `writer` is read here.
export function overrideFirst(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	capabilities.writer.write("audit");
	needBoth(Capabilities.override(capabilities, { writer }));
}

// Assign each helper result to a local. Then pass the local as the first argument.
export function chainedLocals(capabilities: Capabilities<ReaderCapability>): void {
	const merged = Capabilities.merge(capabilities, writerBag);
	const extended = Capabilities.extend(merged, clockBag);
	needAll(extended);
}

// A nested helper call without the bag is a normal argument.
export function nestedWithoutBag(capabilities: Capabilities<ReaderCapability>): void {
	needAll(Capabilities.merge(capabilities, Capabilities.merge(writerBag, clockBag)));
}
