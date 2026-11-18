import type * as caps from "./caps.ts";
import type { ReaderCapability, ReaderCaps, WriterCapability } from "./caps.ts";
import type DefaultCaps from "./default-caps.ts";
import { Capabilities } from "./diy.ts";

export function viaImportedAlias(capabilities: ReaderCaps): string {
	return capabilities.reader.read();
}

export function viaNamespace(capabilities: caps.ReaderCaps): string {
	return capabilities.reader.read();
}

export function viaDefaultExport(capabilities: DefaultCaps): string {
	return capabilities.reader.read();
}

export function viaBarrel(capabilities: Capabilities<ReaderCapability | WriterCapability>): void {
	void Capabilities;
	capabilities.writer.write(capabilities.reader.read());
}

export function viaImportType(
	capabilities: import("@beff/diy").Capabilities<ReaderCapability>,
): string {
	return capabilities.reader.read();
}

export function viaLocalImportType(capabilities: import("./caps.ts").ReaderCaps): string {
	return capabilities.reader.read();
}
