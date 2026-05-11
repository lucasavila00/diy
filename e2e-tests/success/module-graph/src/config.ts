import type { Capabilities, FsCapability } from "./deps.ts";

export function readConfig(capabilities: Capabilities<FsCapability>): void {
	capabilities.need("core.fs");
}
