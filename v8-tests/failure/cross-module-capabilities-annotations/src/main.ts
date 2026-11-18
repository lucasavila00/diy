import type { AppCaps, ReaderCapability, WriterCapability } from "./caps.ts";
import { Capabilities } from "./diy.ts";

export function viaImportedAlias(capabilities: AppCaps): string {
	return capabilities.reader.read();
}

export function viaBarrel(capabilities: Capabilities<ReaderCapability | WriterCapability>): string {
	void Capabilities;
	return capabilities.reader.read();
}

export function renamedViaBarrel(
	id: string,
	deps: Capabilities<ReaderCapability | WriterCapability>,
): string {
	return id;
}

export function viaImportType(
	capabilities: import("@beff/diy").Capabilities<ReaderCapability | WriterCapability>,
): string {
	return capabilities.reader.read();
}

export function scopedAlias(): string {
	type Options = Capabilities<ReaderCapability | WriterCapability>;
	const run = (capabilities: Options): string => capabilities.reader.read();
	return run.name;
}

// @ts-expect-error -- cyclic aliases never resolve to DIY Capabilities.
type CyclicCaps = OtherCyclicCaps;
// @ts-expect-error -- cyclic aliases never resolve to DIY Capabilities.
type OtherCyclicCaps = CyclicCaps;

export function cyclic(capabilities: CyclicCaps): void {
	void capabilities;
}
