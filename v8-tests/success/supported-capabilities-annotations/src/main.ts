import type { Capabilities, Capability } from "@beff/diy";

type ReaderCapability = Capability<"reader", { read(): string }>;
type WriterCapability = Capability<"writer", { write(value: string): void }>;

type ReaderCaps = Capabilities<ReaderCapability>;
export type AppCaps = Capabilities<ReaderCapability | WriterCapability>;
type ChainedCaps = ReaderCaps;
type Options = { readonly name: string };

export function direct(capabilities: Capabilities<ReaderCapability>): string {
	return capabilities.reader.read();
}

export function viaAlias(capabilities: ReaderCaps): string {
	return capabilities.reader.read();
}

export function viaExportedAlias(capabilities: AppCaps): void {
	capabilities.writer.write(capabilities.reader.read());
}

export function viaChainedAlias(capabilities: ChainedCaps): string {
	return capabilities.reader.read();
}

// Only top-level aliases are read: the local `Options` below does not turn
// this `options` parameter into a capabilities parameter.
export function plain(options: Options): string {
	return options.name;
}

export function localAliasElsewhere(): string {
	type Options = Capabilities<ReaderCapability>;
	const local: Options | null = null;
	return String(local);
}
