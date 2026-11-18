import type { Capabilities, Capability } from "@beff/diy";

import type { ImportedCaps, ReaderCapability, WriterCapability } from "./caps.ts";

type Caps<Allowed extends Capability<string, unknown>> = Capabilities<Allowed>;
type Options = { readonly name: string };

export function viaImportedAlias(capabilities: ImportedCaps): string {
	return capabilities.reader.read();
}

export function viaInlineImport(
	capabilities: import("@beff/diy").Capabilities<ReaderCapability>,
): string {
	return capabilities.reader.read();
}

export function viaGenericAlias(capabilities: Caps<ReaderCapability | WriterCapability>): string {
	return capabilities.reader.read();
}

export function viaGenericAliasOfNever(_capabilities: Caps<never>): string {
	return "static";
}

export function viaLocalAlias(): string {
	type LocalCaps = Capabilities<ReaderCapability>;
	const run = (capabilities: LocalCaps): string => capabilities.reader.read();
	return run.name;
}

// A function-local alias does not change how the top-level `Options` is read.
export function plain(options: Options): string {
	return options.name;
}

export function viaShadowingLocalAlias(): string {
	type Options = Capabilities<ReaderCapability>;
	const run = (capabilities: Options): string => capabilities.reader.read();
	return run.name;
}
