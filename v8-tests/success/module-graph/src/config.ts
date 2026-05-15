import type { Capabilities } from "@beff/diy";

import type { FsCapability } from "./deps.ts";

export function readConfig(capabilities: Capabilities<FsCapability>): void {
	capabilities.fs;
}
