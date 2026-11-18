import { Capabilities, type Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

function needBoth(capabilities: Capabilities<ReaderCapability | WriterCapability>): void {
	capabilities.writer.write(capabilities.reader.read());
}

declare const writerBag: Capabilities<WriterCapability>;
declare const fallback: Capabilities<ReaderCapability | WriterCapability>;

// Not allowed: the bag is not the first argument.
export function mergeBagSecond(capabilities: Capabilities<ReaderCapability>): void {
	needBoth(Capabilities.merge(writerBag, capabilities));
}

// Not allowed: a local alias of the bag is not the first argument.
export function extendAliasSecond(capabilities: Capabilities<ReaderCapability>): void {
	const merged = Capabilities.merge(capabilities);
	needBoth(Capabilities.extend(writerBag, merged));
}

export function overrideBagSecond(
	capabilities: Capabilities<ReaderCapability | WriterCapability>,
): void {
	needBoth(Capabilities.override(fallback, capabilities));
}

// Not allowed: a helper call is inside another helper call.
export function nestedHelpers(capabilities: Capabilities<ReaderCapability>): void {
	needBoth(Capabilities.extend(Capabilities.merge(capabilities), writerBag));
}

// The inner function reports its nested helper call once.
export function nestedInInnerFunction(capabilities: Capabilities<ReaderCapability>): void {
	const inner = (capabilities: Capabilities<ReaderCapability>): void => {
		needBoth(Capabilities.extend(Capabilities.override(capabilities, {}), writerBag));
	};
	inner(capabilities);
}

// Not allowed: the later argument claims every service, so the bag adds nothing.
export function mergeReplacesBag(capabilities: Capabilities<ReaderCapability>): void {
	const merged = Capabilities.merge(
		capabilities,
		Capabilities.create<ReaderCapability | WriterCapability>({
			writer: { write: () => undefined },
		} as unknown as Capabilities<ReaderCapability | WriterCapability>),
	);
	needBoth(merged);
}

// A real unused capability: `writer` is never read or passed on.
export function realUnused(capabilities: Capabilities<ReaderCapability | WriterCapability>): void {
	capabilities.reader.read();
}
