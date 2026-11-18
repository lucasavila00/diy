import type { Capabilities } from "@beff/diy";

import type { ReaderCapability } from "./caps.ts";

type Options = { name: string };

export function plain(options: Options): string {
	return options.name;
}

export function scopedAlias(): string {
	type Options = Capabilities<ReaderCapability>;
	const run = (capabilities: Options): string => capabilities.reader.read();
	return run.name;
}
